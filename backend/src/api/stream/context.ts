import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../shared/db/client.js";
import { creators, sessions, videos, type CreatorRow, type SessionRow, type VideoRow } from "../../shared/db/schema.js";

export type StreamRoute = "playlist" | "lock" | "close" | "segment";

export type StreamContext = {
  route: StreamRoute;
  session: SessionRow;
  video: VideoRow;
  creator: CreatorRow;
  segmentIndex?: number;
};

export const streamContext = new AsyncLocalStorage<StreamContext>();

export function currentStream(): StreamContext | undefined {
  return streamContext.getStore();
}

const PATH = /^\/([^/]+)\/(playlist\.m3u8|lock|close|seg-(\d{4})\.ts)$/;

/**
 * Loads session + video + creator for every /stream request from `?s=` and runs the rest of the
 * chain inside an AsyncLocalStorage context, so the x402 hooks and DynamicPrice/PayTo can read it.
 */
export async function loadSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED,PAYMENT-RESPONSE");
  const match = PATH.exec(req.path);
  if (!match) {
    res.status(404).type("text/plain").send("not found");
    return;
  }
  const [, videoId, kind, seg] = match;
  const sessionId = typeof req.query.s === "string" ? req.query.s : undefined;
  if (!sessionId) {
    res.status(404).type("text/plain").send("session not found");
    return;
  }
  const [row] = await db
    .select({ session: sessions, video: videos, creator: creators })
    .from(sessions)
    .innerJoin(videos, eq(sessions.video_id, videos.id))
    .innerJoin(creators, eq(videos.creator_id, creators.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row || row.session.video_id !== videoId) {
    res.status(404).type("text/plain").send("session not found");
    return;
  }
  const route: StreamRoute = kind === "playlist.m3u8" ? "playlist" : kind === "lock" ? "lock" : kind === "close" ? "close" : "segment";
  if ((route === "playlist" || route === "segment") && !["locked", "streaming"].includes(row.session.status)) {
    res.status(409).type("text/plain").send(route === "segment" ? "session is closed" : "session is not open");
    return;
  }
  const ctx: StreamContext = { route, ...row, ...(seg !== undefined ? { segmentIndex: Number(seg) } : {}) };
  streamContext.run(ctx, () => next());
}
