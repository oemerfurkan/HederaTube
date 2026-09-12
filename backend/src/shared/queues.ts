import { Queue, QueueEvents } from "bullmq";
import { createBullConnection } from "./redis.js";

export const QUEUE_TRANSCODE = "transcode";
export const QUEUE_SETTLEMENT = "settlement";

export type TranscodeJob = { videoId: string; sourceKey: string };
export type SettlementJob = { trigger: "cron" | "manual" | "close" };
export type SettlementResult = { settled: number; txHash: string | null; refunded: number; claims: string[] };

let transcodeQueue: Queue<TranscodeJob> | undefined;
let settlementQueue: Queue<SettlementJob> | undefined;
let settlementEvents: QueueEvents | undefined;

export function getTranscodeQueue(): Queue<TranscodeJob> {
  transcodeQueue ??= new Queue<TranscodeJob>(QUEUE_TRANSCODE, { connection: createBullConnection() });
  return transcodeQueue;
}

export function getSettlementQueue(): Queue<SettlementJob> {
  settlementQueue ??= new Queue<SettlementJob>(QUEUE_SETTLEMENT, { connection: createBullConnection() });
  return settlementQueue;
}

export function getSettlementEvents(): QueueEvents {
  settlementEvents ??= new QueueEvents(QUEUE_SETTLEMENT, { connection: createBullConnection() });
  return settlementEvents;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([transcodeQueue?.close(), settlementQueue?.close(), settlementEvents?.close()]);
}

/**
 * Runs the settlement batch a few seconds after a session closes instead of waiting for the next
 * interval, so a receipt flips to "settled" while the viewer is still looking at it. Closes that
 * land inside the window share one job: the id is fixed while it is delayed.
 */
export async function requestSettlementSoon(): Promise<void> {
  try {
    await getSettlementQueue().add(
      "settlement",
      { trigger: "close" },
      { jobId: "after-close", delay: 4_000, attempts: 1, removeOnComplete: true, removeOnFail: true },
    );
  } catch {
    /* the periodic job still runs; a missed nudge only costs latency */
  }
}
