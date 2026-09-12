// Production server for the built web app: static files from dist with the SPA fallback, long-lived
// caching for hashed assets, and the right MIME type for IDKit's WebAssembly. API and stream traffic
// never reaches this process; the platform routes /api and /stream to the backend on the same host.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const port = Number(process.env.PORT || 3000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

async function fileFor(urlPath) {
  const safe = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(dist, safe);
  if (!candidate.startsWith(dist)) return undefined;
  try {
    const info = await stat(candidate);
    if (info.isFile()) return { path: candidate, size: info.size };
  } catch {
    /* not a file: fall through to the app shell */
  }
  return undefined;
}

createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }
    let file = await fileFor(req.url ?? "/");
    const isAsset = !!file && file.path.includes(`${join(dist, "assets")}`);
    // unknown paths that look like routes get index.html; unknown files get a 404
    if (!file && !extname((req.url ?? "/").split("?")[0])) file = await fileFor("/index.html");
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": types[extname(file.path)] ?? "application/octet-stream",
      "content-length": file.size,
      "cache-control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(file.path).pipe(res);
  } catch {
    res.writeHead(500).end();
  }
}).listen(port, () => console.log(`web listening on ${port}`));
