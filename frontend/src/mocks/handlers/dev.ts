import { http, HttpResponse } from "msw";
import { loadDb, resetDb } from "../db";
import { runBatch } from "../x402/channels";

export const devHandlers = [
  /** Demo step 8: the settlement job. Refunds abandoned sessions, then claims every closed session in one tx. */
  http.post("/api/dev/run-batch", () => HttpResponse.json(runBatch(loadDb()))),
  http.post("/api/dev/reset", () => {
    resetDb();
    return HttpResponse.json({ ok: true });
  }),
];
