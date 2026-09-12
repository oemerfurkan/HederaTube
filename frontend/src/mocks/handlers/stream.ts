import { bypass, http, HttpResponse } from "msw";
import { loadDb, persist, type MockDb, type SessionRow, type VideoRow } from "../db";
import { MOCK_CREATOR } from "../fixtures";
import { buildRequirements, paymentRequiredResponse } from "../x402/paymentRequired";
import { parsePaymentHeader } from "../x402/verifyPayload";
import { paymentResponseHeaders, processDeposit, processRefund, processVoucher, type PaymentOutcome } from "../x402/channels";
import { chunkOfSegment, isPaidSegment, maxChunkAmount } from "@/lib/price";

/** Simulated Hedera latency for the deposit transaction (guide: "two, three seconds"). */
const LOCK_LATENCY_MS = 1800;

function sessionFor(db: MockDb, request: Request, videoId: string): SessionRow | undefined {
  const s = new URL(request.url).searchParams.get("s");
  if (!s) return undefined;
  const session = db.sessions.find(row => row.id === s && row.video_id === videoId);
  return session;
}

function videoFor(db: MockDb, videoId: string): VideoRow | undefined {
  return db.videos.find(v => v.id === videoId);
}

function creatorAccount(db: MockDb, video: VideoRow): string {
  return db.creators.find(c => c.id === video.creator_id)?.hedera_account_id ?? MOCK_CREATOR.accountId;
}

