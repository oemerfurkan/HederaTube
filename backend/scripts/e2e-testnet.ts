/**
 * End-to-end against the real facilitator + Hedera testnet with the ECDSA test client:
 * lock (deposit) → three paid chunks → free second segments → close (refund) → settlement batch.
 * Prints HashScan links. Requires: api on API_URL, facilitator on FACILITATOR_URL, worker running.
 *
 *   ACCOUNTS_ENV=../x402/typescript/packages/mechanisms/hedera/.env.testnet-accounts pnpm e2e:testnet
 */
import { config as loadDotenv } from "dotenv";
import { createClientHederaBatchSigner, parseHederaPrivateKey } from "@x402/hedera/batch-settlement";
import { BatchSettlementHederaScheme } from "@x402/hedera/batch-settlement/client";
import { ensureHtsAllowance, readHtsAllowance } from "@x402/hedera/batch-settlement/client";
import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { keccak256, toBytes } from "viem";
import { cumulativeAmount, maxChunkAmount } from "../src/shared/price.js";

loadDotenv({ path: process.env.ACCOUNTS_ENV ?? "../x402/typescript/packages/mechanisms/hedera/.env.testnet-accounts" });

const API = process.env.API_URL ?? "http://localhost:4021";
const NETWORK = "hedera:testnet" as const;
const USDC = process.env.HEDERA_TOKEN_ID ?? "0.0.429274";
const VIDEO_ID = process.env.VIDEO_ID ?? "v-x402";
const accountId = process.env.CLIENT_ECDSA_ACCOUNT_ID!;
const privateKey = process.env.CLIENT_ECDSA_PRIVATE_KEY!;
if (!accountId || !privateKey) throw new Error("CLIENT_ECDSA_ACCOUNT_ID / CLIENT_ECDSA_PRIVATE_KEY missing");

const hashscan = (tx: string) => `https://hashscan.io/testnet/transaction/${tx.replace("@", "-").replace(/\.(\d+)$/, "-$1")}`;
const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
};
const step = (msg: string) => console.log(`\n▶ ${msg}`);

