import { MOCK_CREATOR, VIDEOS } from "./fixtures";

export type VideoRow = {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  duration_seconds: number;
  chunk_count: number;
  segment_count: number;
  status: "processing" | "ready" | "failed";
  free_preview_chunks: number;
  total_price: string;
  thumbnail_key: string;
  asset: string;
  created_at: string;
  seed_views: number;
};

export type CreatorRow = {
  id: string;
  wallet_address: string;
  hedera_account_id: string;
  handle: string;
  display_name: string;
  description?: string;
  avatar_url?: string;
  world_nullifier_hash: string | null;
  verified_at: string | null;
  subscribers: number;
};

export type SessionStatus = "locked" | "streaming" | "closing" | "closed" | "settled" | "failed";

export type SessionRow = {
  id: string;
  video_id: string;
  viewer_address: string;
  locked_amount: string;
  priced_chunk_count: number;
  free_preview_chunks: number;
  lock_tx: string | null;
  started_at: string;
  ended_at: string | null;
  chunks_served: number;
  chunks_consumed: number;
  /** Chunk indices that carried a voucher (seeking pays only the chunks actually watched). */
  paid_chunks: number[];
  consumed_amount: string;
  refunded_amount: string;
  refund_tx: string | null;
  status: SessionStatus;
  settlement_batch_id: string | null;
  channel_id: string | null;
};

export type SettlementRow = {
  id: string;
  tx_hash: string;
  session_count: number;
  total_to_creators: string;
  total_refunded: string;
  submitted_at: string;
  confirmed_at: string;
};

/** Server-side channel table (mirrors `@x402/hedera` server storage `Channel`). */
export type ChannelRow = {
  channelId: string;
  sessionId: string;
  payer: string;
  payerAuthorizer: string;
  chargedCumulativeAmount: string;
  signedMaxClaimable: string;
  signature: string;
  balance: string;
  totalClaimed: string;
  refundNonce: string;
  pendingRequest: boolean;
  lastRequestTimestamp: number;
  usedDepositNonces: string[];
};

export type LikeRow = { video_id: string; viewer_address: string; created_at: string };

export type MockDb = {
  videos: VideoRow[];
  creators: CreatorRow[];
  sessions: SessionRow[];
  settlements: SettlementRow[];
  channels: ChannelRow[];
  likes: LikeRow[];
  /** Mock USDC ledger per viewer address (base units). */
  ledger: Record<string, string>;
  /** Mock HBAR faucet drips per address. */
  faucet: Record<string, string>;
  /** Uploaded (unprocessed) files by key. */
  uploads: Record<string, { size: number; type: string }>;
  txCounter: number;
};

const STORAGE_KEY = "ht:mockdb:v1";
const CHANNEL_KEY = "ht:mockdb:v1"; // same blob; kept for readability

function segmentCountOf(duration: number): number {
  return Math.max(1, Math.ceil(duration / 2.5 - 1e-9));
}

export function seedDb(): MockDb {
  const videos: VideoRow[] = VIDEOS.map(v => {
    const segments = segmentCountOf(v.durationSeconds);
    return {
      id: v.id,
      creator_id: MOCK_CREATOR.id,
      title: v.title,
      description: v.description,
      duration_seconds: v.durationSeconds,
      segment_count: segments,
      chunk_count: Math.ceil(segments / 2),
      status: "ready",
      free_preview_chunks: v.freePreviewChunks,
      total_price: v.totalPrice,
      thumbnail_key: `/demo/${v.asset}/thumb.jpg`,
      asset: v.asset,
      created_at: v.createdAt,
      seed_views: v.seedViews,
    };
  });
  const creators: CreatorRow[] = [
    {
      id: MOCK_CREATOR.id,
      wallet_address: MOCK_CREATOR.walletAddress,
      hedera_account_id: MOCK_CREATOR.accountId,
      handle: MOCK_CREATOR.handle,
      display_name: MOCK_CREATOR.displayName,
      world_nullifier_hash: "0xseed",
      verified_at: "2026-09-01T00:00:00Z",
      subscribers: MOCK_CREATOR.subscribers,
    },
  ];
  return {
    videos,
    creators,
    sessions: seedSessions(videos),
    settlements: [],
    channels: [],
    likes: [],
    ledger: {},
    faucet: {},
    uploads: {},
    txCounter: 1,
  };
}

