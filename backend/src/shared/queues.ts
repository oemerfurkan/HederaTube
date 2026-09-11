import { Queue, QueueEvents } from "bullmq";
import { createBullConnection } from "./redis.js";

export const QUEUE_TRANSCODE = "transcode";
export const QUEUE_SETTLEMENT = "settlement";

export type TranscodeJob = { videoId: string; sourceKey: string };
export type SettlementJob = { trigger: "cron" | "manual" };
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
