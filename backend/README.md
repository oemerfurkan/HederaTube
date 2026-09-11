# HederaTube backend

Resource server (Express 4 + `@x402/express`) and worker (BullMQ) for pay-per-chunk video on
Hedera with USDC through the x402 `batch-settlement` scheme. Implements the HTTP contract the
frontend's mock defines (`frontend/src/mocks/**`), on Postgres + Redis + Garage (S3).

## Run locally

```bash
# once: build the vendored x402 packages this package links to
cd ../x402/typescript && pnpm install \
  && pnpm --filter "@x402/hedera..." build && pnpm --filter @x402/express build && pnpm --filter @x402/fetch build

cd ../../backend
pnpm install
cp .env-local .env            # fill in operator (faucet) + receiver-authorizer keys, DATABASE_URL, REDIS_URL
pnpm db:migrate               # applies drizzle/*.sql
pnpm seed                     # demo creator + 4 demo videos (segments from ../frontend/public/demo) + settled sessions
pnpm dev:api                  # http://localhost:4021
pnpm dev:worker               # transcode + settlement job (every SETTLEMENT_INTERVAL_SECONDS)
```

Prerequisites: Postgres and Redis reachable (`brew services start postgresql@14 redis`, or
`docker compose -f ../docker-compose.dev.yml up`), the facilitator on `FACILITATOR_URL`
(`cd ../facilitator && pnpm dev`) **without** `HEDERA_RECEIVER_AUTHORIZER_*` in its env, ffmpeg on
PATH for the worker. `STORAGE_DRIVER=fs` keeps objects under `./storage`; `s3` targets Garage.

Then point the frontend at it: `VITE_API_MODE=real`, `VITE_ONBOARD_MODE=real`,
`VITE_MIRROR_CONTRACT_CALL_URL=https://testnet.mirrornode.hedera.com`, `VITE_DEV_CONTROLS=true`.

## Verify against testnet

```bash
pnpm e2e:testnet   # ECDSA test client from ../x402/.../.env.testnet-accounts
```

Locks (deposit tx), pays three chunks, streams the free second segments, probes `close`, refunds
(refund tx), runs the settlement batch (settle tx) and checks the receipt. Prints HashScan links.
`pnpm test` runs the unit tests (price math, segment classification, playlist).

## How money moves

| Step | Route | What happens |
|---|---|---|
| Lock | `GET /stream/:id/lock?s=` | x402 deposit payload → facilitator `deposit` (USDC pulled via the HTS allowance into the escrow). Charge `0`. `sessions.lock_tx`, `channel_id`. |
| Chunk | `GET /stream/:id/seg-NNNN.ts?s=` | First segment of each priced 5 s chunk carries a cumulative voucher. Verified locally (payer key from the Mirror Node). Charge = `floor(price·k/priced) − charged` via `setSettlementOverrides`. Free-preview, second and already-paid segments stream without payment (`onProtectedRequest` grant). |
| Close | `GET /stream/:id/close?s=` | Refund payload → facilitator `refundWithSignature` (signed by our receiver authorizer). Unpaid GET returns 402 so the client can read the channel config. |
| Batch | worker `settlement` job / `POST /api/dev/run-batch` | Sweeps abandoned sessions (refund), claims outstanding vouchers per creator, `settle(receiver, token)` moves USDC escrow → creator in one tx, links sessions to the settlement row. |

The receiver-authorizer key (`HEDERA_RECEIVER_AUTHORIZER_*`) lives here so only this server can
authorize claims and refunds; the facilitator must not advertise one.

## Layout

- `src/api` — Express app: `/api/*` routes, `/stream` session context (AsyncLocalStorage), x402 wiring (`stream/x402.ts`), handlers.
- `src/worker` — BullMQ workers: `transcode` (ffmpeg → 2.5 s HLS, 720p) and `settlement`.
- `src/shared` — env, db (Drizzle schema + read models), price/accounting (mirrors `frontend/src/lib/price.ts` and the mock's channel logic), storage (S3/fs), Redis adapters, Hedera helpers, x402 scheme/channel managers.
- `scripts` — `migrate`, `seed`, `e2e-testnet`, `garage-bootstrap.sh`.
- `../docker-compose.yml` — production compose (Garage, Postgres, Redis, facilitator, api, worker, web) with Traefik labels for Dokploy; `../docker-compose.dev.yml` — infra only.

## Notes

- World ID: `WORLD_VERIFY_MODE=simulate` accepts `proof.nullifier_hash` and enforces the unique index; `real` is a stub.
- Faucet drips HBAR only (`FAUCET_HBAR`), once per address; USDC is not dripped.
- `UPLOAD_MODE=proxy` streams browser uploads through `PUT /api/upload/put/:videoId/:name`; `presign` returns a presigned Garage URL and sets bucket CORS at startup.
- Uploaded videos are transcoded by the worker; `ffprobe` duration overrides the client-reported one.
