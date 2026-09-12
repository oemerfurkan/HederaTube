import { api, ApiError } from "@/api/client";
import type { SessionStatus } from "@/api/types";
import { channelMeta, type ChannelMeta } from "./channelStorage";
import { createSessionPaymentClient } from "./x402Client";
import type { ClientHederaBatchSigner } from "./x402-lite";

export type ActiveLock = ChannelMeta & { status: SessionStatus };

const OVER: ReadonlySet<SessionStatus> = new Set(["closed", "settled", "failed"]);

/**
 * Local channel records that the server still considers open. The browser only learns about a
 * refund it made itself; the sweeper's refunds and a lost close leave records behind, so every
 * candidate is checked against its receipt and stale ones are pruned on the way out.
 */
export async function loadActiveLocks(payer: string): Promise<ActiveLock[]> {
  const local = await channelMeta.listActive(payer);
  const kept: ActiveLock[] = [];
  await Promise.all(
    local.map(async lock => {
      let status: SessionStatus | "gone" | "unknown";
      try {
        status = (await api.receipt(lock.sessionId)).status;
      } catch (error) {
        status = error instanceof ApiError && error.status === 404 ? "gone" : "unknown";
      }
      if (status === "gone" || (status !== "unknown" && OVER.has(status))) {
        await channelMeta.prune(payer, lock.channelId);
        return;
      }
      kept.push({ ...lock, status: status === "unknown" ? "locked" : status });
    }),
  );
  return kept.sort((a, b) => b.createdAt - a.createdAt);
}

export type ReleaseOutcome = { kind: "released"; tx?: string } | { kind: "already" };

/**
 * Cooperative refund of one lock outside the player. When the server no longer has the channel
 * (already refunded, or the session is over) the deposit is not held any more, so the record is
 * pruned and the session is marked closing for the books, instead of failing silently.
 */
export async function releaseLock(signer: ClientHederaBatchSigner, lock: ChannelMeta): Promise<ReleaseOutcome> {
  const payment = createSessionPaymentClient({
    signer,
    session: { sessionId: lock.sessionId, price: BigInt(lock.lockedAmount), pricedChunks: 1, closeUrl: lock.closeUrl },
  });
  try {
    const settle = await payment.scheme.refund(lock.closeUrl);
    await channelMeta.prune(signer.evmAddress, lock.channelId);
    return { kind: "released", tx: settle.transaction || undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/channel_not_found|expected 402, got (404|409)/.test(message)) {
      await channelMeta.prune(signer.evmAddress, lock.channelId);
      await api.closeSession(lock.sessionId, "release").catch(() => undefined);
      return { kind: "already" };
    }
    throw error;
  }
}
