import { and, count, desc, eq, gt, inArray, ne, or, sql as raw } from "drizzle-orm";
import { db } from "./client.js";
import { charges, creators, likes, sessions, settlements, videos, type CreatorRow, type SessionRow, type VideoRow } from "./schema.js";
import { badgeOf, earningsStatus, receiptRefunded, servedChunks } from "../accounting.js";
import { newCreatorId, normalizeAddress } from "../ids.js";
import { findAccount } from "../hedera.js";

/** Public video shape (mirrors frontend/src/api/types.ts `Video`). */
export type VideoOut = {
  id: string;
  creator_id: string;
  creator: { handle: string; display_name: string; hedera_account_id: string; avatar_url: string };
  title: string;
  description: string;
  duration_seconds: number;
  chunk_count: number;
  segment_count: number;
  status: VideoRow["status"];
  free_preview_chunks: number;
  total_price: string;
  thumbnail_url: string;
  created_at: string;
  views: number;
  likes: number;
};

/** Versioned URL of a creator's photo, or "" when none is set (clients fall back to the glyph). */
export function avatarUrl(creator: Pick<CreatorRow, "id" | "avatar_key">): string {
  if (!creator.avatar_key) return "";
  const version = creator.avatar_key.split("/").pop()?.split(".")[0] ?? "0";
  return `/api/creators/${creator.id}/avatar?v=${version}`;
}

export function thumbnailUrl(video: VideoRow): string {
  return video.thumbnail_key ? `/api/videos/${video.id}/thumbnail` : "";
}

export async function toVideo(video: VideoRow, creator?: CreatorRow): Promise<VideoOut> {
  const c = creator ?? (await db.query.creators.findFirst({ where: eq(creators.id, video.creator_id) }));
  if (!c) throw new Error(`creator ${video.creator_id} missing for video ${video.id}`);
  const [[viewRow], [likeRow]] = await Promise.all([
    db.select({ n: count() }).from(sessions).where(and(eq(sessions.video_id, video.id), gt(sessions.chunks_consumed, 0))),
    db.select({ n: count() }).from(likes).where(eq(likes.video_id, video.id)),
  ]);
  return {
    id: video.id,
    creator_id: video.creator_id,
    creator: { handle: c.handle, display_name: c.display_name, hedera_account_id: c.hedera_account_id, avatar_url: avatarUrl(c) },
    title: video.title,
    description: video.description,
    duration_seconds: video.duration_seconds,
    chunk_count: video.chunk_count,
    segment_count: video.segment_count,
    status: video.status,
    free_preview_chunks: video.free_preview_chunks,
    total_price: video.total_price,
    thumbnail_url: thumbnailUrl(video),
    created_at: video.created_at.toISOString(),
    views: video.seed_views + Number(viewRow?.n ?? 0),
    likes: Number(likeRow?.n ?? 0) + Math.floor(video.seed_views / 9),
  };
}

export async function toVideos(rows: VideoRow[]): Promise<VideoOut[]> {
  const creatorRows = rows.length ? await db.select().from(creators).where(inArray(creators.id, [...new Set(rows.map(r => r.creator_id))])) : [];
  const byId = new Map(creatorRows.map(c => [c.id, c]));
  return Promise.all(rows.map(v => toVideo(v, byId.get(v.creator_id))));
}

export async function listVideos(filter = "all"): Promise<VideoOut[]> {
  if (filter === "live") return [];
  const rows = await db
    .select()
    .from(videos)
    .where(filter === "free" ? and(eq(videos.status, "ready"), gt(videos.free_preview_chunks, 0)) : eq(videos.status, "ready"))
    .orderBy(desc(videos.created_at));
  return toVideos(rows.filter(v => BigInt(v.total_price) > 0n));
}

export type SessionListRow = {
  id: string;
  viewer_address: string;
  paid_amount: string;
  watched_seconds: number;
  watched_percent: number;
  started_at: string;
  status: SessionRow["status"];
  badge: ReturnType<typeof badgeOf>;
  tx: string | null;
};

