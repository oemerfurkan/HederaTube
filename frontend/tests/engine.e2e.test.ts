import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { server } from "@/mocks/node";
import { resetDb, loadDb } from "@/mocks/db";
import { createLocalSigner } from "@/payments/localSigner";
import { createSessionPaymentClient } from "@/payments/x402Client";
import { createChannelStorage } from "@/payments/channelStorage";
import { cumulativeAmount, maxChunkAmount } from "@/lib/price";
import { api } from "@/api/client";

const BASE = window.location.origin;
const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

// Node fetch needs absolute URLs; MSW matches the path part.
const absolute = (path: string) => (path.startsWith("http") ? path : `${BASE}${path}`);
const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string") return originalFetch(absolute(input), init);
    if (input instanceof URL) return originalFetch(input, init);
    return originalFetch(new Request(absolute(input.url), input), init);
  }) as typeof fetch;
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => resetDb());
afterAll(() => {
  server.close();
  globalThis.fetch = originalFetch;
});

describe("payment engine end to end (mock server, real x402 client)", () => {
  it("locks, pays per chunk, refunds the rest and settles in a batch", async () => {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const signer = createLocalSigner(account, PRIVATE_KEY, "0.0.4242");
    const video = await api.getVideo("v-x402"); // 60 s, 12 chunks, no free preview, 0.0012 USDC
    const price = BigInt(video.total_price);
    const opened = await api.openSession(video.id, signer.evmAddress);
    const session = {
      sessionId: opened.sessionId,
      price,
      pricedChunks: opened.pricedChunks,
      closeUrl: absolute(opened.closeUrl),
    };
    const payment = createSessionPaymentClient({ signer, session });

    // Lock: deposit payload, charges nothing.
    const lock = await payment.fetchWithPayment(absolute(opened.lockUrl));
    expect(lock.status).toBe(200);
    const lockSettle = decodePaymentResponseHeader(lock.headers.get("PAYMENT-RESPONSE")!);
    expect(lockSettle.success).toBe(true);
    expect(lockSettle.extra?.chargedAmount).toBe("0");
    expect(lockSettle.transaction).toMatch(/^0\.0\.\d+@/);
    const db = loadDb();
    expect(db.channels).toHaveLength(1);
    expect(db.channels[0].balance).toBe(price.toString());
    expect(BigInt(db.ledger[signer.evmAddress.toLowerCase()])).toBe(1_000_000n - price);

    // Client storage holds the channel with the deposit.
    const storage = createChannelStorage(signer.evmAddress);
    const stored = await storage.get(db.channels[0].channelId);
    expect(stored?.balance).toBe(price.toString());
    expect(stored?.chargedCumulativeAmount).toBe("0");

    // Pay three chunks: segments 0, 2, 4 carry vouchers; 1, 3, 5 are free once paid.
    const perChunk = maxChunkAmount(price, opened.pricedChunks);
    for (let chunk = 0; chunk < 3; chunk += 1) {
      const paidUrl = absolute(`/stream/${video.id}/seg-${String(chunk * 2).padStart(4, "0")}.ts?s=${opened.sessionId}`);
      const res = await payment.fetchWithPayment(paidUrl);
      expect(res.status).toBe(200);
      const settle = decodePaymentResponseHeader(res.headers.get("PAYMENT-RESPONSE")!);
      const expectedCumulative = cumulativeAmount(price, chunk + 1, opened.pricedChunks);
      expect(BigInt(settle.extra!.chargedAmount as string)).toBeLessThanOrEqual(perChunk);
      expect((settle.extra!.channelState as { chargedCumulativeAmount: string }).chargedCumulativeAmount).toBe(expectedCumulative.toString());
      const free = await fetch(absolute(`/stream/${video.id}/seg-${String(chunk * 2 + 1).padStart(4, "0")}.ts?s=${opened.sessionId}`));
      expect(free.status).toBe(200);
    }
    const afterThree = await storage.get(db.channels[0].channelId);
    expect(afterThree?.chargedCumulativeAmount).toBe(cumulativeAmount(price, 3, opened.pricedChunks).toString());

    // A second segment of an unpaid chunk is refused.
    const unpaid = await fetch(absolute(`/stream/${video.id}/seg-0007.ts?s=${opened.sessionId}`));
    expect(unpaid.status).toBe(402);

    // Close: cooperative refund of price - watched.
    const refund = await payment.scheme.refund(session.closeUrl);
    expect(refund.success).toBe(true);
    expect(refund.transaction).toMatch(/^0\.0\.\d+@/);
    const watched = cumulativeAmount(price, 3, opened.pricedChunks);
    const receipt = await api.receipt(opened.sessionId);
    expect(receipt.status).toBe("closed");
    expect(BigInt(receipt.watched)).toBe(watched);
    expect(BigInt(receipt.refunded)).toBe(price - watched);
    expect(receipt.refundTx).toBe(refund.transaction);
    expect(await storage.get(db.channels[0].channelId)).toBeUndefined();
    expect(BigInt(loadDb().ledger[signer.evmAddress.toLowerCase()])).toBe(1_000_000n - watched);

    // Batch job flips the receipt to settled with a shared tx hash.
    const batch = await api.runBatch();
    expect(batch.settled).toBeGreaterThanOrEqual(1);
    const settled = await api.receipt(opened.sessionId);
    expect(settled.status).toBe("settled");
    expect(settled.settlementTx).toBe(batch.txHash);
  });

  it("recovers from a corrective 402 when local channel state is lost", async () => {
    const account = privateKeyToAccount(PRIVATE_KEY);
    const signer = createLocalSigner(account, PRIVATE_KEY, "0.0.4242");
    const video = await api.getVideo("v-consensus"); // 30 s, 2 free chunks, 4 priced
    const price = BigInt(video.total_price);
    const opened = await api.openSession(video.id, signer.evmAddress);
    const payment = createSessionPaymentClient({
      signer,
      session: { sessionId: opened.sessionId, price, pricedChunks: opened.pricedChunks, closeUrl: absolute(opened.closeUrl) },
    });
    expect((await payment.fetchWithPayment(absolute(opened.lockUrl))).status).toBe(200);

    // Free preview segments need no payment header.
    for (const i of [0, 1, 2, 3]) {
      const res = await fetch(absolute(`/stream/${video.id}/seg-${String(i).padStart(4, "0")}.ts?s=${opened.sessionId}`));
      expect(res.status).toBe(200);
    }
    // First priced chunk is chunk 2 → segment 4.
    expect((await payment.fetchWithPayment(absolute(`/stream/${video.id}/seg-0004.ts?s=${opened.sessionId}`))).status).toBe(200);

    // Corrupt local state: pretend nothing was charged yet. Server answers with a corrective 402,
    // the client resyncs from channelState (+ mock mirror read) and retries once.
    const storage = createChannelStorage(signer.evmAddress);
    const channelId = loadDb().channels[0].channelId;
    const ctx = (await storage.get(channelId))!;
    await storage.set(channelId, { ...ctx, chargedCumulativeAmount: "0" });
    const res = await payment.fetchWithPayment(absolute(`/stream/${video.id}/seg-0006.ts?s=${opened.sessionId}`));
    expect(res.status).toBe(200);
    const after = await storage.get(channelId);
    expect(after?.chargedCumulativeAmount).toBe(cumulativeAmount(price, 2, opened.pricedChunks).toString());

    // Watching to the end pays exactly the price and leaves nothing to refund.
    expect((await payment.fetchWithPayment(absolute(`/stream/${video.id}/seg-0008.ts?s=${opened.sessionId}`))).status).toBe(200);
    expect((await payment.fetchWithPayment(absolute(`/stream/${video.id}/seg-0010.ts?s=${opened.sessionId}`))).status).toBe(200);
    expect(loadDb().channels[0].chargedCumulativeAmount).toBe(price.toString());
    await expect(payment.scheme.refund(absolute(opened.closeUrl))).rejects.toThrow(/no remaining balance/);
  });
});
