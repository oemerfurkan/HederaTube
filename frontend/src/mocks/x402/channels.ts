import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import { encodePaymentResponseHeader } from "@x402/core/http";
import { BatchSettlementErrors as Errors } from "@/payments/x402-lite";
import { cumulativeAmount } from "@/lib/price";
import { ledgerAdjust, ledgerBalance, nextTxId, persist, type ChannelRow, type MockDb, type SessionRow } from "../db";
import { verifyDepositAuthorization, verifyVoucherSignature, type ParsedPayment, type VerifyFailure } from "./verifyPayload";

/**
 * Server-side channel accounting for the mock. Mirrors the semantics of the vendored server
 * (`batch-settlement/server/verify.ts` + `settle.ts`): cumulative check `maxClaimable ==
 * charged + amount`, one live request per channel, corrective 402 with channel/voucher state,
 * and the cooperative refund. Kept in one file so it can be lifted into the real server.
 */

export type PaymentOutcome =
  | { ok: true; settle: SettleResponse; channel: ChannelRow }
  | (VerifyFailure & { corrective?: Record<string, unknown> });

export function findChannel(db: MockDb, channelId: string): ChannelRow | undefined {
  return db.channels.find(c => c.channelId.toLowerCase() === channelId.toLowerCase());
}

function channelState(channel: ChannelRow) {
  return {
    channelId: channel.channelId,
    balance: channel.balance,
    totalClaimed: channel.totalClaimed,
    withdrawRequestedAt: 0,
    refundNonce: channel.refundNonce,
    chargedCumulativeAmount: channel.chargedCumulativeAmount,
  };
}

function corrective(channel: ChannelRow): Record<string, unknown> {
  return {
    channelState: channelState(channel),
    voucherState: { signedMaxClaimable: channel.signedMaxClaimable, signature: channel.signature },
  };
}

function settleOk(channel: ChannelRow, network: string, chargedAmount: bigint, transaction = ""): SettleResponse {
  return {
    success: true,
    payer: channel.payer.toLowerCase() as `0x${string}`,
    transaction,
    network: network as SettleResponse["network"],
    amount: "",
    extra: { chargedAmount: chargedAmount.toString(), channelState: channelState(channel) },
  };
}

/** Lock route: deposit-only. Charges nothing; opens the channel with balance = video price. */
export async function processDeposit(
  db: MockDb,
  parsed: ParsedPayment,
  requirements: PaymentRequirements,
  session: SessionRow,
): Promise<PaymentOutcome> {
  if (parsed.kind !== "deposit") {
    return { ok: false, reason: Errors.ErrAllowanceAuthorizationRequired, message: "Lock requires a deposit payload" };
  }
  const { payload } = parsed;
  const channelId = payload.voucher.channelId;
  const existing = findChannel(db, channelId);
  if (existing && BigInt(existing.balance) > 0n) {
    return { ok: false, reason: Errors.ErrCumulativeAmountMismatch, message: "Channel already funded", corrective: corrective(existing) };
  }
  const minDeposit = BigInt(String(requirements.extra?.minDeposit ?? "0"));
  const amount = BigInt(payload.deposit.amount);
  if (amount < minDeposit) {
    return { ok: false, reason: Errors.ErrDepositBelowMinDeposit, message: "Deposit amount is below the server minimum" };
  }
  const sigErr = await verifyVoucherSignature(parsed, requirements);
  if (sigErr) return sigErr;
  if (BigInt(payload.voucher.maxClaimableAmount) !== BigInt(requirements.amount)) {
    return { ok: false, reason: Errors.ErrCumulativeAmountMismatch, message: "Client voucher base does not match server state" };
  }
  const usedNonces = db.channels.flatMap(c => c.usedDepositNonces);
  const authErr = await verifyDepositAuthorization(payload, requirements, usedNonces);
  if (authErr) return authErr;

  const payer = payload.channelConfig.payer;
  if (ledgerBalance(db, payer) < amount) {
    return { ok: false, reason: Errors.ErrInsufficientBalance, message: "Insufficient USDC balance" };
  }
  ledgerAdjust(db, payer, -amount);
  const nonce = payload.deposit.authorization.hederaAllowanceAuthorization.nonce;
  const channel: ChannelRow = {
    channelId,
    sessionId: session.id,
    payer,
    payerAuthorizer: payload.channelConfig.payerAuthorizer,
    chargedCumulativeAmount: "0",
    signedMaxClaimable: payload.voucher.maxClaimableAmount,
    signature: payload.voucher.signature,
    balance: amount.toString(),
    totalClaimed: "0",
    refundNonce: "0",
    pendingRequest: false,
    lastRequestTimestamp: Date.now(),
    usedDepositNonces: [nonce],
  };
  db.channels = db.channels.filter(c => c.channelId.toLowerCase() !== channelId.toLowerCase()).concat(channel);
  const tx = nextTxId(db);
  session.lock_tx = tx;
  session.channel_id = channelId;
  session.status = "locked";
  persist();
  return { ok: true, settle: settleOk(channel, requirements.network, 0n, tx), channel };
}

