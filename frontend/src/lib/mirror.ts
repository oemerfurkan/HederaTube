import { MIRROR_NODE_URL } from "./hedera";

export type MirrorAccount = {
  account: string;
  evm_address: string | null;
  balance: { balance: number; tokens: { token_id: string; balance: number }[] };
  key: { _type: string; key: string } | null;
  max_automatic_token_associations: number;
};

async function getJson<T>(url: string): Promise<T | undefined> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Mirror Node ${response.status} for ${url}`);
  return (await response.json()) as T;
}

/** Looks up a Hedera account by EVM alias or `0.0.x`; undefined while the account does not exist (hollow). */
export function getAccount(idOrAddress: string): Promise<MirrorAccount | undefined> {
  return getJson<MirrorAccount>(`${MIRROR_NODE_URL}/api/v1/accounts/${encodeURIComponent(idOrAddress)}`);
}

export async function getTokenBalance(accountId: string, tokenId: string): Promise<bigint> {
  const data = await getJson<{ tokens: { token_id: string; balance: number }[] }>(
    `${MIRROR_NODE_URL}/api/v1/accounts/${encodeURIComponent(accountId)}/tokens?token.id=${tokenId}`,
  );
  const row = data?.tokens.find(t => t.token_id === tokenId);
  return row ? BigInt(row.balance) : 0n;
}

export async function getTokenAllowance(
  ownerId: string,
  spenderId: string,
  tokenId: string,
): Promise<bigint> {
  const data = await getJson<{ allowances: { amount: number; amount_granted: number }[] }>(
    `${MIRROR_NODE_URL}/api/v1/accounts/${encodeURIComponent(ownerId)}/allowances/tokens?spender.id=${spenderId}&token.id=${tokenId}`,
  );
  const row = data?.allowances[0];
  return row ? BigInt(row.amount ?? row.amount_granted ?? 0) : 0n;
}

/** Polls `fn` until it returns a defined value or the deadline passes. */
export async function pollUntil<T>(
  fn: () => Promise<T | undefined>,
  { timeoutMs = 30_000, intervalMs = 1_500 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value !== undefined) return value;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return undefined;
}
