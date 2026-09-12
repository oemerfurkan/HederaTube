# HederaTube frontend

Vite + React + TypeScript. Pay-per-second video on Hedera with USDC through the x402
`batch-settlement` scheme. This package is the browser app; it talks to `../backend` in real
mode (the default) and can run against an MSW mock of the same API with `VITE_API_MODE=mock`.

## Run

```bash
# once: build the vendored x402 packages this app links to
cd ../x402/typescript && pnpm install && pnpm --filter "@x402/hedera..." build && pnpm --filter @x402/fetch build

cd ../../frontend
pnpm install
pnpm demo:assets      # ffmpeg → public/demo/* (2.5 s HLS segments, forced keyframes)
cp .env.example .env  # VITE_PRIVY_APP_ID (Privy wallet; empty = local dev key), VITE_WORLD_APP_ID (World ID)
pnpm dev              # http://localhost:5173, proxies /api and /stream to the backend
pnpm test             # vitest: price math, storage, mutex, loader, engine end to end
pnpm typecheck && pnpm build
```

Without `VITE_PRIVY_APP_ID` the connect flow creates a local secp256k1 key in IndexedDB and
signs with it (same `ClientHederaBatchSigner` interface as the Privy signer). With it, Privy's
embedded wallet signs raw digests via `secp256k1_sign` with wallet UIs disabled.

## Demo script

1. Home: price badges on the cards; the wallet popover behind the avatar lists the Hedera, EVM and Solana deposit addresses.
2. Connect wallet → Continue with Google (Privy) or the local dev key. Onboarding drips HBAR, associates USDC and grants the allowance.
3. Open a video and press play. One deposit payload; the play circle spins for ~4 s while the lock reaches consensus.
4. Each 5 s chunk is paid with one cumulative voucher; the overlay shows how much of the lock is used.
5. Open the same video in a second tab: a live `Streaming` row appears in the session list.
6. Leave the page (Home). The receipt card shows `Settling on Hedera` with a Receipt link to the refund tx.
7. A few seconds later the batch runs and the card flips to `Settled` with the batch tx.
8. Creators: **Verify** in the header opens the World ID QR (Selfie Check via World App); after it, **Create** appears and `/upload` is open. My channel → Profile sets the channel name and description.

## How the guide maps onto x402 batch-settlement

| Guide | Implementation |
|---|---|
| Lock the full price | One payment channel per viewing session (`salt = keccak(sessionId)`), deposit = video price via `GET /stream/:id/lock` |
| Consume per chunk | First segment of every 5 s chunk goes through `wrapFetchWithPayment`; cumulative EIP-712 voucher; server charges `floor(price·k/priced) − charged` |
| Credit window | hls.js `maxBufferLength: 10`; paid requests serialised per channel (`PaymentMutex`) |
| Refund | Cooperative refund on close (`scheme.refund(closeUrl)`), immediate tx id |
| Batch settlement | Server-side claim batch; receipt phase 2 from `/api/session/:id/receipt` |

Key files:

- `src/payments/x402-lite/` — browser-safe copy of the vendored `@x402/hedera` client (see its README).
- `src/payments/privySigner.ts`, `localSigner.ts` — `ClientHederaBatchSigner` implementations.
- `src/payments/x402Client.ts` — per-session scheme + `x402Client` + `wrapFetchWithPayment`.
- `src/payments/hlsPaidLoader.ts` — hls.js fragment loader that pays for chunk-leading segments.
- `src/payments/sessionMachine.ts` — idle → locking → preview/streaming → interrupted → closing → closed.
- `src/payments/locks.ts` — active locks reconciled against session receipts; release outside the player.
- `src/features/verify/VerifyButton.tsx` — World ID Selfie Check through IDKit (server-signed RP context, QR for World App).
- `src/mocks/` — MSW handlers; `mocks/x402/channels.ts` is the server-side channel accounting to lift into the real server.

## Modes

Real mode (default): `VITE_API_MODE=real` and `VITE_API_TARGET`; Vite proxies `/api` and `/stream`
same-origin, `VITE_ONBOARD_MODE=real` runs the faucet, association and allowance steps, and
`VITE_MIRROR_CONTRACT_CALL_URL` points at the Mirror Node. Mock mode: `VITE_API_MODE=mock` and
`VITE_ONBOARD_MODE=mock`; `src/mocks/` serves the same API, and `mocks/x402/channels.ts` is the
channel accounting the backend reproduces.

World ID: `VITE_WORLD_APP_ID` and `VITE_WORLD_ACTION` from the Developer Portal;
`VITE_WORLD_ENVIRONMENT` (`production` | `staging` | `sandbox`) picks which World App the QR opens.
The backend signs the request context and verifies the proof. Without an app id the check is simulated.

## Not in this build

Squid deposit widget (deposits are by address), withdraw from the UI (the escrow's escape hatch
still works), live streams.