export async function sessionList(video: VideoRow, tab: "recent" | "top") {
  const rows = await db
    .select({ s: sessions, tx: settlements.tx_hash })
    .from(sessions)
    .leftJoin(settlements, eq(sessions.settlement_id, settlements.id))
    .where(
      and(
        eq(sessions.video_id, video.id),
        or(gt(sessions.chunks_consumed, 0), gt(sessions.chunks_served, 0), inArray(sessions.status, ["locked", "streaming"])),
      ),
    );
  const mapped: SessionListRow[] = rows.map(({ s, tx }) => {
    const served = servedChunks(s);
    return {
      id: s.id,
      viewer_address: s.viewer_address,
      paid_amount: s.consumed_amount,
      watched_seconds: Math.min(video.duration_seconds, served * 5),
      watched_percent: Math.min(100, Math.round((served / Math.max(1, video.chunk_count)) * 100)),
      started_at: s.started_at.toISOString(),
      status: s.status,
      badge: badgeOf(s),
      tx: tx ?? null,
    };
  });
  const live = mapped.filter(r => r.badge === "streaming");
  const rest = mapped.filter(r => r.badge !== "streaming");
  if (tab === "top") rest.sort((a, b) => Number(BigInt(b.paid_amount) - BigInt(a.paid_amount)));
  else rest.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const consumed = rows.filter(r => r.s.chunks_consumed > 0);
  return {
    total_sessions: video.seed_views + consumed.length,
    total_earned: rows.reduce((a, r) => a + BigInt(r.s.consumed_amount), 0n).toString(),
    live_count: live.length,
    rows: [...live, ...rest].slice(0, 50),
  };
}

export async function receiptOf(session: SessionRow) {
  const [video, settlement] = await Promise.all([
    db.query.videos.findFirst({ where: eq(videos.id, session.video_id) }),
    session.settlement_id ? db.query.settlements.findFirst({ where: eq(settlements.id, session.settlement_id) }) : undefined,
  ]);
  return {
    sessionId: session.id,
    videoId: session.video_id,
    videoTitle: video?.title ?? "",
    status: session.status,
    locked: session.locked_amount,
    watched: session.consumed_amount,
    chunks: session.chunks_consumed,
    toCreator: session.consumed_amount,
    refunded: receiptRefunded(session),
    refundTx: session.refund_tx,
    settlementTx: settlement?.tx_hash ?? null,
  };
}

export async function creatorByAddress(address: string): Promise<CreatorRow | undefined> {
  return db.query.creators.findFirst({ where: eq(creators.wallet_address, normalizeAddress(address)) });
}

export async function meOf(address: string) {
  const addr = normalizeAddress(address);
  const creator = await creatorByAddress(addr);
  const [row] = await db
    .select({ spent: raw<string>`coalesce(sum(${sessions.consumed_amount}), 0)::text` })
    .from(sessions)
    .where(and(eq(sessions.viewer_address, addr), raw`${sessions.started_at}::date = (now() at time zone 'utc')::date`));
  return {
    address,
    // "verified" means a World ID Selfie Check backs this wallet, not merely that a creator row exists
    verified: !!creator?.world_nullifier_hash,
    creator: creator
      ? {
          handle: creator.handle,
          display_name: creator.display_name,
          description: creator.description,
          hedera_account_id: creator.hedera_account_id,
          avatar_url: avatarUrl(creator),
        }
      : null,
    spent_today: row?.spent ?? "0",
  };
}

