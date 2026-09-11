import { HTTPFacilitatorClient } from "@x402/core/server";
import { BatchSettlementHederaScheme } from "@x402/hedera/batch-settlement/server";
import { RedisChannelStorage } from "@x402/hedera/batch-settlement/server/redis-storage";
import { createAccountKeyResolver, type AccountKeyResolver } from "@x402/hedera/batch-settlement";
import { env, MIRROR_NODE_URL } from "../env.js";
import { createChannelStorageClient } from "../redis.js";
import { getAuthorizerSigner, NETWORK } from "../hedera.js";

/**
 * The SDK resolver caches negative lookups for 5 minutes. A viewer's account is hollow (no key)
 * until its first outgoing transaction, so a negative result must not stick.
 */
function nonCachingOnFailureResolver(): AccountKeyResolver {
  const cached = createAccountKeyResolver({ mirrorNodeUrl: MIRROR_NODE_URL, cacheTtlMs: 60_000 });
  const uncached = createAccountKeyResolver({ mirrorNodeUrl: MIRROR_NODE_URL, cacheTtlMs: 0, cacheSize: 1 });
  return async account => {
    const result = await cached(account);
    return result.ok ? result : uncached(account);
  };
}

export type X402Runtime = {
  scheme: BatchSettlementHederaScheme;
  facilitator: HTTPFacilitatorClient;
  storageClient: ReturnType<typeof createChannelStorageClient>;
};

let runtime: Promise<X402Runtime> | undefined;

/** One scheme instance per process (api and worker build the same thing over the same Redis storage). */
export function getX402Runtime(): Promise<X402Runtime> {
  runtime ??= (async () => {
    const storageClient = createChannelStorageClient();
    const scheme = new BatchSettlementHederaScheme(env.SEED_CREATOR_ACCOUNT_ID, {
      receiverAuthorizerSigner: await getAuthorizerSigner(),
      withdrawDelay: env.WITHDRAW_DELAY_SECONDS,
      enforceMinDeposit: true,
      mirrorNodeUrl: MIRROR_NODE_URL,
      storage: new RedisChannelStorage({ client: storageClient, keyPrefix: "hederatube:channel:" }),
      accountKeyResolver: nonCachingOnFailureResolver(),
    });
    const facilitator = new HTTPFacilitatorClient({ url: env.FACILITATOR_URL, timeoutMs: 90_000 });
    return { scheme, facilitator, storageClient };
  })();
  return runtime;
}

export { NETWORK };
