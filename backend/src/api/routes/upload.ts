import { Router, type Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../shared/db/client.js";
import { videos } from "../../shared/db/schema.js";
import { creatorByAddress, toVideo } from "../../shared/db/queries.js";
import { HEDERA_ENTITY_ID_REGEX, newCreatorId, newVideoId, normalizeAddress } from "../../shared/ids.js";
import { creators } from "../../shared/db/schema.js";
import { findAccount } from "../../shared/hedera.js";
import { objectKeys, storage } from "../../shared/storage.js";
import { env } from "../../shared/env.js";
import { getTranscodeQueue } from "../../shared/queues.js";
import { chunkCount, MAX_FREE_PREVIEW_CHUNKS, minTotalPrice, pricedChunkCount, segmentCount } from "../../shared/price.js";
import { mirror, USDC_TOKEN_ID } from "../../shared/hedera.js";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Without World ID (parked) every connected wallet is a creator: the row is opened on first
 * upload. The Hedera account id comes from the client or the Mirror Node (needed for payouts).
 */
async function requireCreator(req: Request) {
  const address = typeof req.body?.address === "string" ? normalizeAddress(req.body.address) : "";
  if (!address) return undefined;
  const existing = await creatorByAddress(address);
  if (existing) return existing;
  const bodyAccount = typeof req.body?.accountId === "string" && HEDERA_ENTITY_ID_REGEX.test(req.body.accountId) ? req.body.accountId : undefined;
  const accountId = bodyAccount ?? (await findAccount(address).catch(() => undefined))?.account;
  if (!accountId) return undefined;
  const base = address.slice(2, 10);
  let handle = base;
  for (let i = 0; i < 5; i += 1) {
    const [inserted] = await db
      .insert(creators)
      .values({ id: newCreatorId(), wallet_address: address, hedera_account_id: accountId, handle, display_name: base, verified_at: new Date() })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;
    const again = await creatorByAddress(address);
    if (again) return again;
    handle = `${base}-${i + 2}`;
  }
  return undefined;
}

/** Raw upload proxy: mounted BEFORE express.json so the body streams straight into storage. */
export function uploadProxyRouter(): Router {
  const router = Router();
  router.put("/upload/put/:videoId/:name", async (req, res) => {
    const length = Number(req.headers["content-length"] ?? 0);
    if (length > MAX_UPLOAD_BYTES) return res.status(413).json({ error: "file too large" });
    const key = objectKeys.source(req.params.videoId, req.params.name);
    try {
      await storage.putStream(key, req, req.headers["content-type"]);
      res.status(200).end();
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "upload failed" });
    }
  });
  return router;
}

export function uploadRouter(): Router {
  const router = Router();

  router.post("/upload/presign", async (req, res) => {
    const creator = await requireCreator(req);
    if (!creator) return res.status(403).json({ error: "No Hedera account for this wallet yet. Fund it first." });
    const name = String(req.body?.name ?? "video.mp4");
    const videoId = newVideoId();
    const key = objectKeys.source(videoId, name);
    const presigned = env.UPLOAD_MODE === "presign" ? await storage.presignPut(key) : undefined;
    res.json({ uploadUrl: presigned ?? `/api/upload/put/${videoId}/${encodeURIComponent(key.split("/").pop()!)}`, key, videoId });
  });

  /** Upload complete: the video enters processing and the worker transcodes it. */
  router.post("/upload/complete", async (req, res) => {
    const creator = await requireCreator(req);
    if (!creator) return res.status(403).json({ error: "No Hedera account for this wallet yet. Fund it first." });
    const body = req.body as { videoId?: string; key?: string; title?: string; description?: string; durationSeconds?: number };
    if (!body.videoId || !body.key) return res.status(400).json({ error: "videoId and key required" });
    const duration = Math.max(1, Number(body.durationSeconds) || 60);
    const segments = segmentCount(duration);
    const [video] = await db
      .insert(videos)
      .values({
        id: body.videoId,
        creator_id: creator.id,
        title: (body.title || "Untitled").slice(0, 200),
        description: (body.description || "").slice(0, 5000),
        duration_seconds: duration,
        segment_count: segments,
        chunk_count: chunkCount(duration),
        status: "processing",
        source_key: body.key,
      })
      .returning();
    await getTranscodeQueue().add("transcode", { videoId: video.id, sourceKey: body.key }, { jobId: `transcode-${video.id}`, attempts: 2, backoff: { type: "exponential", delay: 30_000 } });
    res.json(await toVideo(video, creator));
  });

  router.post("/upload/publish", async (req, res) => {
    const creator = await requireCreator(req);
    if (!creator) return res.status(403).json({ error: "No Hedera account for this wallet yet. Fund it first." });
    const body = req.body as { videoId?: string; totalPrice?: string; freePreviewChunks?: number };
    const video = await db.query.videos.findFirst({ where: eq(videos.id, body.videoId ?? "") });
    if (!video || video.creator_id !== creator.id) return res.status(404).json({ error: "video not found" });
    if (video.status !== "ready") return res.status(409).json({ error: "video is still processing" });
    if (typeof body.totalPrice !== "string" || !/^\d+$/.test(body.totalPrice) || BigInt(body.totalPrice) <= 0n) {
      return res.status(400).json({ error: "invalid price" });
    }
    const free = Math.max(0, Math.min(MAX_FREE_PREVIEW_CHUNKS, Number(body.freePreviewChunks) || 0));
    const min = minTotalPrice(pricedChunkCount(video.duration_seconds, free));
    if (BigInt(body.totalPrice) < min) return res.status(400).json({ error: `Too low for this length. Minimum is ${min} base units.` });
    const receivable = await mirror.canReceiveToken(creator.hedera_account_id, USDC_TOKEN_ID).catch(() => true);
    if (!receivable) return res.status(409).json({ error: "Creator account must be associated with USDC" });
    const [updated] = await db
      .update(videos)
      .set({ total_price: body.totalPrice, free_preview_chunks: free, published_at: new Date() })
      .where(eq(videos.id, video.id))
      .returning();
    res.json(await toVideo(updated, creator));
  });

  return router;
}