function failure(outcome: Exclude<PaymentOutcome, { ok: true }>, requirements: ReturnType<typeof buildRequirements>, url: string) {
  return paymentRequiredResponse(requirements, { url, error: outcome.reason, extraPatch: outcome.corrective });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Tiny valid-looking MPEG-TS packet used when demo assets are unavailable (node tests). */
function fallbackSegment(): Uint8Array {
  const packet = new Uint8Array(188 * 4);
  for (let i = 0; i < 4; i += 1) packet[i * 188] = 0x47;
  return packet;
}

export const streamHandlers = [
  // Runtime playlist with the session id embedded in every segment URL (guide §2.4).
  http.get("/stream/:videoId/playlist.m3u8", async ({ params, request }) => {
    const db = loadDb();
    const videoId = String(params.videoId);
    const video = videoFor(db, videoId);
    const session = sessionFor(db, request, videoId);
    if (!video || !session) return HttpResponse.text("session not found", { status: 404 });
    if (!["locked", "streaming"].includes(session.status)) {
      return HttpResponse.text("session is not open", { status: 409 });
    }
    let durations: number[] | undefined;
    try {
      const res = await fetch(bypass(new URL(`/demo/${video.asset}/index.m3u8`, request.url)));
      if (res.ok) {
        const text = await res.text();
        durations = [...text.matchAll(/#EXTINF:([\d.]+)/g)].map(m => Number(m[1]));
      }
    } catch {
      durations = undefined;
    }
    if (!durations?.length) {
      durations = Array.from({ length: video.segment_count }, (_, i) =>
        i === video.segment_count - 1 ? Math.max(0.5, video.duration_seconds - 2.5 * i) : 2.5,
      );
    }
    const lines = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:3",
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-PLAYLIST-TYPE:VOD",
      "#EXT-X-INDEPENDENT-SEGMENTS",
    ];
    durations.forEach((d, i) => {
      lines.push(`#EXTINF:${d.toFixed(6)},`);
      lines.push(`/stream/${videoId}/seg-${String(i).padStart(4, "0")}.ts?s=${session.id}`);
    });
    lines.push("#EXT-X-ENDLIST");
    return HttpResponse.text(lines.join("\n") + "\n", {
      headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" },
    });
  }),

  // Lock: deposit-only paid route. Charges nothing; opens the channel with balance = price.
  http.get("/stream/:videoId/lock", async ({ params, request }) => {
    const db = loadDb();
    const videoId = String(params.videoId);
    const video = videoFor(db, videoId);
    const session = sessionFor(db, request, videoId);
    if (!video || !session) return HttpResponse.text("session not found", { status: 404 });
    const price = BigInt(session.locked_amount);
    const requirements = buildRequirements({
      url: request.url,
      amount: maxChunkAmount(price, session.priced_chunk_count),
      minDeposit: price,
      payTo: creatorAccount(db, video),
    });
    const parsed = parsePaymentHeader(request.headers.get("PAYMENT-SIGNATURE"));
    if (!parsed) return paymentRequiredResponse(requirements, { url: request.url });
    if ("ok" in parsed) return failure(parsed, requirements, request.url);
    const outcome = await processDeposit(db, parsed, requirements, session);
    if (!outcome.ok) return failure(outcome, requirements, request.url);
    await sleep(LOCK_LATENCY_MS);
    return HttpResponse.json({ ok: true, sessionId: session.id, lockTx: session.lock_tx }, { headers: paymentResponseHeaders(outcome.settle) });
  }),

  // Segments: first segment of each priced chunk is paid; the rest stream freely once paid.
  http.get("/stream/:videoId/:segment", async ({ params, request }) => {
    const db = loadDb();
    const videoId = String(params.videoId);
    const match = /^seg-(\d+)\.ts$/.exec(String(params.segment));
    if (!match) return HttpResponse.text("not found", { status: 404 });
    const segmentIndex = Number(match[1]);
    const video = videoFor(db, videoId);
    const session = sessionFor(db, request, videoId);
    if (!video || !session) return HttpResponse.text("session not found", { status: 404 });
    if (!["locked", "streaming"].includes(session.status)) {
      return HttpResponse.text("session is closed", { status: 409 });
    }
    if (!session.lock_tx) return HttpResponse.text("lock first", { status: 402 });

    const chunk = chunkOfSegment(segmentIndex);
    const paidAlready = (session.paid_chunks ?? []).includes(chunk);
    const needsPayment = isPaidSegment(segmentIndex, session.free_preview_chunks) && !paidAlready;
    const secondOfPaidChunk = !isPaidSegment(segmentIndex, session.free_preview_chunks) && chunk >= session.free_preview_chunks && !paidAlready;
    if (secondOfPaidChunk) {
      return HttpResponse.text("chunk not paid", { status: 402, headers: { "cache-control": "no-store" } });
    }

    if (needsPayment) {
      const price = BigInt(session.locked_amount);
      const requirements = buildRequirements({
        url: request.url,
        amount: maxChunkAmount(price, session.priced_chunk_count),
        minDeposit: price,
        payTo: creatorAccount(db, video),
      });
      const parsed = parsePaymentHeader(request.headers.get("PAYMENT-SIGNATURE"));
      if (!parsed) return paymentRequiredResponse(requirements, { url: request.url });
      if ("ok" in parsed) return failure(parsed, requirements, request.url);
      const outcome = await processVoucher(db, parsed, requirements, session, chunk);
      if (!outcome.ok) return failure(outcome, requirements, request.url);
      const bytes = await segmentBytes(video, segmentIndex, request.url);
      return new HttpResponse(bytes, {
        headers: { ...paymentResponseHeaders(outcome.settle), "content-type": "video/mp2t" },
      });
    }

    if (chunk < session.free_preview_chunks) {
      session.chunks_served = Math.max(session.chunks_served, chunk + 1);
      persist();
    }
    const bytes = await segmentBytes(video, segmentIndex, request.url);
    return new HttpResponse(bytes, { headers: { "content-type": "video/mp2t", "cache-control": "no-store" } });
  }),
];

/** Close: refund-only paid route. Unpaid GET returns 402 so the client can probe requirements. */
export const closeHandler = http.get("/stream/:videoId/close", async ({ params, request }) => {
  const db = loadDb();
  const videoId = String(params.videoId);
  const video = videoFor(db, videoId);
  const session = sessionFor(db, request, videoId);
  if (!video || !session) return HttpResponse.text("session not found", { status: 404 });
  const price = BigInt(session.locked_amount);
  const requirements = buildRequirements({
    url: request.url,
    amount: maxChunkAmount(price, session.priced_chunk_count),
    minDeposit: price,
    payTo: creatorAccount(db, video),
  });
  const parsed = parsePaymentHeader(request.headers.get("PAYMENT-SIGNATURE"));
  if (!parsed) return paymentRequiredResponse(requirements, { url: request.url });
  if ("ok" in parsed) return failure(parsed, requirements, request.url);
  const outcome = await processRefund(db, parsed, requirements, session);
  if (!outcome.ok) return failure(outcome, requirements, request.url);
  return HttpResponse.json(
    { ok: true, sessionId: session.id, refundTx: session.refund_tx, refunded: session.refunded_amount },
    { headers: paymentResponseHeaders(outcome.settle) },
  );
});

async function segmentBytes(video: VideoRow, segmentIndex: number, base: string): Promise<Uint8Array> {
  try {
    const url = new URL(`/demo/${video.asset}/seg-${String(segmentIndex).padStart(4, "0")}.ts`, base);
    const res = await fetch(bypass(url));
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  } catch {
    /* fall through */
  }
  return fallbackSegment();
}