export async function earningsOf(address: string) {
  const creator = await creatorByAddress(address);
  if (!creator) return { total_earned: "0", chunks_served: 0, unique_viewers: 0, rows: [] };
  const vids = await db.select().from(videos).where(eq(videos.creator_id, creator.id)).orderBy(desc(videos.created_at));
  const rows = await Promise.all(
    vids.map(async video => {
      const ss = await db.select().from(sessions).where(eq(sessions.video_id, video.id));
      const settled = ss.filter(s => s.status === "settled").reduce((a, s) => a + BigInt(s.consumed_amount), 0n);
      const pending = ss.filter(s => s.status !== "settled").reduce((a, s) => a + BigInt(s.consumed_amount), 0n);
      return {
        video_id: video.id,
        title: video.title,
        thumbnail_url: thumbnailUrl(video),
        chunks_served: ss.reduce((a, s) => a + servedChunks(s), 0),
        earned: settled.toString(),
        pending: pending.toString(),
        status: earningsStatus(video.status, pending),
      };
    }),
  );
  const viewerRows = vids.length
    ? await db
        .selectDistinct({ v: sessions.viewer_address })
        .from(sessions)
        .where(and(inArray(sessions.video_id, vids.map(v => v.id)), gt(sessions.chunks_consumed, 0)))
    : [];
  return {
    total_earned: rows.reduce((a, r) => a + BigInt(r.earned), 0n).toString(),
    chunks_served: rows.reduce((a, r) => a + r.chunks_served, 0),
    unique_viewers: viewerRows.length,
    rows,
  };
}

export async function channelOf(handle: string) {
  const creator = await db.query.creators.findFirst({ where: eq(creators.handle, handle) });
  if (!creator) return undefined;
  const vids = await db.select().from(videos).where(eq(videos.creator_id, creator.id)).orderBy(desc(videos.created_at));
  const ss = vids.length
    ? await db.select().from(sessions).where(and(inArray(sessions.video_id, vids.map(v => v.id)), gt(sessions.chunks_consumed, 0)))
    : [];
  return {
    creator: {
      handle: creator.handle,
      display_name: creator.display_name,
      description: creator.description,
      hedera_account_id: creator.hedera_account_id,
      avatar_url: avatarUrl(creator),
    },
    videos: await toVideos(vids.filter(v => v.status === "ready" && BigInt(v.total_price) > 0n)),
    total_earned: ss.reduce((a, s) => a + BigInt(s.consumed_amount), 0n).toString(),
    sessions: ss.length + vids.reduce((a, v) => a + v.seed_views, 0),
  };
}

export async function recordCharge(sessionId: string, chunkIndex: number, pricedIndex: number, amount: string, cumulative: string): Promise<void> {
  await db.insert(charges).values({ session_id: sessionId, chunk_index: chunkIndex, priced_index: pricedIndex, amount, cumulative }).onConflictDoNothing();
}

export { ne };

/**
 * Every connected wallet is a creator (World ID is parked): the row is opened the first time it is
 * needed, on upload or when the profile is edited. The Hedera account id comes from the client or
 * the Mirror Node and is required for payouts.
 */
export async function ensureCreator(address: string, accountIdHint?: string) {
  const addr = normalizeAddress(address);
  const existing = await creatorByAddress(addr);
  if (existing) return existing;
  const accountId = accountIdHint ?? (await findAccount(addr).catch(() => undefined))?.account;
  if (!accountId) return undefined;
  const base = addr.slice(2, 10);
  let handle = base;
  for (let i = 0; i < 5; i += 1) {
    const [inserted] = await db
      .insert(creators)
      .values({ id: newCreatorId(), wallet_address: addr, hedera_account_id: accountId, handle, display_name: base, verified_at: new Date() })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;
    const again = await creatorByAddress(addr);
    if (again) return again;
    handle = `${base}-${i + 2}`;
  }
  return undefined;
}

/** Channel name and description as the creator wants them shown. */
export async function updateCreatorProfile(creatorId: string, patch: { display_name?: string; description?: string; avatar_key?: string | null }) {
  const [row] = await db.update(creators).set(patch).where(eq(creators.id, creatorId)).returning();
  return row;
}
