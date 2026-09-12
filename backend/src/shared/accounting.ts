import { chunkOfSegment, cumulativeAmount, isPaidSegment } from "./price.js";

/** Minimal session view the accounting helpers need (mirrors frontend/src/mocks/x402/channels.ts). */
export type SessionAccounting = {
  locked_amount: string;
  priced_chunk_count: number;
  free_preview_chunks: number;
  chunks_consumed: number;
  chunks_served: number;
  /** Chunk indices already paid (set-based: seeking charges only what is watched). */
  paid_chunks: number[];
  status: string;
};

export type SegmentClass =
  | { kind: "preview"; chunk: number }
  /** `k` = ordinal of this chunk among paid chunks (1-based): the k-th chunk watched. */
  | { kind: "paid"; chunk: number; pricedIndex: number; k: number }
  | { kind: "already-paid"; chunk: number }
  | { kind: "second-unpaid"; chunk: number }
  | { kind: "second-paid"; chunk: number };

/** Classifies a segment request for a session: what needs payment, what streams free. */
export function classifySegment(session: SessionAccounting, segmentIndex: number): SegmentClass {
  const chunk = chunkOfSegment(segmentIndex);
  const free = session.free_preview_chunks;
  if (chunk < free) return { kind: "preview", chunk };
  const pricedIndex = chunk - free;
  const paidAlready = session.paid_chunks.includes(chunk);
  if (isPaidSegment(segmentIndex, free)) {
    if (paidAlready) return { kind: "already-paid", chunk };
    const k = Math.max(1, Math.min(session.priced_chunk_count, session.paid_chunks.length + 1));
    return { kind: "paid", chunk, pricedIndex, k };
  }
  return paidAlready ? { kind: "second-paid", chunk } : { kind: "second-unpaid", chunk };
}

/** Amount to charge for the k-th paid chunk (1-based) given the channel's current cumulative charge. */
export function chunkCharge(session: SessionAccounting, k: number, chargedCumulative: bigint): bigint {
  const target = cumulativeAmount(BigInt(session.locked_amount), Math.max(k, session.paid_chunks.length), session.priced_chunk_count);
  const delta = target - chargedCumulative;
  return delta < 0n ? 0n : delta;
}

export type SessionBadge = "streaming" | "settled" | "pending" | "free";

export function badgeOf(session: SessionAccounting): SessionBadge {
  if (session.status === "locked" || session.status === "streaming") return "streaming";
  if (session.status === "settled") return "settled";
  if (session.chunks_consumed === 0 && session.free_preview_chunks > 0) return "free";
  return "pending";
}

export function servedChunks(session: SessionAccounting): number {
  return Math.max(session.chunks_served, session.chunks_consumed + session.free_preview_chunks);
}

export function receiptRefunded(session: SessionAccounting & { refunded_amount: string; consumed_amount: string }): string {
  if (session.status === "closed" || session.status === "settled") return session.refunded_amount;
  return (BigInt(session.locked_amount) - BigInt(session.consumed_amount)).toString();
}

export function earningsStatus(videoStatus: string, pending: bigint): "settled" | "payout pending" | "processing" {
  if (videoStatus === "processing") return "processing";
  return pending > 0n ? "payout pending" : "settled";
}

/** VOD playlist text from per-segment durations. */
export function buildPlaylist(videoId: string, sessionId: string, durations: number[]): string {
  const target = Math.max(1, Math.ceil(Math.max(...durations, 0)));
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${target}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
  ];
  durations.forEach((d, i) => {
    lines.push(`#EXTINF:${d.toFixed(6)},`);
    lines.push(`/stream/${videoId}/seg-${String(i).padStart(4, "0")}.ts?s=${sessionId}`);
  });
  lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}

/** Parses `#EXTINF:` durations from an HLS playlist (transcode output). */
export function parseExtinf(m3u8: string): number[] {
  return [...m3u8.matchAll(/#EXTINF:([\d.]+)/g)].map(m => Number(m[1]));
}
