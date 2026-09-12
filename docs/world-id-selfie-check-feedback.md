# World ID Selfie Check: integration feedback

Written while wiring Selfie Check into HederaTube (creator verification, one channel per human). Everything below is what we actually hit, in the order we hit it; nothing is hypothetical. Versions: `@worldcoin/idkit` 4.2.3, `@worldcoin/idkit-core` 4.2.4, `@worldcoin/idkit-server` 1.1.1, Vite 7, React 19, sandbox World App via TestFlight.

## Where Selfie Check fits for us

We use it as an **abuse-prevention and eligibility signal**, not as identity. Creators on HederaTube are paid per second watched by anyone, so the creator side invites farming: throwaway channels, self-viewing loops, one operator behind many "creators". Orb-level assurance would be the wrong bar for that (most people cannot reach an Orb, and we do not need to know the person is unique in the world, only that one human is not running ten channels). A low-friction liveness-checked face credential is exactly the right bar: anyone with World App can pass it in a minute, it is scoped to our action, and the RP-scoped nullifier gives us one-channel-per-human without learning anything about the person. Viewers never verify. The 90-day validity also maps onto a natural **continuity** check for creators, which we would use to re-prompt long-inactive channels.

## Selfie Check docs and integration flow

- The credential page (`/world-id/credentials/11`) explains what Selfie Check is but contains no request or verification code, and does not say how to ask for that credential from IDKit. We found the two ways to request it, `CredentialRequest("selfie")` for a 4.0 proof and `selfieCheckLegacy()` for a 3.0 proof, by reading the package's `.d.ts`, not the docs.
- The React reference lists `orbLegacy` and `selfieCheckLegacy` but not the `constraints` form with `CredentialRequest`, and the integration page's sample uses `orbLegacy`. A "request Selfie Check, both protocol versions" snippet on the credential page would have saved the most time.
- The 4.0 request (`CredentialRequest("selfie")`, `allow_legacy_proofs: false`) did not complete in the sandbox World App for us; the 3.0 preset (`selfieCheckLegacy`, `allow_legacy_proofs: true`) did produce a scannable request. Which protocol version the sandbox app answers for Selfie Check is not stated anywhere we could find.
- The `environment` option (`"production" | "staging" | "sandbox"`) is the switch that makes the QR open the sandbox app, and it is not mentioned on the integration, React or sandbox pages. We found the three connect base URLs (`world.org/verify`, `staging.world.org/verify`, `sandbox.world.org/verify`) by reading strings out of the IDKit WebAssembly binary. Until then every QR opened the production app even with the sandbox app installed.
- The verify reference documents `environment` as `production` or `staging` in the request body. Where a proof produced by the sandbox app should be verified, and whether the production endpoint accepts it, is not documented.
- The RP signature page shows `signRequest({ signingKeyHex, action, ttl })` but not how the result maps onto `rp_context` (`sig → signature`, `createdAt → created_at`, `expiresAt → expires_at`). We inferred it from the types. It worked.
- `signRequest` is reachable from three packages (`@worldcoin/idkit-server`, `@worldcoin/idkit-core/signing`, re-exported from `@worldcoin/idkit`). The docs point at the server package; the React package re-exporting a server-only signing function is confusing when you are trying to keep the key off the client.
- Signal format is under-specified: whether it should be a raw string, hashed, or ABI-encoded, and whether 3.0 and 4.0 treat it the same. We pass the wallet address as a plain string and it is accepted, but we would not have known if it were not.

## Developer Portal

- The pieces a relying party needs live in different places: app id, action, RP id, signing key. A single "connect your backend" panel listing all four, with the exact env names, would remove a round of hunting.
- The signing key was pasted once as a 20-byte value (address-shaped) instead of the 32-byte key. `signRequest` rejected it with a precise message ("expected 32 bytes (64 hex chars), got 20 bytes"), which is good, but nothing in the portal marks which of the displayed hex strings is the signing key and which is an identifier.
- Debugging guidance is thin: when a proof is rejected the portal does not show recent verification attempts or the reason, so the only signal is the JSON from the verify endpoint.

## Sandbox App

- The sandbox app is not on the stores (TestFlight on iOS). That is fine, but the sandbox page should say up front that a production QR will still open the production app, and that `environment: "sandbox"` is required in IDKit.
- Test users: the sandbox page does not list which credentials sandbox users hold, so it is unclear whether a fresh sandbox user has a Selfie Check, or has to enrol one on first request, or cannot get one because the credential is access-gated per app.
- Access gating: the credential page says Selfie Check is gated and access is requested by email. Whether that gate applies to sandbox as well as production is not stated.
- Edge cases we could not exercise: an expired credential (90 days), a user rejecting the request in the app, the same person on two devices. None can be triggered on demand in sandbox as far as we can tell.

## What was confusing, missing, broken, or hard to test

- **IDKit under Vite dev breaks silently.** `idkit-core` loads its WebAssembly with `new URL("idkit_wasm_bg.wasm", import.meta.url)`. Vite's dependency pre-bundling moves the module into `.vite/deps`, where that file does not exist, and the dev server's SPA fallback answers the fetch with `index.html`. The widget shows "Something went wrong", `onError` is not called, nothing reaches the console, and no network request to the bridge is ever made. We only found it by calling `IDKit.request()` by hand and reading `Failed to initialize IDKit WASM: expected magic word 00 61 73 6d, found 3c 21 64 6f`. Fix on our side: a dev-only Vite middleware that serves the `.wasm` for that path (`frontend/vite.config.ts`). Suggestions: surface the init error through `onError` and the debug report, mention Vite in the docs, or embed the wasm.
- **The widget's error state hides the reason.** "Something went wrong, try again" is shown for a missing wasm, a bad RP signature and an unreachable bridge alike. `setDebug(true)` exists, but the report is not shown anywhere a developer would look.
- **No offline or CI path.** Every check of the flow needs a phone with the sandbox build. A documented test proof, or a sandbox verify endpoint that accepts a fixture, would let us keep the flow in tests. We built our own simulate mode for that reason.
- **Docs pages are thin where it matters.** The verification-flows page is about deep-link states, the credential page has no code, and the React page does not cover credential selection. The typings are better documentation than the site.

## Working app

- Flow: `frontend/src/features/verify/VerifyButton.tsx` (gate, IDKit widget), `backend/src/api/routes/verify.ts` (RP signing, verification, nullifier storage). The README's "World ID: one human, one creator channel" section walks through it.
- Enforcement: the upload API refuses wallets without a nullifier, the UI shows Verify instead of Create, one nullifier per creator row.
