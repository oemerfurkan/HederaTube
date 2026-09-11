import { AccountId, Client, Hbar, TransferTransaction } from "@x402/hedera";
import { createHederaAuthorizerSigner, createHederaMirrorNodeClient, parseHederaPrivateKey, entityIdToLongZeroAddress, tokenIdToEvmAddress, type HederaAuthorizerSigner } from "@x402/hedera/batch-settlement";
import { env, MIRROR_NODE_URL } from "./env.js";

export const NETWORK = env.HEDERA_NETWORK;
export const USDC_TOKEN_ID = env.HEDERA_USDC_TOKEN_ID;
export const USDC_EVM_ADDRESS = tokenIdToEvmAddress(USDC_TOKEN_ID);

export const mirror = createHederaMirrorNodeClient({ mirrorNodeUrl: MIRROR_NODE_URL });

export function hashscanTxUrl(transactionId: string): string {
  const normalized = transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  return `https://hashscan.io/${NETWORK === "hedera:mainnet" ? "mainnet" : "testnet"}/transaction/${normalized}`;
}

export function receiverAddressOf(accountId: string): `0x${string}` {
  return entityIdToLongZeroAddress(accountId);
}

let authorizer: Promise<HederaAuthorizerSigner> | undefined;
/** Receiver authorizer: signs claim batches and refunds. Held by this server, not the facilitator. */
export function getAuthorizerSigner(): Promise<HederaAuthorizerSigner> {
  if (!env.HEDERA_RECEIVER_AUTHORIZER_ACCOUNT_ID || !env.HEDERA_RECEIVER_AUTHORIZER_PRIVATE_KEY) {
    throw new Error("HEDERA_RECEIVER_AUTHORIZER_ACCOUNT_ID / _PRIVATE_KEY are required");
  }
  authorizer ??= createHederaAuthorizerSigner(
    env.HEDERA_RECEIVER_AUTHORIZER_ACCOUNT_ID,
    parseHederaPrivateKey(env.HEDERA_RECEIVER_AUTHORIZER_PRIVATE_KEY),
    { network: NETWORK, mirrorNodeUrl: MIRROR_NODE_URL },
  );
  return authorizer;
}

let operatorClient: Client | undefined;
function getOperatorClient(): Client {
  if (!env.HEDERA_OPERATOR_ACCOUNT_ID || !env.HEDERA_OPERATOR_PRIVATE_KEY) {
    throw new Error("HEDERA_OPERATOR_ACCOUNT_ID / _PRIVATE_KEY are required for the faucet");
  }
  operatorClient ??= (NETWORK === "hedera:mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(
    env.HEDERA_OPERATOR_ACCOUNT_ID,
    parseHederaPrivateKey(env.HEDERA_OPERATOR_PRIVATE_KEY),
  );
  return operatorClient;
}

/**
 * Faucet: HBAR transfer to an EVM alias. For an address without an account this auto-creates a
 * hollow account (unlimited auto-association by default); the viewer's first outgoing tx completes it.
 */
export async function dripHbarTo(evmAddress: string, hbar = env.FAUCET_HBAR): Promise<string> {
  const client = getOperatorClient();
  const to = AccountId.fromEvmAddress(0, 0, evmAddress.replace(/^0x/, ""));
  const tx = await new TransferTransaction()
    .addHbarTransfer(client.operatorAccountId!, new Hbar(-hbar))
    .addHbarTransfer(to, new Hbar(hbar))
    .setTransactionMemo("HederaTube onboarding")
    .execute(client);
  await tx.getReceipt(client);
  return tx.transactionId.toString();
}

/** Mirror account lookup that returns undefined on 404 (hollow / not yet created). */
export async function findAccount(idOrEvm: string): Promise<{ account: string; evm_address: string | null; max_automatic_token_associations: number; key: unknown } | undefined> {
  const res = await fetch(`${MIRROR_NODE_URL}/api/v1/accounts/${encodeURIComponent(idOrEvm)}`, { headers: { accept: "application/json" } });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Mirror Node ${res.status}`);
  return (await res.json()) as never;
}

export async function tokenBalanceOf(accountId: string, tokenId = USDC_TOKEN_ID): Promise<bigint> {
  const res = await fetch(`${MIRROR_NODE_URL}/api/v1/accounts/${encodeURIComponent(accountId)}/tokens?token.id=${tokenId}`);
  if (!res.ok) return 0n;
  const data = (await res.json()) as { tokens?: { token_id: string; balance: number }[] };
  const row = data.tokens?.find(t => t.token_id === tokenId);
  return row ? BigInt(row.balance) : 0n;
}

export async function pollUntil<T>(fn: () => Promise<T | undefined>, { timeoutMs = 30_000, intervalMs = 2_000 } = {}): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return undefined;
}