/** A few historical, already-settled sessions so the session list and earnings are not empty. */
function seedSessions(videos: VideoRow[]): SessionRow[] {
  const rows: SessionRow[] = [];
  const viewers = [
    "0x1a2b3c4d5e6f7081920a1b2c3d4e5f60718293a4",
    "0x9f8e7d6c5b4a39281706f5e4d3c2b1a0918273f6",
    "0x4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c",
  ];
  let n = 0;
  for (const video of videos) {
    const priced = Math.max(1, video.chunk_count - video.free_preview_chunks);
    const fractions = [1, 0.6, 0.25];
    fractions.forEach((fraction, i) => {
      const consumed = Math.max(1, Math.round(priced * fraction));
      const consumedAmount = (BigInt(video.total_price) * BigInt(consumed)) / BigInt(priced);
      const started = new Date(Date.parse(video.created_at) + (i + 1) * 3_600_000);
      n += 1;
      rows.push({
        id: `seed-${n}`,
        video_id: video.id,
        viewer_address: viewers[i % viewers.length],
        locked_amount: video.total_price,
        priced_chunk_count: priced,
        free_preview_chunks: video.free_preview_chunks,
        lock_tx: `0.0.10463136@${Math.floor(started.getTime() / 1000)}.${100 + n}`,
        started_at: started.toISOString(),
        ended_at: new Date(started.getTime() + consumed * 5000).toISOString(),
        chunks_served: consumed + video.free_preview_chunks,
        chunks_consumed: consumed,
        paid_chunks: Array.from({ length: consumed }, (_, k) => video.free_preview_chunks + k),
        consumed_amount: consumedAmount.toString(),
        refunded_amount: (BigInt(video.total_price) - consumedAmount).toString(),
        refund_tx: `0.0.10463136@${Math.floor(started.getTime() / 1000) + 400}.${200 + n}`,
        status: "settled",
        settlement_batch_id: "seed-batch",
        channel_id: null,
      });
    });
  }
  return rows;
}

let current: MockDb | undefined;

export function loadDb(): MockDb {
  if (current) return current;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      current = JSON.parse(raw) as MockDb;
      return current;
    }
  } catch {
    /* ignore */
  }
  current = seedDb();
  if (!current.settlements.length) {
    current.settlements.push({
      id: "seed-batch",
      tx_hash: "0.0.10463136@1757500000.000000001",
      session_count: current.sessions.length,
      total_to_creators: current.sessions.reduce((a, s) => a + BigInt(s.consumed_amount), 0n).toString(),
      total_refunded: current.sessions.reduce((a, s) => a + BigInt(s.refunded_amount), 0n).toString(),
      submitted_at: "2026-09-10T12:00:00Z",
      confirmed_at: "2026-09-10T12:00:04Z",
    });
  }
  persist();
  return current;
}

export function persist(): void {
  if (!current) return;
  try {
    globalThis.localStorage?.setItem(CHANNEL_KEY, JSON.stringify(current));
  } catch {
    /* quota or unavailable */
  }
}

export function resetDb(): MockDb {
  current = seedDb();
  persist();
  return current;
}

/** Re-reads from localStorage (other tab wrote). */
export function reloadDb(): MockDb {
  current = undefined;
  return loadDb();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY) current = undefined;
  });
}

/** Fake Hedera transaction id, monotonic within this db. */
export function nextTxId(db: MockDb, payerId = "0.0.10463136"): string {
  db.txCounter += 1;
  const seconds = Math.floor(Date.now() / 1000);
  return `${payerId}@${seconds}.${String(db.txCounter).padStart(9, "0")}`;
}

export function ledgerBalance(db: MockDb, address: string): bigint {
  const key = address.toLowerCase();
  if (db.ledger[key] === undefined) {
    db.ledger[key] = "1000000"; // 1.0000 USDC welcome balance
    persist();
  }
  return BigInt(db.ledger[key]);
}

export function ledgerAdjust(db: MockDb, address: string, delta: bigint): bigint {
  const next = ledgerBalance(db, address) + delta;
  if (next < 0n) throw new Error("insufficient mock balance");
  db.ledger[address.toLowerCase()] = next.toString();
  persist();
  return next;
}
