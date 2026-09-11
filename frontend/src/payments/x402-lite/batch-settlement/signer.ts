import type { HederaKeyType } from "./types";

/** Arguments for a read-only contract call simulated through the Mirror Node. */
export type HederaContractReadArgs = {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  /** Simulated `msg.sender`; defaults to the reader's configured sender. */
  from?: `0x${string}`;
};

/**
 * Client-side signer for the batch-settlement scheme: signs vouchers and deposit
 * authorizations with a Hedera account key and (optionally) reads channel state.
 *
 * Mirrors `ClientHederaBatchSigner` in the vendored `@x402/hedera` package.
 */
export interface ClientHederaBatchSigner {
  /** Hedera account id (`0.0.x`). */
  readonly accountId: string;
  /** Account EVM address as the network sees it (alias or long-zero); used as `ChannelConfig.payer`. */
  readonly evmAddress: `0x${string}`;
  readonly keyType: HederaKeyType;
  /** Signs a 32-byte digest (raw ED25519 64-byte or ECDSA 65-byte signature). */
  signDigest(digest: `0x${string}`): Promise<`0x${string}`>;
  /** Verifies a signature produced by this signer's own key (used for corrective-402 recovery). */
  verifyOwnSignature(digest: `0x${string}`, signature: `0x${string}`): Promise<boolean>;
  /** Optional onchain read capability (Mirror Node) for channel recovery. */
  readContract?(args: HederaContractReadArgs): Promise<unknown>;
}
