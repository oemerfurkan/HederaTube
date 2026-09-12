import { hederaTestnet } from "viem/chains";
import { getAddress } from "viem";
import {
  BATCH_SETTLEMENT_DEPLOYMENTS,
  HEDERA_TESTNET_USDC,
  HEDERA_USDC_DECIMALS,
  entityIdToLongZeroAddress,
} from "@/payments/x402-lite";

export const NETWORK = (import.meta.env.VITE_HEDERA_NETWORK || "hedera:testnet") as `hedera:${string}`;
export const CHAIN = hederaTestnet;
export const CHAIN_ID = 296;

export const MIRROR_NODE_URL: string =
  import.meta.env.VITE_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com";
/** Base URL for `POST /api/v1/contracts/call` (MSW serves it in mock mode). */
export const MIRROR_CONTRACT_CALL_URL: string =
  import.meta.env.VITE_MIRROR_CONTRACT_CALL_URL || MIRROR_NODE_URL;
export const HASHIO_RPC: string = import.meta.env.VITE_HASHIO_RPC || "https://testnet.hashio.io/api";

export const USDC_TOKEN_ID = HEDERA_TESTNET_USDC;
export const USDC_DECIMALS = HEDERA_USDC_DECIMALS;
export const USDC_EVM_ADDRESS = entityIdToLongZeroAddress(USDC_TOKEN_ID);

const deployment = BATCH_SETTLEMENT_DEPLOYMENTS[NETWORK];
if (!deployment) throw new Error(`No batch-settlement deployment for ${NETWORK}`);
export const ESCROW_ADDRESS = getAddress(deployment.settlement);
export const ESCROW_ID = deployment.settlementId;
export const COLLECTOR_ADDRESS = getAddress(deployment.collector);
export const COLLECTOR_ID = deployment.collectorId;

export const API_MODE = (import.meta.env.VITE_API_MODE || "real") as "mock" | "real";
export const ONBOARD_MODE = (import.meta.env.VITE_ONBOARD_MODE || "mock") as "mock" | "real";
export const PRIVY_APP_ID: string = import.meta.env.VITE_PRIVY_APP_ID || "";
// World ID is parked for now (see features/verify/VerifyPage.tsx).
// export const WORLD_VERIFY_MODE = ((import.meta.env.VITE_WORLD_VERIFY_MODE as string) || (API_MODE === "mock" ? "simulate" : "real")) as "simulate" | "real";
/** Dev-only: seed the local signer with a funded testnet key instead of generating one. */
export const DEV_PRIVATE_KEY: string = import.meta.env.VITE_DEV_PRIVATE_KEY || "";
export const WALLET_MODE = ((import.meta.env.VITE_WALLET_MODE as string) ||
  (PRIVY_APP_ID ? "privy" : "local")) as "privy" | "local";

/** HashScan link for a Hedera transaction id (`0.0.x@sec.nanos` or `0.0.x-sec-nanos`). */
export function hashscanTxUrl(transactionId: string): string {
  const normalized = transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  return `https://hashscan.io/testnet/transaction/${normalized}`;
}

export function hashscanAccountUrl(accountId: string): string {
  return `https://hashscan.io/testnet/account/${accountId}`;
}

export function shortAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
