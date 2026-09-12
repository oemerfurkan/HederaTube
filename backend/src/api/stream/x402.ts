import type { PaymentOption, RoutesConfig } from "@x402/core/http";
import { paymentMiddlewareFromHTTPServer, x402HTTPResourceServer, x402ResourceServer } from "@x402/express";
import { eq, sql as raw } from "drizzle-orm";
import { db } from "../../shared/db/client.js";
import { sessions } from "../../shared/db/schema.js";
import { recordCharge } from "../../shared/db/queries.js";
import { classifySegment } from "../../shared/accounting.js";
import { maxChunkAmount } from "../../shared/price.js";
import { env } from "../../shared/env.js";
import { logger } from "../../shared/logger.js";
import { NETWORK, USDC_TOKEN_ID } from "../../shared/hedera.js";
import { getX402Runtime } from "../../shared/x402/scheme.js";
import { requestSettlementSoon } from "../../shared/queues.js";
import { currentStream } from "./context.js";

const ERR_PAYLOAD_TYPE = "invalid_batch_settlement_hedera_payload_type";
const ERR_CHANNEL_MISMATCH = "invalid_batch_settlement_hedera_channel_id_mismatch";
const ERR_DEPOSIT_BELOW_MIN = "invalid_batch_settlement_hedera_deposit_below_min_deposit";

type PayloadLike = {
  type?: string;
  voucher?: { channelId?: string };
  deposit?: { amount?: string };
};

function requireStream() {
  const ctx = currentStream();
  if (!ctx) throw new Error("stream context missing: is loadSession mounted before the payment middleware?");
  return ctx;
}

function paymentOption(): PaymentOption {
  return {
    scheme: "batch-settlement",
    network: NETWORK,
    maxTimeoutSeconds: env.MAX_TIMEOUT_SECONDS,
    payTo: () => requireStream().creator.hedera_account_id,
    price: () => {
      const { session } = requireStream();
      return {
        amount: maxChunkAmount(BigInt(session.locked_amount), session.priced_chunk_count).toString(),
        asset: USDC_TOKEN_ID,
        // Announces the video price as the deposit target; the scheme enforces it (enforceMinDeposit).
        extra: { minDeposit: session.locked_amount },
      };
    },
  };
}

const unpaid = () => ({ contentType: "application/json", body: { error: "payment required" } });

