import { Router, type Request, type Response } from "express";
import { setSettlementOverrides as setOverrides } from "@x402/express";

// @x402/express is typed against its own copy of the Express types; the runtime object is the same.
const setSettlementOverrides = (res: Response, overrides: { amount?: string }) => setOverrides(res as never, overrides);
import { eq, sql as raw } from "drizzle-orm";
import { db } from "../../shared/db/client.js";
import { sessions } from "../../shared/db/schema.js";
import { buildPlaylist, chunkCharge, classifySegment } from "../../shared/accounting.js";
import { objectKeys, storage } from "../../shared/storage.js";
import { getX402Runtime } from "../../shared/x402/scheme.js";
import { logger } from "../../shared/logger.js";
import { currentStream } from "./context.js";

function ctxOr404(res: Response) {
  const ctx = currentStream();
  if (!ctx) res.status(404).type("text/plain").send("session not found");
  return ctx;
}

function parseRange(header: string | undefined): { start: number; end?: number } | undefined {
  const m = header && /^bytes=(\d+)-(\d*)$/.exec(header);
  if (!m) return undefined;
  return { start: Number(m[1]), ...(m[2] ? { end: Number(m[2]) } : {}) };
}

/** Free path: pipe the segment (Range aware) and clean up when the client goes away. */
async function streamSegment(req: Request, res: Response, key: string): Promise<void> {
  const obj = await storage.getObject(key, parseRange(req.headers.range));
  res.status(obj.status);
  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Accept-Ranges", "bytes");
  if (obj.contentLength !== undefined) res.setHeader("Content-Length", String(obj.contentLength));
  if (obj.contentRange) res.setHeader("Content-Range", obj.contentRange);
  res.on("close", () => obj.body.destroy());
  obj.body.on("error", err => {
    logger.error({ err, key }, "segment stream error");
    if (!res.headersSent) res.status(500);
    res.end();
  });
  obj.body.pipe(res);
}

export function streamRouter(): Router {
  const router = Router();

  router.get("/:videoId/playlist.m3u8", async (_req, res) => {
    const ctx = ctxOr404(res);
    if (!ctx) return;
    res.type("application/vnd.apple.mpegurl").send(buildPlaylist(ctx.video.id, ctx.session.id, ctx.video.segment_durations));
  });

  // Reached only after the x402 middleware verified a deposit payload. Charges nothing.
  router.get("/:videoId/lock", (_req, res) => {
    const ctx = ctxOr404(res);
    if (!ctx) return;
    setSettlementOverrides(res, { amount: "0" });
    res.json({ ok: true, sessionId: ctx.session.id });
  });

  router.get("/:videoId/seg-:index(\\d+).ts", async (req, res) => {
    const ctx = ctxOr404(res);
    if (!ctx || ctx.segmentIndex === undefined) return;
    const { session, video } = ctx;
    if (!session.lock_tx) {
      res.status(402).type("text/plain").send("lock first");
      return;
    }
    const cls = classifySegment(session, ctx.segmentIndex);
    const key = objectKeys.segment(video.id, ctx.segmentIndex);
    switch (cls.kind) {
      case "second-unpaid":
        res.status(402).type("text/plain").send("chunk not paid");
        return;
      case "preview":
        await db
          .update(sessions)
          .set({ chunks_served: raw`greatest(${sessions.chunks_served}, ${cls.chunk + 1})`, last_activity_at: new Date() })
          .where(eq(sessions.id, session.id));
        return streamSegment(req, res, key);
      case "already-paid":
      case "second-paid":
        return streamSegment(req, res, key);
      case "paid": {
        // Verified voucher; settlement runs after this handler with the override below.
        const { scheme } = await getX402Runtime();
        const channel = session.channel_id ? await scheme.getStorage().get(session.channel_id) : undefined;
        const charged = BigInt(channel?.chargedCumulativeAmount ?? session.consumed_amount);
        const delta = chunkCharge(session, cls.k, charged);
        setSettlementOverrides(res, { amount: delta.toString() });
        const buf = await storage.getBuffer(key);
        res.status(200);
        res.setHeader("Content-Type", "video/mp2t");
        res.setHeader("Content-Length", String(buf.byteLength));
        res.end(buf);
        return;
      }
    }
  });

  // Refund payloads are settled by the scheme (skipHandler); anything else that reaches here is unpaid.
  router.get("/:videoId/close", (_req, res) => {
    res.status(402).type("text/plain").send("lock first");
  });

  return router;
}
