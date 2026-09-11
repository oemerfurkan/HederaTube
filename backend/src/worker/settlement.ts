import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "../shared/db/client.js";
import { creators, sessions, settlements, videos, type CreatorRow, type SessionRow } from "../shared/db/schema.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/logger.js";
import { newSettlementId } from "../shared/ids.js";
import { getX402Runtime } from "../shared/x402/scheme.js";
import { channelsOfReceiver, managerFor } from "../shared/x402/managers.js";
import type { SettlementResult } from "../shared/queues.js";

/**
 * The settlement job (guide §2.3, mock `runBatch`):
 * 1. sweep abandoned / closing sessions → cooperative refund of balance − charged;
 * 2. per creator: claim outstanding vouchers in batches, then settle escrow → creator in one tx;
 * 3. mark every closed session of that creator settled and link it to the settlement row.
 */
export async function runSettlement(): Promise<SettlementResult> {
  const { scheme } = await getX402Runtime();
  const storage = scheme.getStorage();
  const log = logger.child({ job: "settlement" });
  const now = Date.now();
  const abandonedBefore = new Date(now - env.ABANDONED_AFTER_SECONDS * 1000);

  // 1. Sweeper
  let refunded = 0;
  for (const { s: session, creator } of await sweepCandidates(abandonedBefore)) {
    const channel = session.channel_id ? await storage.get(session.channel_id) : undefined;
    if (channel?.pendingRequest && channel.pendingRequest.expiresAt > now) continue;
    try {
      if (channel) {
        const refundable = BigInt(channel.balance) - BigInt(channel.chargedCumulativeAmount);
        if (refundable > 0n) {
          const manager = await managerFor(creator.hedera_account_id);
          const [result] = await manager.refund([channel.channelId]);
          await closeSession(session.id, refundable.toString(), result?.transaction ?? null, "sweeper");
        } else {
          await closeSession(session.id, "0", null, "sweeper");
        }
      } else {
        // Lock never settled on chain: nothing was pulled from the viewer.
        await closeSession(session.id, session.locked_amount, null, "sweeper-no-channel");
      }
      refunded += 1;
    } catch (err) {
      log.error({ err, sessionId: session.id }, "sweeper refund failed");
    }
  }

  // 2. Claim + settle per creator
  const allChannels = await storage.list();
  const claimTxs: string[] = [];
  let settled = 0;
  let firstSettleTx: string | null = null;
  for (const creator of await db.select().from(creators)) {
    const creatorVideos = db.select({ id: videos.id }).from(videos).where(eq(videos.creator_id, creator.id));
    const closed = await db.select().from(sessions).where(and(eq(sessions.status, "closed"), inArray(sessions.video_id, creatorVideos)));
    // Skip channels with a live request (a refund in flight also claims the voucher itself).
    const notBusy = (c: (typeof allChannels)[number]) => !(c.pendingRequest && c.pendingRequest.expiresAt > Date.now());
    const claimable = channelsOfReceiver(allChannels, creator.hedera_account_id).filter(c => notBusy(c) && BigInt(c.chargedCumulativeAmount) > BigInt(c.totalClaimed));
    if (!claimable.length && !closed.length) continue;

    const manager = await managerFor(creator.hedera_account_id);
    const claimHashes: string[] = [];
    let vouchers = 0;
    if (claimable.length) {
      try {
        for (const r of await manager.claim({ maxClaimsPerBatch: env.MAX_CLAIMS_PER_BATCH, selectClaimChannels: channels => channelsOfReceiver(channels, creator.hedera_account_id).filter(notBusy) })) {
          claimHashes.push(r.transaction);
          vouchers += r.vouchers;
        }
      } catch (err) {
        log.error({ err, creator: creator.hedera_account_id }, "claim failed");
      }
    }
    let settleTx: string | null = null;
    try {
      settleTx = (await manager.settle()).transaction || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/nothing_to_settle/i.test(message)) log.error({ err, creator: creator.hedera_account_id }, "settle failed");
    }
    const txHash = settleTx ?? claimHashes[claimHashes.length - 1];
    if (!txHash) {
      // Nothing left on chain (e.g. the refund already claimed and an earlier batch settled): the
      // closed sessions' money moved with the creator's latest settlement, so link them to it.
      if (closed.length) {
        const [latest] = await db.select().from(settlements).where(eq(settlements.creator_id, creator.id)).orderBy(desc(settlements.submitted_at)).limit(1);
        if (latest) {
          await db.update(sessions).set({ status: "settled", settlement_id: latest.id }).where(inArray(sessions.id, closed.map(s => s.id)));
          settled += closed.length;
          firstSettleTx ??= latest.tx_hash;
          log.info({ creator: creator.hedera_account_id, sessions: closed.length, settlement: latest.id }, "linked closed sessions to the latest settlement");
        }
      }
      continue;
    }

    const id = newSettlementId(creator.id);
    await db.insert(settlements).values({
      id,
      creator_id: creator.id,
      tx_hash: txHash,
      claim_tx_hashes: claimHashes,
      session_count: closed.length,
      voucher_count: vouchers,
      total_to_creators: closed.reduce((a, s) => a + BigInt(s.consumed_amount), 0n).toString(),
      total_refunded: closed.reduce((a, s) => a + BigInt(s.refunded_amount), 0n).toString(),
      confirmed_at: new Date(),
    });
    if (closed.length) {
      await db.update(sessions).set({ status: "settled", settlement_id: id }).where(inArray(sessions.id, closed.map(s => s.id)));
    }
    settled += closed.length;
    claimTxs.push(...claimHashes);
    firstSettleTx ??= txHash;
    log.info({ creator: creator.hedera_account_id, sessions: closed.length, vouchers, claimHashes, settleTx }, "settled");
  }

  return { settled, txHash: firstSettleTx, refunded, claims: claimTxs };
}

async function sweepCandidates(abandonedBefore: Date): Promise<{ s: SessionRow; creator: CreatorRow }[]> {
  return db
    .select({ s: sessions, creator: creators })
    .from(sessions)
    .innerJoin(videos, eq(sessions.video_id, videos.id))
    .innerJoin(creators, eq(videos.creator_id, creators.id))
    .where(or(eq(sessions.status, "closing"), and(inArray(sessions.status, ["locked", "streaming"]), lt(sessions.last_activity_at, abandonedBefore))));
}

async function closeSession(sessionId: string, refunded: string, refundTx: string | null, reason: string): Promise<void> {
  await db
    .update(sessions)
    .set({ status: "closed", ended_at: new Date(), refunded_amount: refunded, refund_tx: refundTx, close_reason: reason })
    .where(eq(sessions.id, sessionId));
}