/** Paid segment: one cumulative voucher charges the delta for the next priced chunk. */
export async function processVoucher(
  db: MockDb,
  parsed: ParsedPayment,
  requirements: PaymentRequirements,
  session: SessionRow,
  chunkIndex: number,
): Promise<PaymentOutcome> {
  if (parsed.kind !== "voucher") {
    return { ok: false, reason: Errors.ErrInvalidPayloadType, message: "Segment requires a voucher payload" };
  }
  const channel = findChannel(db, parsed.payload.voucher.channelId);
  if (!channel) {
    return { ok: false, reason: Errors.ErrMissingChannel, message: "No channel record; lock first" };
  }
  if (channel.sessionId !== session.id) {
    return { ok: false, reason: Errors.ErrChannelIdMismatch, message: "Channel belongs to another session" };
  }
  if (channel.pendingRequest && Date.now() - channel.lastRequestTimestamp < 30_000) {
    return { ok: false, reason: Errors.ErrChannelBusy, message: "Channel is already processing a request" };
  }
  const charged = BigInt(channel.chargedCumulativeAmount);
  const expected = charged + BigInt(requirements.amount);
  if (BigInt(parsed.payload.voucher.maxClaimableAmount) !== expected) {
    return {
      ok: false,
      reason: Errors.ErrCumulativeAmountMismatch,
      message: "Client voucher base does not match server state",
      corrective: corrective(channel),
    };
  }
  const sigErr = await verifyVoucherSignature(parsed, requirements);
  if (sigErr) return sigErr;

  channel.pendingRequest = true;
  channel.lastRequestTimestamp = Date.now();
  try {
    const pricedIndex = chunkIndex - session.free_preview_chunks; // 0-based priced chunk
    const k = Math.max(1, Math.min(session.priced_chunk_count, pricedIndex + 1));
    const alreadyPaid = session.chunks_consumed >= k;
    const target = cumulativeAmount(BigInt(session.locked_amount), Math.max(k, session.chunks_consumed), session.priced_chunk_count);
    const delta = alreadyPaid ? 0n : target - charged;
    if (charged + delta > BigInt(channel.balance)) {
      return { ok: false, reason: Errors.ErrCumulativeExceedsBalance, message: "Charge exceeds locked balance" };
    }
    channel.chargedCumulativeAmount = (charged + delta).toString();
    channel.signedMaxClaimable = parsed.payload.voucher.maxClaimableAmount;
    channel.signature = parsed.payload.voucher.signature;
    if (!alreadyPaid) {
      session.chunks_consumed = k;
      session.consumed_amount = channel.chargedCumulativeAmount;
    }
    session.chunks_served = Math.max(session.chunks_served, chunkIndex + 1);
    session.status = "streaming";
    persist();
    return { ok: true, settle: settleOk(channel, requirements.network, delta), channel };
  } finally {
    channel.pendingRequest = false;
    persist();
  }
}