export async function buildPaymentMiddleware(): Promise<unknown> {
  const { scheme, facilitator } = await getX402Runtime();
  const resourceServer = new x402ResourceServer(facilitator).register(NETWORK, scheme);

  const routes: RoutesConfig = {
    "GET /stream/:videoId/lock": { accepts: paymentOption(), description: "Lock the full video price", mimeType: "application/json", unpaidResponseBody: unpaid },
    "GET /stream/:videoId/seg-*": { accepts: paymentOption(), description: "Video segment (first of each 5 s chunk is paid)", mimeType: "video/mp2t", unpaidResponseBody: unpaid },
    "GET /stream/:videoId/close": { accepts: paymentOption(), description: "Close the session and refund unwatched time", mimeType: "application/json", unpaidResponseBody: unpaid },
  };
  const httpServer = new x402HTTPResourceServer(resourceServer, routes);

  // Free paths never touch payment: preview chunks, second segments, already-paid chunks.
  httpServer.onProtectedRequest(async () => {
    const ctx = currentStream();
    if (!ctx || ctx.route !== "segment" || ctx.segmentIndex === undefined) return;
    const cls = classifySegment(ctx.session, ctx.segmentIndex);
    if (cls.kind !== "paid") return { grantAccess: true };
    return;
  });

  // Guards that run before the scheme's own verification.
  resourceServer.onBeforeVerify(async hook => {
    const ctx = currentStream();
    if (!ctx) return { abort: true, reason: ERR_CHANNEL_MISMATCH, message: "No session context" };
    const payload = hook.paymentPayload.payload as PayloadLike;
    const type = payload.type;
    const channelId = payload.voucher?.channelId?.toLowerCase();
    if (ctx.route === "lock") {
      if (type !== "deposit") return { abort: true, reason: ERR_PAYLOAD_TYPE, message: "Lock requires a deposit payload" };
      if (ctx.session.status !== "locked" || ctx.session.lock_tx) {
        return { abort: true, reason: ERR_CHANNEL_MISMATCH, message: "Session is already locked" };
      }
      if (payload.deposit?.amount !== ctx.session.locked_amount) {
        return { abort: true, reason: ERR_DEPOSIT_BELOW_MIN, message: `Deposit must equal the video price ${ctx.session.locked_amount}` };
      }
      return;
    }
    if (ctx.route === "segment") {
      if (type !== "voucher") return { abort: true, reason: ERR_PAYLOAD_TYPE, message: "Segment requires a voucher payload" };
      if (!ctx.session.channel_id || !ctx.session.lock_tx) return { abort: true, reason: ERR_CHANNEL_MISMATCH, message: "Lock first" };
      if (ctx.session.channel_id.toLowerCase() !== channelId) return { abort: true, reason: ERR_CHANNEL_MISMATCH, message: "Channel belongs to another session" };
      return;
    }
    if (ctx.route === "close") {
      if (type !== "refund") return { abort: true, reason: ERR_PAYLOAD_TYPE, message: "Close requires a refund payload" };
      if (!ctx.session.channel_id || ctx.session.channel_id.toLowerCase() !== channelId) {
        return { abort: true, reason: ERR_CHANNEL_MISMATCH, message: "Channel belongs to another session" };
      }
      return;
    }
    return { abort: true, reason: ERR_PAYLOAD_TYPE, message: "Not a paid route" };
  });

  // Persistence: the only place session money fields change on the request path.
  resourceServer.onAfterSettle(async hook => {
    const ctx = currentStream();
    if (!ctx || !hook.result.success) return;
    const payload = hook.paymentPayload.payload as PayloadLike;
    const extra = (hook.result.extra ?? {}) as { chargedAmount?: string; channelState?: { chargedCumulativeAmount?: string } };
    const now = new Date();
    try {
      if (payload.type === "deposit" && ctx.route === "lock") {
        await db
          .update(sessions)
          .set({ channel_id: payload.voucher?.channelId?.toLowerCase(), lock_tx: hook.result.transaction || null, status: "locked", last_activity_at: now })
          .where(eq(sessions.id, ctx.session.id));
      } else if (payload.type === "voucher" && ctx.route === "segment" && ctx.segmentIndex !== undefined) {
        const cls = classifySegment(ctx.session, ctx.segmentIndex);
        const delta = BigInt(extra.chargedAmount ?? "0");
        const cumulative = extra.channelState?.chargedCumulativeAmount;
        if (delta > 0n && cls.kind === "paid" && cumulative !== undefined) {
          await recordCharge(ctx.session.id, cls.chunk, cls.pricedIndex, delta.toString(), cumulative);
        }
        const paidChunks = cls.kind === "paid" ? [...new Set([...ctx.session.paid_chunks, cls.chunk])].sort((a, b) => a - b) : ctx.session.paid_chunks;
        await db
          .update(sessions)
          .set({
            paid_chunks: paidChunks,
            chunks_consumed: paidChunks.length,
            consumed_amount: cumulative !== undefined ? cumulative : sessions.consumed_amount,
            chunks_served: raw`greatest(${sessions.chunks_served}, ${cls.chunk + 1})`,
            status: "streaming",
            last_activity_at: now,
          })
          .where(eq(sessions.id, ctx.session.id));
      } else if (payload.type === "refund" && ctx.route === "close") {
        await db
          .update(sessions)
          .set({
            refunded_amount: hook.result.amount || "0",
            refund_tx: hook.result.transaction || null,
            status: "closed",
            ended_at: now,
            close_reason: "refund",
            last_activity_at: now,
          })
          .where(eq(sessions.id, ctx.session.id));
        void requestSettlementSoon();
      }
    } catch (err) {
      logger.error({ err, sessionId: ctx.session.id, type: payload.type }, "failed to persist settlement");
    }
  });

  resourceServer.onSettleFailure(async hook => {
    logger.warn({ sessionId: currentStream()?.session.id, err: hook.error.message }, "settle failed");
  });
  resourceServer.onVerifyFailure(async hook => {
    logger.warn({ sessionId: currentStream()?.session.id, err: hook.error.message }, "verify failed");
  });

  await httpServer.initialize();
  logger.info({ facilitator: env.FACILITATOR_URL, network: NETWORK }, "x402 resource server ready");
  return paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false);
}
