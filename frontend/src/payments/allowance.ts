import { encodeFunctionData, parseAbi } from "viem";
import { COLLECTOR_ADDRESS, COLLECTOR_ID, USDC_EVM_ADDRESS, USDC_TOKEN_ID } from "@/lib/hedera";
import { HTS_INT64_MAX } from "./x402-lite";
import { getTokenAllowance, pollUntil } from "@/lib/mirror";
import type { Eip1193Provider } from "./privySigner";

const erc20ApproveAbi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

/** Explicit gas: the Hedera JSON-RPC relay's estimate is unreliable for HTS facade calls. */
export const APPROVE_GAS = 800_000n;

/** Allowance below this is treated as "needs approval" (enough for ~9 million USDC of deposits). */
export const ALLOWANCE_THRESHOLD = HTS_INT64_MAX / 1000n;

export async function readCollectorAllowance(accountId: string): Promise<bigint> {
  return getTokenAllowance(accountId, COLLECTOR_ID, USDC_TOKEN_ID);
}

/**
 * Grants the deposit collector an HTS allowance for USDC through the token's ERC-20 facade
 * (`approve` on the token's EVM address) using the wallet's EVM provider. For a hollow Hedera
 * account this is the first outgoing transaction and completes the account.
 */
export async function approveCollectorAllowance(options: {
  provider: Eip1193Provider;
  from: `0x${string}`;
  accountId: string;
}): Promise<{ txHash: string; allowance: bigint }> {
  const data = encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [COLLECTOR_ADDRESS, HTS_INT64_MAX],
  });
  const txHash = (await options.provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: options.from,
        to: USDC_EVM_ADDRESS,
        data,
        gas: `0x${APPROVE_GAS.toString(16)}`,
        value: "0x0",
      },
    ],
  })) as string;

  const allowance = await pollUntil(
    async () => {
      const current = await readCollectorAllowance(options.accountId);
      return current >= ALLOWANCE_THRESHOLD ? current : undefined;
    },
    { timeoutMs: 45_000, intervalMs: 2_000 },
  );
  if (allowance === undefined) {
    throw new Error("Allowance was not visible on the Mirror Node within 45 s");
  }
  return { txHash, allowance };
}
