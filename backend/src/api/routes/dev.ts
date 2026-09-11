import { Router } from "express";
import { getSettlementEvents, getSettlementQueue, type SettlementResult } from "../../shared/queues.js";

/** Demo controls (DEV_ENDPOINTS=true): run the settlement job now. */
export function devRouter(): Router {
  const router = Router();
  router.post("/dev/run-batch", async (_req, res) => {
    const queue = getSettlementQueue();
    const events = getSettlementEvents();
    await events.waitUntilReady();
    const job = await queue.add("settlement", { trigger: "manual" }, { jobId: `manual-${Date.now()}`, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
    try {
      const result = (await job.waitUntilFinished(events, 180_000)) as SettlementResult;
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "settlement failed" });
    }
  });
  return router;
}
