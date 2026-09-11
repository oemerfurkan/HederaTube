# HederaTube frontend

Vite + React + TypeScript. Pay-per-second video on Hedera with USDC through the x402
`batch-settlement` scheme. This package is the browser app only; the API it talks to is mocked
in the browser with MSW until the real resource server exists.

## Run

```bash
# once: build the vendored x402 packages this app links to
cd ../x402/typescript && pnpm install && pnpm --filter "@x402/hedera..." build && pnpm --filter @x402/fetch build

cd ../../frontend
pnpm install
pnpm demo:assets      # ffmpeg → public/demo/* (2.5 s HLS segments, forced keyframes)
cp .env.example .env  # set VITE_PRIVY_APP_ID for the Privy wallet; empty = local dev key
pnpm dev              # http://localhost:5173, MSW mock API on
pnpm test             # vitest: price math, storage, mutex, loader, engine end to end
pnpm typecheck && pnpm build
```

Without `VITE_PRIVY_APP_ID` the wallet sheet creates a local secp256k1 key in IndexedDB and
signs with it (same `ClientHederaBatchSigner` interface as the Privy signer). With it, Privy's
embedded wallet signs raw digests via `secp256k1_sign` with wallet UIs disabled.

## Demo script (guide §15, mock mode)

1. Home: price badges on the cards.
2. Connect wallet → Continue with Google (local key in dev). Onboarding runs the mock faucet.
3. Open a video. `Lock 0.0012 USDC and watch` → one deposit payload, ~2 s "Locking on Hedera…".
4. Chunk ticks turn Chain as each 5 s chunk is paid (one cumulative voucher per chunk).
5. Open the same video in a second tab: a live `Streaming` row appears in the session list.
6. Leave the page (Home). The receipt card shows `Settling on Hedera` with the refund tx.
7. Sidebar → `Run settlement batch`. The receipt flips to `Settled` with the batch tx hash.

`Reset mock data` in the sidebar wipes the mock database (localStorage).

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
- `src/mocks/` — MSW handlers; `mocks/x402/channels.ts` is the server-side channel accounting to lift into the real server.

## Switching to a real backend

Set `VITE_API_MODE=real` and `VITE_API_TARGET`; Vite proxies `/api` and `/stream` same-origin.
The server must reproduce `mocks/x402/channels.ts` semantics: lock route with
`extra.minDeposit = price` and zero charge, per-chunk `setSettlementOverrides(res, { amount })`,
a `close` route that returns 402 unpaid, and a receipt endpoint that exposes the claim batch tx.
Set `VITE_ONBOARD_MODE=real` to run the real faucet check and the ERC-20 facade `approve` for the
USDC allowance; `VITE_MIRROR_CONTRACT_CALL_URL` should then point at the Mirror Node.

## Not in this build

Squid deposit (needs `VITE_SQUID_INTEGRATOR_ID`; the panel shows the destination account
instead), World ID (needs `VITE_WORLD_APP_ID` and a server-signed RP context; a dev button
simulates the proof), Withdraw (button only), live streams.