async function main() {
  step(`payer ${accountId}: ensuring USDC allowance to the collector`);
  const before = await readHtsAllowance({ network: NETWORK, ownerAccountId: accountId, tokenId: USDC });
  if (before < 2n ** 62n) {
    const tx = await ensureHtsAllowance({ network: NETWORK, ownerAccountId: accountId, ownerPrivateKey: parseHederaPrivateKey(privateKey), tokenId: USDC, required: 2n ** 63n - 1n, amount: "max" });
    console.log("  allowance tx", tx ?? "(already sufficient)");
  } else console.log("  allowance ok", before.toString());

  const signer = await createClientHederaBatchSigner(accountId, parseHederaPrivateKey(privateKey), { network: NETWORK });
  const video = await json<{ total_price: string; free_preview_chunks: number; chunk_count: number }>(`/api/videos/${VIDEO_ID}`);
  const price = BigInt(video.total_price);

  step("POST /api/session/lock");
  const opened = await json<{ sessionId: string; lockUrl: string; closeUrl: string; pricedChunks: number }>("/api/session/lock", { method: "POST", body: JSON.stringify({ videoId: VIDEO_ID, viewer: signer.evmAddress }) });
  console.log("  session", opened.sessionId, "price", price.toString(), "priced chunks", opened.pricedChunks);

  // Same client construction as the frontend: one channel per session, deposit = price.
  const scheme = new BatchSettlementHederaScheme(signer, {
    salt: keccak256(toBytes(opened.sessionId)),
    depositPolicy: { depositMultiplier: 5 },
    depositStrategy: ctx => {
      const min = ctx.paymentRequirements.extra?.minDeposit;
      if (min !== price.toString()) throw new Error(`server minDeposit ${String(min)} != price ${price}`);
      return min;
    },
  });
  const perChunk = maxChunkAmount(price, opened.pricedChunks);
  const cap = perChunk > (price + 4n) / 5n ? perChunk : (price + 4n) / 5n;
  const client = new x402Client().register("hedera:*", scheme);
  client.setSpendControls({ maxAmountPerPayment: false, allowedAssets: [{ network: NETWORK, asset: USDC, maxAmountPerPayment: cap.toString() }] });
  const pay = wrapFetchWithPayment(fetch, client);
  const settleOf = (r: Response) => decodePaymentResponseHeader(r.headers.get("PAYMENT-RESPONSE")!);

  step("lock (deposit)");
  const t0 = Date.now();
  const lock = await pay(`${API}${opened.lockUrl}`);
  if (lock.status !== 200) throw new Error(`lock → ${lock.status} ${await lock.text()}`);
  const lockSettle = settleOf(lock);
  console.log(`  ${Date.now() - t0} ms, chargedAmount=${String(lockSettle.extra?.chargedAmount)}, deposit tx ${lockSettle.transaction}`);
  console.log("  ", hashscan(lockSettle.transaction));

  const free = video.free_preview_chunks;
  step(`free preview segments (${free} chunks)`);
  for (let i = 0; i < free * 2; i += 1) {
    const r = await fetch(`${API}/stream/${VIDEO_ID}/seg-${String(i).padStart(4, "0")}.ts?s=${opened.sessionId}`);
    console.log(`  seg ${i} → ${r.status} ${r.headers.get("content-length")} bytes`);
    if (r.status !== 200) throw new Error("free segment failed");
  }

  step("three paid chunks");
  for (let n = 0; n < 3; n += 1) {
    const chunk = free + n;
    const first = chunk * 2;
    const t = Date.now();
    const r = await pay(`${API}/stream/${VIDEO_ID}/seg-${String(first).padStart(4, "0")}.ts?s=${opened.sessionId}`);
    if (r.status !== 200) throw new Error(`seg ${first} → ${r.status} ${await r.text()}`);
    const s = settleOf(r);
    const cum = (s.extra?.channelState as { chargedCumulativeAmount?: string })?.chargedCumulativeAmount;
    const expected = cumulativeAmount(price, n + 1, opened.pricedChunks).toString();
    console.log(`  seg ${first} paid ${Date.now() - t} ms: charged=${String(s.extra?.chargedAmount)} cumulative=${cum} expected=${expected} ${cum === expected ? "✓" : "✗"}`);
    if (cum !== expected) throw new Error("cumulative mismatch");
    const second = await fetch(`${API}/stream/${VIDEO_ID}/seg-${String(first + 1).padStart(4, "0")}.ts?s=${opened.sessionId}`);
    console.log(`  seg ${first + 1} free → ${second.status}`);
    const again = await fetch(`${API}/stream/${VIDEO_ID}/seg-${String(first).padStart(4, "0")}.ts?s=${opened.sessionId}`);
    if (again.status !== 200) throw new Error(`re-request of paid segment → ${again.status}`);
  }

  step("unpaid GET close must be 402 (probe)");
  const probe = await fetch(`${API}${opened.closeUrl}`);
  console.log(`  close probe → ${probe.status}, PAYMENT-REQUIRED ${probe.headers.has("PAYMENT-REQUIRED") ? "present" : "MISSING"}`);

  step("close (cooperative refund)");
  const t1 = Date.now();
  const refund = await scheme.refund(`${API}${opened.closeUrl}`);
  console.log(`  ${Date.now() - t1} ms, refund amount=${refund.amount}, tx ${refund.transaction}`);
  console.log("  ", hashscan(refund.transaction));

  const receipt = await json<{ status: string; watched: string; refunded: string; refundTx: string | null }>(`/api/session/${opened.sessionId}/receipt`);
  console.log("  receipt", receipt);
  const watched = cumulativeAmount(price, 3, opened.pricedChunks);
  if (BigInt(receipt.watched) !== watched || BigInt(receipt.refunded) !== price - watched) throw new Error("receipt amounts mismatch");

  step("POST /api/dev/run-batch (settlement job)");
  const batch = await json<{ settled: number; txHash: string | null; refunded: number; claims: string[] }>("/api/dev/run-batch", { method: "POST" });
  console.log("  ", batch);
  if (batch.txHash) console.log("  settle:", hashscan(batch.txHash));
  for (const c of batch.claims) console.log("  claim:", hashscan(c));
  const settled = await json<{ status: string; settlementTx: string | null }>(`/api/session/${opened.sessionId}/receipt`);
  console.log("  receipt after batch:", settled);
  console.log("\n✔ e2e complete");
}

main().catch(err => {
  console.error("\n✖", err);
  process.exit(1);
});
