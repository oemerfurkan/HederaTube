import { keccak256, toBytes } from "viem";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { BatchSettlementHederaScheme, type ClientHederaBatchSigner } from "./x402-lite";
import { createChannelStorage } from "./channelStorage";
import { NETWORK, USDC_TOKEN_ID } from "@/lib/hedera";
import { maxChunkAmount } from "@/lib/price";
import type { ViewingSession } from "./types";

export type SessionPaymentClient = {
  scheme: BatchSettlementHederaScheme;
  client: x402Client;
  fetchWithPayment: ReturnType<typeof wrapFetchWithPayment>;
  closeUrl: string;
  salt: `0x${string}`;
};

/**
 * One x402 client per viewing session. The channel salt is derived from the session id, so every
 * session gets its own payment channel: the deposit is exactly the video price ("lock"), and the
 * cooperative refund at close drains what was not watched.
 */
export function createSessionPaymentClient(options: {
  signer: ClientHederaBatchSigner;
  session: Pick<ViewingSession, "sessionId" | "price" | "pricedChunks" | "closeUrl">;
}): SessionPaymentClient {
  const { signer, session } = options;
  const salt = keccak256(toBytes(session.sessionId));
  const price = session.price;

  const scheme = new BatchSettlementHederaScheme(signer, {
    salt,
    storage: createChannelStorage(signer.evmAddress),
    depositPolicy: { depositMultiplier: 5 },
    depositStrategy: ctx => {
      if (ctx.currentBalance !== "0") {
        throw new Error("Channel top-up requested; cumulative charges must never exceed the locked price");
      }
      const announced = ctx.paymentRequirements.extra?.minDeposit;
      if (typeof announced !== "string" || BigInt(announced) !== price) {
        throw new Error(`Server minDeposit ${String(announced)} does not match the video price ${price}`);
      }
      return announced;
    },
  });

  // Per-payment cap must cover a chunk; deposit cap = 5 × this must cover the whole price.
  const perChunk = maxChunkAmount(price, session.pricedChunks);
  const fifth = (price + 4n) / 5n;
  const cap = perChunk > fifth ? perChunk : fifth;

  const client = new x402Client().register(`${NETWORK.split(":")[0]}:*`, scheme);
  client.setSpendControls({
    maxAmountPerPayment: false,
    allowedAssets: [{ network: NETWORK, asset: USDC_TOKEN_ID, maxAmountPerPayment: cap.toString() }],
  });

  return {
    scheme,
    client,
    fetchWithPayment: wrapFetchWithPayment(fetch, client),
    closeUrl: session.closeUrl,
    salt,
  };
}
