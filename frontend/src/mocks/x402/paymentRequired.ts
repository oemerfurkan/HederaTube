import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { HttpResponse } from "msw";
import { MOCK_RECEIVER_AUTHORIZER } from "../fixtures";
import { USDC_TOKEN_ID } from "@/lib/hedera";

export const MOCK_NETWORK = "hedera:testnet" as const;
export const MOCK_WITHDRAW_DELAY = 900;
export const MOCK_MAX_TIMEOUT_SECONDS = 600;

/**
 * Builds batch-settlement payment requirements the way the real server's
 * `enhancePaymentRequirements` does (server/scheme.ts): Hedera entity ids for payTo/asset,
 * `extra.receiverAuthorizer`, `withdrawDelay`, `assetTransferMethod`, `minDeposit`.
 */
export function buildRequirements(options: {
  url: string;
  amount: bigint;
  minDeposit: bigint;
  payTo: string;
  description?: string;
}): PaymentRequirements {
  return {
    scheme: "batch-settlement",
    network: MOCK_NETWORK,
    amount: options.amount.toString(),
    asset: USDC_TOKEN_ID,
    payTo: options.payTo,
    maxTimeoutSeconds: MOCK_MAX_TIMEOUT_SECONDS,
    extra: {
      assetTransferMethod: "hts-allowance",
      receiverAuthorizer: MOCK_RECEIVER_AUTHORIZER,
      withdrawDelay: MOCK_WITHDRAW_DELAY,
      minDeposit: options.minDeposit.toString(),
    },
  };
}

/** 402 response with the `PAYMENT-REQUIRED` header and JSON body, `Cache-Control: no-store`. */
export function paymentRequiredResponse(
  requirements: PaymentRequirements,
  options: { url: string; error?: string; extraPatch?: Record<string, unknown> },
): Response {
  const accept: PaymentRequirements = options.extraPatch
    ? { ...requirements, extra: { ...requirements.extra, ...options.extraPatch } }
    : requirements;
  const body: PaymentRequired = {
    x402Version: 2,
    ...(options.error ? { error: options.error } : {}),
    resource: { url: options.url },
    accepts: [accept],
  };
  return HttpResponse.json(body, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": encodePaymentRequiredHeader(body),
      "Cache-Control": "no-store",
      "Access-Control-Expose-Headers": "PAYMENT-REQUIRED,PAYMENT-RESPONSE",
    },
  });
}
