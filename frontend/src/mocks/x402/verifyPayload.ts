import { decodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { getAddress, recoverAddress, verifyTypedData } from "viem";
import {
  BatchSettlementErrors as Errors,
  channelIdBindingError,
  computeHederaAllowanceDepositDigest,
  getBatchSettlementEip712Domain,
  getHederaChainId,
  isBatchSettlementDepositPayload,
  isBatchSettlementRefundPayload,
  isBatchSettlementVoucherPayload,
  voucherTypes,
  type BatchSettlementDepositPayload,
  type BatchSettlementRefundPayload,
  type BatchSettlementVoucherPayload,
} from "@/payments/x402-lite";
import { COLLECTOR_ADDRESS } from "@/lib/hedera";

export type ParsedPayment =
  | { kind: "deposit"; payload: BatchSettlementDepositPayload; envelope: PaymentPayload }
  | { kind: "voucher"; payload: BatchSettlementVoucherPayload; envelope: PaymentPayload }
  | { kind: "refund"; payload: BatchSettlementRefundPayload; envelope: PaymentPayload };

export type VerifyFailure = { ok: false; reason: string; message: string };

/** Decodes `PAYMENT-SIGNATURE` and classifies the batch-settlement payload. */
export function parsePaymentHeader(header: string | null): ParsedPayment | VerifyFailure | undefined {
  if (!header) return undefined;
  let envelope: PaymentPayload;
  try {
    envelope = decodePaymentSignatureHeader(header);
  } catch {
    return { ok: false, reason: "invalid_payment", message: "PAYMENT-SIGNATURE could not be decoded" };
  }
  const raw = envelope.payload;
  if (isBatchSettlementDepositPayload(raw)) return { kind: "deposit", payload: raw, envelope };
  if (isBatchSettlementVoucherPayload(raw)) return { kind: "voucher", payload: raw, envelope };
  if (isBatchSettlementRefundPayload(raw)) return { kind: "refund", payload: raw, envelope };
  return { ok: false, reason: "unsupported_scheme", message: "Unsupported payload type" };
}

/** Verifies the EIP-712 voucher signature against `channelConfig.payerAuthorizer` (what HAS does on-chain). */
export async function verifyVoucherSignature(
  parsed: ParsedPayment,
  requirements: PaymentRequirements,
): Promise<VerifyFailure | undefined> {
  const { channelConfig, voucher } = parsed.payload;
  const bindErr = channelIdBindingError(channelConfig, voucher.channelId, requirements.network);
  if (bindErr) return { ok: false, reason: bindErr, message: "Channel id does not match channel config" };
  if (getAddress(channelConfig.receiverAuthorizer) !== getAddress(String(requirements.extra?.receiverAuthorizer))) {
    return { ok: false, reason: Errors.ErrInvalidChannelId, message: "receiverAuthorizer mismatch" };
  }
  let valid = false;
  try {
    valid = await verifyTypedData({
      address: channelConfig.payerAuthorizer,
      domain: getBatchSettlementEip712Domain(requirements.network),
      types: voucherTypes,
      primaryType: "Voucher",
      message: { channelId: voucher.channelId, maxClaimableAmount: BigInt(voucher.maxClaimableAmount) },
      signature: voucher.signature,
    });
  } catch {
    valid = false;
  }
  if (!valid) {
    return { ok: false, reason: Errors.ErrInvalidVoucherSignature, message: "Voucher signature is invalid" };
  }
  return undefined;
}

/** Verifies the plain-keccak deposit authorization (what the collector verifies through HAS). */
export async function verifyDepositAuthorization(
  payload: BatchSettlementDepositPayload,
  requirements: PaymentRequirements,
  usedNonces: string[],
): Promise<VerifyFailure | undefined> {
  const auth = payload.deposit.authorization.hederaAllowanceAuthorization;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Number(auth.deadline) < nowSeconds) {
    return { ok: false, reason: Errors.ErrAllowanceDeadlineExpired, message: "Deposit authorization expired" };
  }
  if (usedNonces.includes(auth.nonce)) {
    return { ok: false, reason: Errors.ErrAllowanceNonceUsed, message: "Deposit nonce already used" };
  }
  const digest = computeHederaAllowanceDepositDigest({
    channelId: payload.voucher.channelId,
    token: getAddress(payload.channelConfig.token),
    amount: payload.deposit.amount,
    nonce: auth.nonce,
    deadline: auth.deadline,
    collector: COLLECTOR_ADDRESS,
    chainId: getHederaChainId(requirements.network),
  });
  let recovered: string | undefined;
  try {
    recovered = await recoverAddress({ hash: digest, signature: auth.signature });
  } catch {
    recovered = undefined;
  }
  if (!recovered || recovered.toLowerCase() !== payload.channelConfig.payer.toLowerCase()) {
    return { ok: false, reason: Errors.ErrAllowanceSignatureInvalid, message: "Deposit authorization signature is invalid" };
  }
  return undefined;
}
