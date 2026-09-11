/** Payment state machine (guide §7). */
export type PaymentStatus =
  | "idle"
  | "insufficient"
  | "locking"
  | "preview"
  | "streaming"
  | "interrupted"
  | "closing"
  | "closed";

export type ViewingSession = {
  sessionId: string;
  videoId: string;
  /** Total price locked, USDC base units. */
  price: bigint;
  pricedChunks: number;
  freePreviewChunks: number;
  chunkCount: number;
  segmentCount: number;
  durationSeconds: number;
  playlistUrl: string;
  lockUrl: string;
  closeUrl: string;
  creatorAccountId: string;
};

export type ReceiptPhase = "settling" | "settled";

export type Receipt = {
  sessionId: string;
  videoId: string;
  videoTitle: string;
  phase: ReceiptPhase;
  locked: bigint;
  watched: bigint;
  watchedChunks: number;
  toCreator: bigint;
  refunded: bigint;
  refundTx?: string;
  settlementTx?: string;
  createdAt: number;
};
