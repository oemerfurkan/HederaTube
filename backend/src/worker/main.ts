import { Worker } from "bullmq";
import { env } from "../shared/env.js";
import { logger } from "../shared/logger.js";
import { closeDb, runMigrations } from "../shared/db/client.js";
import { createBullConnection } from "../shared/redis.js";
import { QUEUE_SETTLEMENT, QUEUE_TRANSCODE, closeQueues, getSettlementQueue, type SettlementJob, type TranscodeJob } from "../shared/queues.js";
import { transcodeVideo } from "./transcode.js";
import { runSettlement } from "./settlement.js";

async function main() {
  await runMigrations();

  const transcodeWorker = new Worker<TranscodeJob>(QUEUE_TRANSCODE, job => transcodeVideo(job.data), {
    connection: createBullConnection(),
    concurrency: 1,
    lockDuration: 10 * 60_000,
  });
  const settlementWorker = new Worker<SettlementJob>(QUEUE_SETTLEMENT, job => runSettlement().then(r => ({ ...r, trigger: job.data.trigger })), {
    connection: createBullConnection(),
    concurrency: 1,
    lockDuration: 5 * 60_000,
  });
  for (const w of [transcodeWorker, settlementWorker]) {
    w.on("failed", (job, err) => logger.error({ queue: w.name, jobId: job?.id, err }, "job failed"));
    w.on("completed", job => logger.info({ queue: w.name, jobId: job.id, result: job.returnvalue }, "job completed"));
  }

  // Repeatable settlement job (the "batch settlement" cron, guide §10).
  await getSettlementQueue().add(
    "settlement",
    { trigger: "cron" },
    { repeat: { every: env.SETTLEMENT_INTERVAL_SECONDS * 1000 }, jobId: "settlement-cron", attempts: 1, removeOnComplete: 20, removeOnFail: 20 },
  );
  logger.info({ settlementIntervalSecs: env.SETTLEMENT_INTERVAL_SECONDS }, "worker running");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    await Promise.allSettled([transcodeWorker.close(), settlementWorker.close(), closeQueues(), closeDb()]);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch(err => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
