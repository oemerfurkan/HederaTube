import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../shared/db/client.js";
import { likes, videos } from "../../shared/db/schema.js";
import { listVideos, sessionList, toVideo } from "../../shared/db/queries.js";
import { normalizeAddress } from "../../shared/ids.js";
import { objectKeys, storage } from "../../shared/storage.js";

export function videosRouter(): Router {
  const router = Router();

  router.get("/videos", async (req, res) => {
    res.json(await listVideos(typeof req.query.filter === "string" ? req.query.filter : "all"));
  });

  router.get("/videos/:id", async (req, res) => {
    const video = await db.query.videos.findFirst({ where: eq(videos.id, req.params.id) });
    if (!video) return res.status(404).json({ error: "video not found" });
    res.json(await toVideo(video));
  });

  router.get("/videos/:id/thumbnail", async (req, res) => {
    const video = await db.query.videos.findFirst({ where: eq(videos.id, req.params.id) });
    if (!video?.thumbnail_key) return res.status(404).end();
    try {
      const obj = await storage.getObject(video.thumbnail_key ?? objectKeys.thumbnail(video.id));
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=3600");
      obj.body.pipe(res);
    } catch {
      res.status(404).end();
    }
  });

  router.get("/video/:id/sessions", async (req, res) => {
    const video = await db.query.videos.findFirst({ where: eq(videos.id, req.params.id) });
    if (!video) return res.status(404).json({ error: "video not found" });
    const tab = req.query.tab === "top" ? "top" : "recent";
    res.json(await sessionList(video, tab));
  });

  /** Read side of the like: the card has to come back red for a viewer who already liked it. */
  router.get("/video/:id/like", async (req, res) => {
    const viewer = typeof req.query.viewer === "string" ? normalizeAddress(req.query.viewer) : "";
    const video = await db.query.videos.findFirst({ where: eq(videos.id, req.params.id) });
    if (!video) return res.status(404).json({ error: "video not found" });
    const existing = viewer ? await db.query.likes.findFirst({ where: and(eq(likes.video_id, video.id), eq(likes.viewer_address, viewer)) }) : undefined;
    const out = await toVideo(video);
    res.json({ likes: out.likes, liked: !!existing });
  });

  router.post("/video/:id/like", async (req, res) => {
    const viewer = typeof req.body?.viewer === "string" ? normalizeAddress(req.body.viewer) : "";
    if (!viewer) return res.status(400).json({ error: "viewer required" });
    const video = await db.query.videos.findFirst({ where: eq(videos.id, req.params.id) });
    if (!video) return res.status(404).json({ error: "video not found" });
    const existing = await db.query.likes.findFirst({ where: and(eq(likes.video_id, video.id), eq(likes.viewer_address, viewer)) });
    if (existing) await db.delete(likes).where(and(eq(likes.video_id, video.id), eq(likes.viewer_address, viewer)));
    else await db.insert(likes).values({ video_id: video.id, viewer_address: viewer });
    const out = await toVideo(video);
    res.json({ likes: out.likes, liked: !existing });
  });

  return router;
}
