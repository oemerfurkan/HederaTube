export type VideoStatus = "processing" | "ready" | "failed";

export type Video = {
  id: string;
  creator_id: string;
  creator: { handle: string; display_name: string; hedera_account_id: string };
  title: string;
  description: string;
  duration_seconds: number;
  chunk_count: number;
  segment_count: number;
  status: VideoStatus;
  free_preview_chunks: number;
  /** USDC base units. */
  total_price: string;
  thumbnail_url: string;
  created_at: string;
  /** Sessions with at least one consumed chunk. */
  views: number;
  likes: number;
};

export type SessionStatus = "locked" | "streaming" | "closing" | "closed" | "settled" | "failed";

export type OpenSessionResponse = {
  sessionId: string;
  playlistUrl: string;
  lockUrl: string;
  closeUrl: string;
  pricedChunks: number;
  creatorAccountId: string;
};

export type SessionListRow = {
  id: string;
  viewer_address: string;
  paid_amount: string;
  watched_seconds: number;
  watched_percent: number;
  started_at: string;
  status: SessionStatus;
  /** "streaming" | "settled" | "closed" | "free" */
  badge: "streaming" | "settled" | "pending" | "free";
  tx: string | null;
};

export type SessionListResponse = {
  total_sessions: number;
  total_earned: string;
  live_count: number;
  rows: SessionListRow[];
};

export type ReceiptResponse = {
  sessionId: string;
  videoId: string;
  videoTitle: string;
  status: SessionStatus;
  locked: string;
  watched: string;
  chunks: number;
  toCreator: string;
  refunded: string;
  refundTx: string | null;
  settlementTx: string | null;
};

export type EarningsRow = {
  video_id: string;
  title: string;
  thumbnail_url: string;
  chunks_served: number;
  earned: string;
  pending: string;
  status: "settled" | "payout pending" | "processing";
};

export type EarningsResponse = {
  total_earned: string;
  chunks_served: number;
  unique_viewers: number;
  rows: EarningsRow[];
};

export type Me = {
  address: string;
  verified: boolean;
  creator: { handle: string; display_name: string; description: string; hedera_account_id: string } | null;
  spent_today: string;
};

export type ChannelResponse = {
  creator: { handle: string; display_name: string; description: string; hedera_account_id: string };
  videos: Video[];
  total_earned: string;
  sessions: number;
};

export type PresignResponse = { uploadUrl: string; key: string; videoId: string };
