import { http, HttpResponse } from "msw";
import { ledgerBalance, loadDb, nextTxId, persist, type CreatorRow, type MockDb, type SessionRow, type VideoRow } from "../db";
import { closeSession } from "../x402/channels";
import type { EarningsRow, Me, SessionListRow, Video } from "@/api/types";
import { chunkCount, pricedChunkCount, segmentCount } from "@/lib/price";

function creatorOf(db: MockDb, video: VideoRow): CreatorRow {
  return db.creators.find(c => c.id === video.creator_id) ?? db.creators[0];
}

/** A view is a session that consumed at least one chunk (guide §9). */
function viewsOf(db: MockDb, video: VideoRow): number {
  return video.seed_views + db.sessions.filter(s => s.video_id === video.id && s.chunks_consumed > 0 && !s.id.startsWith("seed-")).length;
}

export function toVideo(db: MockDb, video: VideoRow): Video {
  const creator = creatorOf(db, video);
  return {
    id: video.id,
    creator_id: video.creator_id,
    creator: {
      handle: creator.handle,
      display_name: creator.display_name,
      hedera_account_id: creator.hedera_account_id,
      subscribers: creator.subscribers,
    },
    title: video.title,
    description: video.description,
    duration_seconds: video.duration_seconds,
    chunk_count: video.chunk_count,
    segment_count: video.segment_count,
    status: video.status,
    free_preview_chunks: video.free_preview_chunks,
    total_price: video.total_price,
    thumbnail_url: video.thumbnail_key,
    created_at: video.created_at,
    views: viewsOf(db, video),
    likes: db.likes.filter(l => l.video_id === video.id).length + Math.floor(video.seed_views / 9),
  };
}

function badgeOf(session: SessionRow): SessionListRow["badge"] {
  if (session.status === "locked" || session.status === "streaming") return "streaming";
  if (session.status === "settled") return "settled";
  if (session.chunks_consumed === 0 && session.free_preview_chunks > 0) return "free";
  return "pending";
}

function toSessionRow(db: MockDb, session: SessionRow, video: VideoRow): SessionListRow {
  const settlement = session.settlement_batch_id ? db.settlements.find(s => s.id === session.settlement_batch_id) : undefined;
  const servedChunks = Math.max(session.chunks_served, session.chunks_consumed + session.free_preview_chunks);
  return {
    id: session.id,
    viewer_address: session.viewer_address,
    paid_amount: session.consumed_amount,
    watched_seconds: Math.min(video.duration_seconds, servedChunks * 5),
    watched_percent: Math.min(100, Math.round((servedChunks / Math.max(1, video.chunk_count)) * 100)),
    started_at: session.started_at,
    status: session.status,
    badge: badgeOf(session),
    tx: settlement?.tx_hash ?? null,
  };
}

function creatorForAddress(db: MockDb, address: string): CreatorRow | undefined {
  return db.creators.find(c => c.wallet_address.toLowerCase() === address.toLowerCase());
}

/** Without World ID a connected wallet is a creator: the row is opened on first upload. */
function ensureCreator(db: MockDb, address: string, accountId?: string): CreatorRow {
  const existing = creatorForAddress(db, address);
  if (existing) return existing;
  const handle = address.slice(2, 10).toLowerCase();
  const creator: CreatorRow = {
    id: `creator-${db.creators.length + 1}`,
    wallet_address: address.toLowerCase(),
    hedera_account_id: accountId ?? "0.0.0",
    handle,
    display_name: handle,
    world_nullifier_hash: null,
    verified_at: new Date().toISOString(),
    subscribers: 0,
  };
  db.creators.push(creator);
  persist();
  return creator;
}

