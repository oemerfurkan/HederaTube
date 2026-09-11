# x402-lite

Browser-safe copy of the client half of `@x402/hedera/batch-settlement` (vendored at
`x402/typescript/packages/mechanisms/hedera/src/batch-settlement`). The upstream package imports
`@hiero-ledger/sdk` at module top level (allowance helpers, address conversion, transport), which
is not needed for signing vouchers and deposit authorizations in a browser.

Files copied verbatim: `constants.ts`, `defaultAssets.ts`, `batch-settlement/{constants,encoding,
utils,types,errors,abi}.ts`, `batch-settlement/client/{scheme,config,channel,hederaAllowance,
voucher,hooks,recovery,refund,storage}.ts`.

Replaced with viem-only implementations: `batch-settlement/signer.ts` (interface only) and
`batch-settlement/addresses.ts` (long-zero math + Mirror Node fetch).

Keep in sync with upstream when the vendored package changes.