/** Cooperative refund: zero-charge voucher; drains balance − charged back to the viewer. */
export async function processRefund(
  db: MockDb,
  parsed: ParsedPayment,
  requirements: PaymentRequirements,
  session: SessionRow,
): Promise<PaymentOutcome> {
  if (parsed.kind !== "refund") {
    return { ok: false, reason: Errors.ErrRefundPayload, message: "Close requires a refund payload" };
  }
  const channel = findChannel(db, parsed.payload.voucher.channelId);
  if (!channel) {
    return { ok: false, reason: Errors.ErrMissingChannel, message: "No channel record" };
  }
  const charged = BigInt(channel.chargedCumulativeAmount);
  if (BigInt(parsed.payload.voucher.maxClaimableAmount) !== charged) {
    return {
      ok: false,
      reason: Errors.ErrCumulativeAmountMismatch,
      message: "Client voucher base does not match server state",
      corrective: corrective(channel),
    };
  }
  const sigErr = await verifyVoucherSignature(parsed, requirements);
  if (sigErr) return sigErr;
  const claimed = BigInt(channel.totalClaimed);
  const floor = charged > claimed ? charged : claimed;
  const refundable = BigInt(channel.balance) - floor;
  if (refundable <= 0n) {
    return { ok: false, reason: Errors.ErrRefundNoBalance, message: "Channel has no refundable balance" };
  }
  const requested = parsed.payload.amount !== undefined ? BigInt(parsed.payload.amount) : refundable;
  const amount = requested > refundable ? refundable : requested;
  ledgerAdjust(db, channel.payer, amount);
  channel.balance = (BigInt(channel.balance) - amount).toString();
  channel.refundNonce = (BigInt(channel.refundNonce) + 1n).toString();
  const tx = nextTxId(db);
  closeSession(session, amount.toString(), tx);
  persist();
  const settle = settleOk(channel, requirements.network, 0n, tx);
  return { ok: true, settle: { ...settle, amount: amount.toString() }, channel };
}

export function closeSession(session: SessionRow, refunded: string, refundTx: string | null): void {
  session.status = "closed";
  session.ended_at = new Date().toISOString();
  session.refunded_amount = refunded;
  session.refund_tx = refundTx;
}

/** A session with no paid request for this long is treated as abandoned by the sweeper (a tab closed without a refund). */
export const ABANDONED_AFTER_MS = 90_000;

/** Sweeper + batch claim: refunds abandoned sessions, then settles every closed session in one fake tx. */
export function runBatch(db: MockDb): { settled: number; txHash: string | null; refunded: number } {
  let refunded = 0;
  for (const session of db.sessions) {
    const channel = session.channel_id ? findChannel(db, session.channel_id) : undefined;
    const idleMs = channel ? Date.now() - channel.lastRequestTimestamp : Date.now() - Date.parse(session.started_at);
    const abandoned =
      (session.status === "locked" || session.status === "streaming") && !channel?.pendingRequest && idleMs > ABANDONED_AFTER_MS;
    if (session.status === "closing" || abandoned) {
      if (channel) {
        const charged = BigInt(channel.chargedCumulativeAmount);
        const refundable = BigInt(channel.balance) - charged;
        if (refundable > 0n) {
          ledgerAdjust(db, channel.payer, refundable);
          channel.balance = charged.toString();
          channel.refundNonce = (BigInt(channel.refundNonce) + 1n).toString();
        }
        closeSession(session, refundable > 0n ? refundable.toString() : "0", nextTxId(db));
        refunded += 1;
      } else {
        closeSession(session, session.locked_amount, null);
      }
    }
  }
  const closed = db.sessions.filter(s => s.status === "closed");
  if (!closed.length) {
    persist();
    return { settled: 0, txHash: null, refunded };
  }
  const txHash = nextTxId(db);
  const id = `batch-${db.txCounter}`;
  let toCreators = 0n;
  let totalRefunded = 0n;
  for (const session of closed) {
    session.status = "settled";
    session.settlement_batch_id = id;
    toCreators += BigInt(session.consumed_amount);
    totalRefunded += BigInt(session.refunded_amount);
    const channel = session.channel_id ? findChannel(db, session.channel_id) : undefined;
    if (channel) channel.totalClaimed = channel.chargedCumulativeAmount;
  }
  db.settlements.push({
    id,
    tx_hash: txHash,
    session_count: closed.length,
    total_to_creators: toCreators.toString(),
    total_refunded: totalRefunded.toString(),
    submitted_at: new Date().toISOString(),
    confirmed_at: new Date(Date.now() + 2500).toISOString(),
  });
  persist();
  return { settled: closed.length, txHash, refunded };
}

export function paymentResponseHeaders(settle: SettleResponse): Record<string, string> {
  return {
    "PAYMENT-RESPONSE": encodePaymentResponseHeader(settle),
    "Cache-Control": "no-store",
    "Access-Control-Expose-Headers": "PAYMENT-REQUIRED,PAYMENT-RESPONSE",
  };
}
