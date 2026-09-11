import { getAddress, isAddress } from "viem";
import { HEDERA_CHAIN_IDS } from "./constants";
import { HEDERA_ENTITY_ID_REGEX } from "../constants";

/**
 * Returns the EVM chain id Hedera exposes as `block.chainid` for a CAIP-2 network.
 *
 * @param network - `hedera:mainnet` or `hedera:testnet`.
 * @returns 295 or 296.
 */
export function getHederaChainId(network: string): number {
  const chainId = HEDERA_CHAIN_IDS[network];
  if (chainId === undefined) {
    throw new Error(`Unsupported Hedera network: ${network}`);
  }
  return chainId;
}

/**
 * Long-zero EVM address of a Hedera entity id (`shard.realm.num`).
 * Layout: 4 bytes shard, 8 bytes realm, 8 bytes num.
 */
export function entityIdToLongZeroAddress(entityId: string): `0x${string}` {
  if (!HEDERA_ENTITY_ID_REGEX.test(entityId)) {
    throw new Error(`Invalid Hedera entity id: ${entityId}`);
  }
  const [shard, realm, num] = entityId.split(".").map(part => BigInt(part));
  const hex =
    shard.toString(16).padStart(8, "0") +
    realm.toString(16).padStart(16, "0") +
    num.toString(16).padStart(16, "0");
  return getAddress(`0x${hex}`);
}

/** Long-zero EVM address of an HTS token id. */
export function tokenIdToEvmAddress(tokenId: string): `0x${string}` {
  return entityIdToLongZeroAddress(tokenId);
}

/** True when `address` is a long-zero address (first 12 bytes zero). */
export function isLongZeroAddress(address: string): boolean {
  if (!isAddress(address)) return false;
  return address.slice(2, 26).toLowerCase() === "000000000000000000000000";
}

/** Converts a long-zero address back to a Hedera entity id. */
export function longZeroAddressToEntityId(address: string, shard = 0, realm = 0): string {
  if (!isLongZeroAddress(address)) {
    throw new Error(`Not a long-zero address: ${address}`);
  }
  const num = BigInt(`0x${address.slice(26)}`);
  return `${shard}.${realm}.${num.toString()}`;
}

/** Subset of the Mirror Node `/accounts/{id}` response used for address resolution. */
export type MirrorAccountSummary = {
  account: string;
  evm_address: string | null;
  key: { _type: string; key: string } | null;
  max_automatic_token_associations: number;
};

/**
 * Resolves the canonical EVM address of a Hedera account as the network sees it: the EVM alias
 * for ECDSA-alias accounts, otherwise the long-zero address.
 */
export async function resolveAccountEvmAddress(
  mirrorBaseUrl: string,
  accountId: string,
): Promise<`0x${string}`> {
  const response = await fetch(
    `${mirrorBaseUrl}/api/v1/accounts/${encodeURIComponent(accountId)}`,
  );
  if (!response.ok) {
    throw new Error(`Mirror Node account lookup failed (${response.status}) for ${accountId}`);
  }
  const account = (await response.json()) as MirrorAccountSummary;
  if (account.evm_address) {
    return getAddress(account.evm_address);
  }
  return entityIdToLongZeroAddress(account.account);
}

/** Case-insensitive address equality. */
export function addressesEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Resolves `payTo` to the receiver EVM address committed in the channel config. */
export function resolveReceiverAddress(payTo: string): `0x${string}` | undefined {
  if (HEDERA_ENTITY_ID_REGEX.test(payTo)) return entityIdToLongZeroAddress(payTo);
  if (isAddress(payTo)) return getAddress(payTo);
  return undefined;
}

/** Resolves `asset` to the token EVM address. */
export function resolveTokenAddress(asset: string): `0x${string}` | undefined {
  if (HEDERA_ENTITY_ID_REGEX.test(asset)) return tokenIdToEvmAddress(asset);
  if (isAddress(asset)) return getAddress(asset);
  return undefined;
}

/** Resolves the HTS token id (`0.0.x`) from either form. */
export function resolveTokenId(asset: string): string | undefined {
  if (HEDERA_ENTITY_ID_REGEX.test(asset)) return asset;
  if (isLongZeroAddress(asset)) return longZeroAddressToEntityId(asset);
  return undefined;
}
