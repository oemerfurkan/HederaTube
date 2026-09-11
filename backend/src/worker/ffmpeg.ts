import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => (stdout += d));
    child.stderr.on("data", d => (stderr += d));
    child.on("error", reject);
    child.on("close", code => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-2000)}`))));
  });
}

export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`ffprobe returned no duration for ${file}`);
  return seconds;
}

export type HlsOutput = { dir: string; segments: string[]; playlist: string; thumbnail: string; cleanup: () => Promise<void> };

/**
 * Single 720p rendition, 2.5 s segments with keyframes forced on segment boundaries so every
 * segment is exactly 2.5 s regardless of source frame rate (guide §2.4).
 */
export async function transcodeToHls(input: string): Promise<HlsOutput> {
  const dir = await mkdtemp(path.join(tmpdir(), "ht-hls-"));
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", input,
    "-vf", "scale=-2:720",
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p", "-sc_threshold", "0",
    "-force_key_frames", "expr:gte(t,n_forced*2.5)",
    "-c:a", "aac", "-b:a", "96k", "-ac", "2",
    "-f", "hls", "-hls_time", "2.5", "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
    "-hls_segment_filename", path.join(dir, "seg-%04d.ts"), path.join(dir, "index.m3u8"),
  ]);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1", "-i", input, "-frames:v", "1", "-vf", "scale=640:-2,format=yuvj420p", "-q:v", "3", path.join(dir, "thumb.jpg")]).catch(() => undefined);
  const files = (await readdir(dir)).filter(f => /^seg-\d{4}\.ts$/.test(f)).sort();
  return {
    dir,
    segments: files.map(f => path.join(dir, f)),
    playlist: await readFile(path.join(dir, "index.m3u8"), "utf8"),
    thumbnail: path.join(dir, "thumb.jpg"),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
