import { buildApp } from "./app.js";
import { env } from "../shared/env.js";
import { logger } from "../shared/logger.js";
import { closeDb, runMigrations } from "../shared/db/client.js";
import { closeQueues } from "../shared/queues.js";
import { storage } from "../shared/storage.js";

async function main() {
  await runMigrations();
  if (env.STORAGE_DRIVER === "s3" && env.UPLOAD_MODE === "presign") {
    await storage.ensureCors?.().catch(err => logger.warn({ err }, "could not set bucket CORS"));
  }
  const app = await buildApp();
  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT, storage: env.STORAGE_DRIVER }, "api listening"));
  // Longer than Traefik's idle timeout so the proxy never sees a half-closed keep-alive socket.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(async () => {
      await Promise.allSettled([closeQueues(), closeDb()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch(err => {
  logger.error({ err }, "api failed to start");
  process.exit(1);
});