function meOf(db: MockDb, address: string): Me {
  const creator = creatorForAddress(db, address);
  const today = new Date().toISOString().slice(0, 10);
  const spent = db.sessions
    .filter(s => s.viewer_address.toLowerCase() === address.toLowerCase() && s.started_at.slice(0, 10) === today)
    .reduce((acc, s) => acc + BigInt(s.consumed_amount), 0n);
  return {
    address,
    verified: !!creator,
    creator: creator
      ? { handle: creator.handle, display_name: creator.display_name, hedera_account_id: creator.hedera_account_id }
      : null,
    spent_today: spent.toString(),
  };
}

const processingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const apiHandlers = [
  http.get("/api/videos", ({ request }) => {
    const db = loadDb();
    const filter = new URL(request.url).searchParams.get("filter") ?? "all";
    let rows = db.videos.filter(v => v.status === "ready");
    if (filter === "free") rows = rows.filter(v => v.free_preview_chunks > 0);
    if (filter === "live") rows = [];
    return HttpResponse.json(rows.map(v => toVideo(db, v)));
  }),

  http.get("/api/videos/:id", ({ params }) => {
    const db = loadDb();
    const video = db.videos.find(v => v.id === params.id);
    if (!video) return HttpResponse.json({ error: "video not found" }, { status: 404 });
    return HttpResponse.json(toVideo(db, video));
  }),

  /** Opens a session row. The deposit itself happens on the x402 lock route. */
  http.post("/api/session/lock", async ({ request }) => {
    const db = loadDb();
    const body = (await request.json()) as { videoId: string; viewer: string };
    const video = db.videos.find(v => v.id === body.videoId);
    if (!video) return HttpResponse.json({ error: "video not found" }, { status: 404 });
    if (!body.viewer) return HttpResponse.json({ error: "viewer required" }, { status: 400 });
    const priced = pricedChunkCount(video.duration_seconds, video.free_preview_chunks);
    const id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const session: SessionRow = {
      id,
      video_id: video.id,
      viewer_address: body.viewer.toLowerCase(),
      locked_amount: video.total_price,
      priced_chunk_count: priced,
      free_preview_chunks: video.free_preview_chunks,
      lock_tx: null,
      started_at: new Date().toISOString(),
      ended_at: null,
      chunks_served: 0,
      chunks_consumed: 0,
      paid_chunks: [],
      consumed_amount: "0",
      refunded_amount: "0",
      refund_tx: null,
      status: "locked",
      settlement_batch_id: null,
      channel_id: null,
    };
    db.sessions.push(session);
    persist();
    const creator = creatorOf(db, video);
    return HttpResponse.json({
      sessionId: id,
      playlistUrl: `/stream/${video.id}/playlist.m3u8?s=${id}`,
      lockUrl: `/stream/${video.id}/lock?s=${id}`,
      closeUrl: `/stream/${video.id}/close?s=${id}`,
      pricedChunks: priced,
      creatorAccountId: creator.hedera_account_id,
    });
  }),

  /** Best-effort close (pagehide / refund failure): marks the session for the sweeper. */
  http.post("/api/session/close", async ({ request }) => {
    const db = loadDb();
    const body = (await request.json().catch(() => ({}))) as { sessionId?: string; reason?: string };
    const session = db.sessions.find(s => s.id === body.sessionId);
    if (!session) return HttpResponse.json({ error: "session not found" }, { status: 404 });
    if (session.status === "locked" || session.status === "streaming") {
      if (body.reason === "complete") {
        closeSession(session, "0", null);
      } else {
        session.status = "closing";
      }
      persist();
    }
    return HttpResponse.json({ ok: true });
  }),

  http.get("/api/session/:id/receipt", ({ params }) => {
    const db = loadDb();
    const session = db.sessions.find(s => s.id === params.id);
    if (!session) return HttpResponse.json({ error: "session not found" }, { status: 404 });
    const video = db.videos.find(v => v.id === session.video_id);
    const settlement = session.settlement_batch_id ? db.settlements.find(s => s.id === session.settlement_batch_id) : undefined;
    return HttpResponse.json({
      sessionId: session.id,
      videoId: session.video_id,
      videoTitle: video?.title ?? "",
      status: session.status,
      locked: session.locked_amount,
      watched: session.consumed_amount,
      chunks: session.chunks_consumed,
      toCreator: session.consumed_amount,
      refunded: session.status === "closed" || session.status === "settled" ? session.refunded_amount : (BigInt(session.locked_amount) - BigInt(session.consumed_amount)).toString(),
      refundTx: session.refund_tx,
      settlementTx: settlement?.tx_hash ?? null,
    });
  }),

  http.get("/api/video/:id/sessions", ({ params, request }) => {
    const db = loadDb();
    const video = db.videos.find(v => v.id === params.id);
    if (!video) return HttpResponse.json({ error: "video not found" }, { status: 404 });
    const tab = new URL(request.url).searchParams.get("tab") ?? "recent";
    const sessions = db.sessions.filter(s => s.video_id === video.id && (s.chunks_consumed > 0 || s.chunks_served > 0 || s.status === "streaming" || s.status === "locked"));
    const rows = sessions.map(s => toSessionRow(db, s, video));
    const live = rows.filter(r => r.badge === "streaming");
    const rest = rows.filter(r => r.badge !== "streaming");
    if (tab === "top") rest.sort((a, b) => Number(BigInt(b.paid_amount) - BigInt(a.paid_amount)));
    else rest.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
    const totalEarned = sessions.reduce((acc, s) => acc + BigInt(s.consumed_amount), 0n);
    return HttpResponse.json({
      total_sessions: video.seed_views + sessions.filter(s => s.chunks_consumed > 0 && !s.id.startsWith("seed-")).length,
      total_earned: totalEarned.toString(),
      live_count: live.length,
      rows: [...live, ...rest].slice(0, 50),
    });
  }),

  http.get("/api/video/:id/like", ({ params, request }) => {
    const db = loadDb();
    const videoId = String(params.id);
    const video = db.videos.find(v => v.id === videoId);
    if (!video) return HttpResponse.json({ error: "video not found" }, { status: 404 });
    const viewer = (new URL(request.url).searchParams.get("viewer") ?? "").toLowerCase();
    const liked = !!viewer && db.likes.some(l => l.video_id === videoId && l.viewer_address === viewer);
    return HttpResponse.json({ likes: toVideo(db, video).likes, liked });
  }),

  http.post("/api/video/:id/like", async ({ params, request }) => {
    const db = loadDb();
    const body = (await request.json()) as { viewer: string };
    const videoId = String(params.id);
    const existing = db.likes.findIndex(l => l.video_id === videoId && l.viewer_address === body.viewer.toLowerCase());
    if (existing >= 0) db.likes.splice(existing, 1);
    else db.likes.push({ video_id: videoId, viewer_address: body.viewer.toLowerCase(), created_at: new Date().toISOString() });
    persist();
    const video = db.videos.find(v => v.id === videoId)!;
    return HttpResponse.json({ likes: toVideo(db, video).likes, liked: existing < 0 });
  }),

  http.get("/api/wallet/balance", ({ request }) => {
    const address = new URL(request.url).searchParams.get("address") ?? "";
    return HttpResponse.json({ address, balance: ledgerBalance(loadDb(), address).toString() });
  }),

  http.post("/api/onboard/faucet", async ({ request }) => {
    const db = loadDb();
    const body = (await request.json()) as { address: string };
    const key = body.address.toLowerCase();
    if (!db.faucet[key]) {
      db.faucet[key] = nextTxId(db);
      persist();
    }
    const n = Object.keys(db.faucet).indexOf(key) + 1;
    return HttpResponse.json({ txId: db.faucet[key], accountId: `0.0.${10470000 + n}` });
  }),

  http.get("/api/me", ({ request }) => {
    const address = new URL(request.url).searchParams.get("address") ?? "";
    return HttpResponse.json(meOf(loadDb(), address));
  }),

  http.get("/api/me/earnings", ({ request }) => {
    const db = loadDb();
    const address = new URL(request.url).searchParams.get("address") ?? "";
    const creator = creatorForAddress(db, address);
    const videos = creator ? db.videos.filter(v => v.creator_id === creator.id) : [];
    const rows: EarningsRow[] = videos.map(video => {
      const sessions = db.sessions.filter(s => s.video_id === video.id);
      const settled = sessions.filter(s => s.status === "settled").reduce((a, s) => a + BigInt(s.consumed_amount), 0n);
      const pending = sessions.filter(s => s.status !== "settled").reduce((a, s) => a + BigInt(s.consumed_amount), 0n);
      return {
        video_id: video.id,
        title: video.title,
        thumbnail_url: video.thumbnail_key,
        chunks_served: sessions.reduce((a, s) => a + Math.max(s.chunks_served, s.chunks_consumed + s.free_preview_chunks), 0),
        earned: settled.toString(),
        pending: pending.toString(),
        status: video.status === "processing" ? "processing" : pending > 0n ? "payout pending" : "settled",
      };
    });
    const viewers = new Set(db.sessions.filter(s => videos.some(v => v.id === s.video_id) && s.chunks_consumed > 0).map(s => s.viewer_address));
    return HttpResponse.json({
      total_earned: rows.reduce((a, r) => a + BigInt(r.earned), 0n).toString(),
      chunks_served: rows.reduce((a, r) => a + r.chunks_served, 0),
      unique_viewers: viewers.size,
      rows,
    });
  }),

  http.get("/api/channel/:handle", ({ params }) => {
    const db = loadDb();
    const creator = db.creators.find(c => c.handle === params.handle);
    if (!creator) return HttpResponse.json({ error: "channel not found" }, { status: 404 });
    const videos = db.videos.filter(v => v.creator_id === creator.id);
    const sessions = db.sessions.filter(s => videos.some(v => v.id === s.video_id) && s.chunks_consumed > 0);
    return HttpResponse.json({
      creator: {
        handle: creator.handle,
        display_name: creator.display_name,
        hedera_account_id: creator.hedera_account_id,
        subscribers: creator.subscribers,
      },
      videos: videos.map(v => toVideo(db, v)),
      total_earned: sessions.reduce((a, s) => a + BigInt(s.consumed_amount), 0n).toString(),
      sessions: sessions.length + videos.reduce((a, v) => a + v.seed_views, 0),
    });
  }),

  http.post("/api/upload/presign", async ({ request }) => {
    const db = loadDb();
    const body = (await request.json()) as { name: string; size: number; type: string; address: string; accountId?: string };
    ensureCreator(db, body.address, body.accountId);
    const videoId = `v-${Date.now().toString(36)}`;
    const key = `uploads/${videoId}/${encodeURIComponent(body.name)}`;
    return HttpResponse.json({ uploadUrl: `/mock-storage/${key}`, key, videoId });
  }),

  http.put("/mock-storage/*", async ({ request }) => {
    const db = loadDb();
    const key = new URL(request.url).pathname.replace("/mock-storage/", "");
    const blob = await request.arrayBuffer();
    db.uploads[key] = { size: blob.byteLength, type: request.headers.get("content-type") ?? "" };
    persist();
    return new HttpResponse(null, { status: 200 });
  }),

  /** Upload complete: the video enters processing; "transcode" finishes after 3 s. */
  http.post("/api/upload/complete", async ({ request }) => {
    const db = loadDb();
    const body = (await request.json()) as {
      videoId: string;
      key: string;
      title: string;
      description: string;
      recipient: string;
      durationSeconds: number;
      address: string;
      accountId?: string;
    };
    const creator = ensureCreator(db, body.address, body.accountId);
    const duration = Math.max(5, Math.round(body.durationSeconds || 60));
    const segments = segmentCount(duration);
    const asset = duration <= 30 ? "d30" : duration <= 60 ? "d60" : duration <= 120 ? "d120" : "d300";
    const video: VideoRow = {
      id: body.videoId,
      creator_id: creator.id,
      title: body.title,
      description: body.description,
      duration_seconds: duration,
      segment_count: segments,
      chunk_count: chunkCount(duration),
      status: "processing",
      free_preview_chunks: 0,
      total_price: "0",
      thumbnail_key: `/demo/${asset}/thumb.jpg`,
      asset,
      created_at: new Date().toISOString(),
      seed_views: 0,
    };
    db.videos.push(video);
    persist();
    processingTimers.set(video.id, setTimeout(() => {
      const current = loadDb().videos.find(v => v.id === video.id);
      if (current) {
        current.status = "ready";
        persist();
      }
    }, 3000));
    return HttpResponse.json(toVideo(db, video));
  }),

  http.post("/api/upload/publish", async ({ request }) => {
    const db = loadDb();
    const body = (await request.json()) as { videoId: string; totalPrice: string; freePreviewChunks: number; address: string };
    const video = db.videos.find(v => v.id === body.videoId);
    if (!video) return HttpResponse.json({ error: "video not found" }, { status: 404 });
    if (!/^\d+$/.test(body.totalPrice) || BigInt(body.totalPrice) <= 0n) {
      return HttpResponse.json({ error: "invalid price" }, { status: 400 });
    }
    video.total_price = body.totalPrice;
    video.free_preview_chunks = Math.max(0, Math.min(12, body.freePreviewChunks | 0));
    persist();
    return HttpResponse.json(toVideo(db, video));
  }),

  // World ID handlers (parked):
  //   /** Unsigned placeholder RP context. The real server signs nonce+created_at with the RP key. */
  //   http.post("/api/verify/world/request", () => {
  //     const now = Math.floor(Date.now() / 1000);
  //     return HttpResponse.json({
  //       rp_id: "rp_mock_hederatube",
  //       nonce: crypto.randomUUID().replace(/-/g, ""),
  //       created_at: now,
  //       expires_at: now + 300,
  //       signature: "0x" + "00".repeat(64),
  //     });
  //   }),
  // 
  //   http.post("/api/verify/world", async ({ request }) => {
  //     const db = loadDb();
  //     const body = (await request.json()) as {
  //       address: string;
  //       accountId?: string;
  //       proof: { nullifier_hash?: string };
  //       handle: string;
  //       displayName: string;
  //     };
  //     const nullifier = body.proof?.nullifier_hash;
  //     if (!nullifier) return HttpResponse.json({ error: "proof missing nullifier_hash" }, { status: 400 });
  //     const clash = db.creators.find(c => c.world_nullifier_hash === nullifier && c.wallet_address.toLowerCase() !== body.address.toLowerCase());
  //     if (clash) return HttpResponse.json({ error: "This World ID already backs another creator account." }, { status: 409 });
  //     const handle = (body.handle || body.address.slice(2, 10)).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  //     if (db.creators.some(c => c.handle === handle && c.wallet_address.toLowerCase() !== body.address.toLowerCase())) {
  //       return HttpResponse.json({ error: "Handle is taken." }, { status: 409 });
  //     }
  //     let creator = creatorForAddress(db, body.address);
  //     if (!creator) {
  //       creator = {
  //         id: `creator-${db.creators.length + 1}`,
  //         wallet_address: body.address.toLowerCase(),
  //         hedera_account_id: body.accountId ?? "0.0.0",
  //         handle,
  //         display_name: body.displayName || handle,
  //         world_nullifier_hash: nullifier,
  //         verified_at: new Date().toISOString(),
  //         subscribers: 0,
  //       };
  //       db.creators.push(creator);
  //     }
  //     persist();
  //     return HttpResponse.json(meOf(db, body.address));
  //   }),

];
