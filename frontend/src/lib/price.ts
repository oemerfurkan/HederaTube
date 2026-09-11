/**
 * Price derivation (guide §2.5, §2.12). All money math is integer bigint on USDC base units.
 * Segment = 2.5 s (HLS delivery unit). Chunk = 5 s = 2 segments (billing unit).
 */
export const SEGMENT_SECONDS = 2.5;
export const CHUNK_SECONDS = 5;
export const SEGMENTS_PER_CHUNK = 2;
/** Practical lower bound for a total price: 0.0010 USDC. */
export const MIN_TOTAL_PRICE = 1000n;
/** Suggested default: 0.0012 USDC per minute. */
export const SUGGESTED_PER_MINUTE = 1200n;
export const MAX_FREE_PREVIEW_CHUNKS = 12;

export function segmentCount(durationSeconds: number): number {
  return Math.max(1, Math.ceil(durationSeconds / SEGMENT_SECONDS - 1e-9));
}

export function chunkCount(durationSeconds: number): number {
  return Math.max(1, Math.ceil(segmentCount(durationSeconds) / SEGMENTS_PER_CHUNK));
}

export function pricedChunkCount(durationSeconds: number, freePreviewChunks: number): number {
  return Math.max(1, chunkCount(durationSeconds) - freePreviewChunks);
}

/** Chunk index (0-based) for a segment index. */
export function chunkOfSegment(segmentIndex: number): number {
  return Math.floor(segmentIndex / SEGMENTS_PER_CHUNK);
}

/** First segment of a chunk carries the payment. */
export function isPaidSegment(segmentIndex: number, freePreviewChunks: number): boolean {
  return segmentIndex % SEGMENTS_PER_CHUNK === 0 && chunkOfSegment(segmentIndex) >= freePreviewChunks;
}

/**
 * Cumulative amount owed after `paidChunks` priced chunks were consumed:
 * floor(totalPrice × paidChunks / pricedChunks). Watching to the end pays exactly totalPrice.
 */
export function cumulativeAmount(totalPrice: bigint, paidChunks: number, pricedChunks: number): bigint {
  if (pricedChunks <= 0) return 0n;
  const k = BigInt(Math.min(Math.max(paidChunks, 0), pricedChunks));
  return (totalPrice * k) / BigInt(pricedChunks);
}

/** Amount charged for the k-th priced chunk (1-based). */
export function chunkDelta(totalPrice: bigint, paidChunkIndex: number, pricedChunks: number): bigint {
  return (
    cumulativeAmount(totalPrice, paidChunkIndex, pricedChunks) -
    cumulativeAmount(totalPrice, paidChunkIndex - 1, pricedChunks)
  );
}

/** Per-request ceiling announced in the 402: ceil(totalPrice / pricedChunks). */
export function maxChunkAmount(totalPrice: bigint, pricedChunks: number): bigint {
  if (pricedChunks <= 0) return 0n;
  const p = BigInt(pricedChunks);
  return (totalPrice + p - 1n) / p;
}

/** Minimum total price for a video: at least one base unit per priced chunk, and never below 0.0010 USDC. */
export function minTotalPrice(pricedChunks: number): bigint {
  const floor = BigInt(Math.max(pricedChunks, 1));
  return floor > MIN_TOTAL_PRICE ? floor : MIN_TOTAL_PRICE;
}

/** Suggested total price from duration at SUGGESTED_PER_MINUTE (rounded up to base units). */
export function suggestedTotalPrice(durationSeconds: number): bigint {
  const seconds = BigInt(Math.max(1, Math.round(durationSeconds)));
  return (SUGGESTED_PER_MINUTE * seconds + 59n) / 60n;
}

/** Per-minute figure derived from a total price (base units per minute). */
export function perMinute(totalPrice: bigint, durationSeconds: number): bigint {
  const seconds = BigInt(Math.max(1, Math.round(durationSeconds)));
  return (totalPrice * 60n) / seconds;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
