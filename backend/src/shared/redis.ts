import { createClient } from "redis";
import { Redis } from "ioredis";
import type { RedisChannelStorageClient } from "@x402/hedera/batch-settlement/server/redis-storage";
import { env } from "./env.js";
import { logger } from "./logger.js";

/** node-redis adapter for the x402 RedisChannelStorage (it needs get/set/del/eval/scanIterator). */
export function createChannelStorageClient(url = env.REDIS_URL): RedisChannelStorageClient & { disconnect(): Promise<void> } {
  const client = createClient({ url });
  client.on("error", err => logger.error({ err }, "redis (channel storage) error"));
  let connecting: Promise<typeof client> | undefined;
  const ensure = () => {
    if (!connecting) connecting = client.connect().then(() => client);
    return connecting;
  };
  const str = (v: unknown): string | null => (v == null ? null : typeof v === "string" ? v : String(v));
  return {
    get: key => ensure().then(c => c.get(key)).then(str),
    set: (key, value, opts) =>
      ensure()
        .then(c => {
          if (opts?.NX) return c.set(key, value, { NX: true, ...(opts.PX !== undefined ? { PX: opts.PX } : {}) });
          if (opts?.PX !== undefined) return c.set(key, value, { PX: opts.PX });
          return c.set(key, value);
        })
        .then(str),
    del: key => ensure().then(c => c.del(key)).then(n => Number(n)),
    eval: (script, options) => ensure().then(c => c.eval(script, options as never)),
    scanIterator: options => {
      const it = ensure().then(c => c.scanIterator(options as never));
      return {
        async *[Symbol.asyncIterator]() {
          for await (const key of await it) yield key as string | string[];
        },
      };
    },
    async disconnect() {
      if (!connecting) return;
      const c = await connecting;
      if (c.isOpen) await c.quit();
    },
  };
}

/** ioredis connection for BullMQ (separate client from the channel storage). */
export function createBullConnection(url = env.REDIS_URL): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
