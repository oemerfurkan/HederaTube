import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../shared/db/client.js";
import { videos } from "../shared/db/schema.js";
import { objectKeys, storage } from "../shared/storage.js";
import { chunkCount } from "../shared/price.js";
import { parseExtinf } from "../shared/accounting.js";
import { logger } from "../shared/logger.js";
import type { TranscodeJob } from "../shared/queues.js";
import { probeDuration, transcodeToHls } from "./ffmpeg.js";

export async function transcodeVideo(job: TranscodeJob): Promise<void> {
  const log = logger.child({ videoId: job.videoId });
  const work = await mkdtemp(path.join(tmpdir(), "ht-src-"));
  const input = path.join(work, "source" + path.extname(job.sourceKey));
  try {
    // each stage logs, so a long transcode is distinguishable from a job that never started
    log.info({ sourceKey: job.sourceKey }, "transcode started");
    const source = await storage.getBuffer(job.sourceKey);
    await writeFile(input, source);
    log.info({ bytes: source.byteLength }, "source downloaded");
    const duration = await probeDuration(input);
    const started = Date.now();
    const hls = await transcodeToHls(input);
    log.info({ duration, segments: hls.segments.length, ms: Date.now() - started }, "ffmpeg finished, uploading");
    try {
      const durations = parseExtinf(hls.playlist);
      if (durations.length !== hls.segments.length) throw new Error(`playlist lists ${durations.length} segments, found ${hls.segments.length} files`);
      for (const [i, file] of hls.segments.entries()) {
        await storage.putStream(objectKeys.segment(job.videoId, i), createReadStream(file), "video/mp2t");
      }
      let thumbnailKey: string | null = null;
      if (await stat(hls.thumbnail).catch(() => undefined)) {
        await storage.putStream(objectKeys.thumbnail(job.videoId), createReadStream(hls.thumbnail), "image/jpeg");
        thumbnailKey = objectKeys.thumbnail(job.videoId);
      }
      await db
        .update(videos)
        .set({
          status: "ready",
          duration_seconds: duration,
          segment_count: durations.length,
          chunk_count: chunkCount(duration),
          segment_durations: durations,
          thumbnail_key: thumbnailKey,
          error: null,
        })
        .where(eq(videos.id, job.videoId));
      log.info({ segments: durations.length, duration }, "transcode done");
    } finally {
      await hls.cleanup();
    }
  } catch (err) {
    log.error({ err }, "transcode failed");
    await db.update(videos).set({ status: "failed", error: err instanceof Error ? err.message : String(err) }).where(eq(videos.id, job.videoId));
    throw err;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
