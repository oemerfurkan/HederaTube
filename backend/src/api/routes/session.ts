import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../shared/db/client.js";
import { requestSettlementSoon } from "../../shared/queues.js";
import { creators, sessions, videos } from "../../shared/db/schema.js";
import { receiptOf } from "../../shared/db/queries.js";
import { newSessionId, normalizeAddress } from "../../shared/ids.js";
import { pricedChunkCount } from "../../shared/price.js";

export function sessionRouter(): Router {
  const router = Router();

  /** Opens a session row. The deposit itself happens on the x402 lock route. */
  router.post("/session/lock", async (req, res) => {
    const { videoId, viewer } = (req.body ?? {}) as { videoId?: string; viewer?: string };
    if (!viewer) return res.status(400).json({ error: "viewer required" });
    const [row] = await db
      .select({ video: videos, creator: creators })
      .from(videos)
      .innerJoin(creators, eq(videos.creator_id, creators.id))
      .where(eq(videos.id, videoId ?? ""))
      .limit(1);
    if (!row) return res.status(404).json({ error: "video not found" });
    const { video, creator } = row;
    if (video.status !== "ready" || BigInt(video.total_price) <= 0n) return res.status(409).json({ error: "video is not published" });
    const priced = pricedChunkCount(video.duration_seconds, video.free_preview_chunks);
    const id = newSessionId();
    await db.insert(sessions).values({
      id,
      video_id: video.id,
      viewer_address: normalizeAddress(viewer),
      locked_amount: video.total_price,
      priced_chunk_count: priced,
      free_preview_chunks: video.free_preview_chunks,
      status: "locked",
    });
    res.json({
      sessionId: id,
      playlistUrl: `/stream/${video.id}/playlist.m3u8?s=${id}`,
      lockUrl: `/stream/${video.id}/lock?s=${id}`,
      closeUrl: `/stream/${video.id}/close?s=${id}`,
      pricedChunks: priced,
      creatorAccountId: creator.hedera_account_id,
    });
  });

  /** Best-effort close (pagehide / refund failure): marks the session for the sweeper. */
  router.post("/session/close", async (req, res) => {
    const { sessionId, reason } = (req.body ?? {}) as { sessionId?: string; reason?: string };
    const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId ?? "") });
    if (!session) return res.status(404).json({ error: "session not found" });
    if (session.status === "locked" || session.status === "streaming") {
      if (reason === "complete") {
        await db
          .update(sessions)
          .set({ status: "closed", ended_at: new Date(), refunded_amount: "0", close_reason: "complete" })
          .where(eq(sessions.id, session.id));
      } else {
        await db.update(sessions).set({ status: "closing", close_reason: reason ?? "leave" }).where(eq(sessions.id, session.id));
      }
      void requestSettlementSoon();
    }
    res.json({ ok: true });
  });

  router.get("/session/:id/receipt", async (req, res) => {
    const session = await db.query.sessions.findFirst({ where: eq(sessions.id, req.params.id) });
    if (!session) return res.status(404).json({ error: "session not found" });
    res.json(await receiptOf(session));
  });

  return router;
}
