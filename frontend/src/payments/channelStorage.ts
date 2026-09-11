import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import type { BatchSettlementClientContext, ClientChannelStorage } from "./x402-lite";

/** Side record kept next to the SDK channel context so the wallet sheet can list active locks. */
export type ChannelMeta = {
  channelId: string;
  sessionId: string;
  videoId: string;
  videoTitle: string;
  closeUrl: string;
  lockedAmount: string;
  createdAt: number;
};

let store: UseStore | undefined;
function db(): UseStore {
  store ??= createStore("hederatube", "channels");
  return store;
}

const ctxKey = (payer: string, channelId: string) => `ctx:${payer.toLowerCase()}:${channelId.toLowerCase()}`;
const metaKey = (payer: string, channelId: string) => `meta:${payer.toLowerCase()}:${channelId.toLowerCase()}`;

/**
 * `ClientChannelStorage` over IndexedDB, namespaced per payer address. The SDK's in-memory
 * storage loses channel state on reload, which would force a corrective 402 or a second deposit.
 */
export function createChannelStorage(payer: string): ClientChannelStorage {
  return {
    get: key => get<BatchSettlementClientContext>(ctxKey(payer, key), db()),
    set: (key, context) => set(ctxKey(payer, key), context, db()),
    delete: async key => {
      await del(ctxKey(payer, key), db());
      await del(metaKey(payer, key), db());
    },
  };
}

export const channelMeta = {
  save: (payer: string, meta: ChannelMeta) => set(metaKey(payer, meta.channelId), meta, db()),
  get: (payer: string, channelId: string) => get<ChannelMeta>(metaKey(payer, channelId), db()),
  remove: (payer: string, channelId: string) => del(metaKey(payer, channelId), db()),
  /** Channels that still hold a deposit (balance > charged) for this payer. */
  async listActive(payer: string): Promise<(ChannelMeta & { context: BatchSettlementClientContext })[]> {
    const all = await entries<string, unknown>(db());
    const prefix = `meta:${payer.toLowerCase()}:`;
    const result: (ChannelMeta & { context: BatchSettlementClientContext })[] = [];
    for (const [key, value] of all) {
      if (!key.startsWith(prefix)) continue;
      const meta = value as ChannelMeta;
      const context = await get<BatchSettlementClientContext>(ctxKey(payer, meta.channelId), db());
      if (!context?.balance || context.balance === "0") continue;
      if (BigInt(context.balance) <= BigInt(context.chargedCumulativeAmount ?? "0")) continue;
      result.push({ ...meta, context });
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  },
};
