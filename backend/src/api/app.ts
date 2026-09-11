import compression from "compression";
import express, { type Express } from "express";
import { env } from "../shared/env.js";
import { logger } from "../shared/logger.js";
import { videosRouter } from "./routes/videos.js";
import { sessionRouter } from "./routes/session.js";
import { meRouter } from "./routes/me.js";
import { onboardRouter } from "./routes/onboard.js";
import { verifyRouter } from "./routes/verify.js";
import { uploadProxyRouter, uploadRouter } from "./routes/upload.js";
import { devRouter } from "./routes/dev.js";
import { loadSession } from "./stream/context.js";
import { buildPaymentMiddleware } from "./stream/x402.js";
import { streamRouter } from "./stream/handlers.js";

export async function buildApp(): Promise<Express> {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(compression({ filter: req => !req.path.startsWith("/stream") }) as unknown as express.RequestHandler);

  app.get("/api/health", (_req, res) => res.json({ ok: true, network: env.HEDERA_NETWORK }));

  // Raw upload proxy streams the body; it must sit before the JSON body parser.
  app.use("/api", uploadProxyRouter());

  const api = express.Router();
  api.use(express.json({ limit: "1mb" }));
  api.use(videosRouter());
  api.use(sessionRouter());
  api.use(meRouter());
  api.use(onboardRouter());
  api.use(verifyRouter());
  api.use(uploadRouter());
  if (env.DEV_ENDPOINTS) api.use(devRouter());
  app.use("/api", api);

  // /stream: session context first (AsyncLocalStorage), then x402 at app level so the
  // middleware sees the full path, then the handlers.
  app.use("/stream", loadSession);
  app.use((await buildPaymentMiddleware()) as unknown as express.RequestHandler);
  app.use("/stream", streamRouter());

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err, path: req.path }, "unhandled error");
    if (res.headersSent) return res.end();
    res.status(500).json({ error: err instanceof Error ? err.message : "internal error" });
  });
  return app;
}
