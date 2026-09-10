# HederaTube Facilitator

Standalone x402 **facilitator** for the `batch-settlement` scheme on Hedera. Resource servers point their `FACILITATOR_URL` at it; it verifies payment payloads and submits the escrow contract calls (deposit, claim, settle, refund) from its operator account. Built on [`@x402/hedera/batch-settlement`](../x402/typescript/packages/mechanisms/hedera/src/batch-settlement/README.md) and modelled on the reference facilitator in `x402/examples/typescript/facilitator/batch-settlement`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `GET` | `/supported` | Supported kinds (`batch-settlement` on the configured network), `receiverAuthorizer` when delegated authorization is enabled, and the fee-payer account ids |
| `POST` | `/verify` | Verifies `deposit`, `voucher` and `refund` payloads (`{ paymentPayload, paymentRequirements }`) |
| `POST` | `/settle` | Executes `deposit`, `claim`, `settle` and `refund` payloads onchain and returns the Hedera transaction id plus the channel snapshot |

## Roles

| Env var | Role |
| --- | --- |
| `HEDERA_ACCOUNT_ID` / `HEDERA_PRIVATE_KEY` | **Operator**: pays gas, is `msg.sender` of every contract call. Needs HBAR. |
| `HEDERA_RECEIVER_AUTHORIZER_ACCOUNT_ID` / `_PRIVATE_KEY` (optional) | **Receiver authorizer**: signs `ClaimBatch` / `Refund` digests for servers that delegate authorization. Advertised in `/supported`. |

Keys may be DER hex, raw hex or `0x`-prefixed ECDSA hex (ED25519 and ECDSA accounts both work).

> A facilitator that advertises a `receiverAuthorizer` should authenticate cooperative refund requests (the refund bypasses the timed-withdrawal delay). This basic facilitator does not, so only enable delegated authorization for servers you trust.

## Run

```bash
cd facilitator
cp .env-local .env        # fill in the operator (and optional authorizer) credentials
pnpm install              # links @x402/core and @x402/hedera from ../x402/typescript
pnpm dev                  # http://localhost:4022
```

The `@x402/*` packages are consumed from the vendored workspace, so build them once first:

```bash
cd ../x402/typescript && pnpm install && pnpm --filter "@x402/hedera..." build
```

## Contracts

Uses the deployments registered in `@x402/hedera` (`BATCH_SETTLEMENT_DEPLOYMENTS`); on `hedera:testnet` that is escrow [`0.0.10463847`](https://hashscan.io/testnet/contract/0.0.10463847) and collector [`0.0.10463851`](https://hashscan.io/testnet/contract/0.0.10463851). Call `registerBatchSettlementDeployment(...)` before registering the scheme to target another deployment.
