import { api } from "@/api/client";
import { ONBOARD_MODE, CHAIN_ID } from "@/lib/hedera";
import { getAccount, pollUntil } from "@/lib/mirror";
import { ALLOWANCE_THRESHOLD, approveCollectorAllowance, readCollectorAllowance } from "./allowance";
import type { Eip1193Provider } from "./privySigner";

export type OnboardingStep = "account" | "allowance" | "ready";
export type OnboardingState = {
  step: OnboardingStep;
  done: OnboardingStep[];
  error?: string;
  faucetTx?: string;
  approveTx?: string;
};

/**
 * First-time onboarding (guide §2.8): the embedded wallet's address is a hollow Hedera account
 * until it receives HBAR. The faucet drip creates the account (auto-association on), then the
 * USDC allowance for the deposit collector is granted once through the ERC-20 facade — the
 * first outgoing transaction, which also completes the hollow account.
 */
export async function runOnboarding(options: {
  address: `0x${string}`;
  getProvider?: () => Promise<Eip1193Provider>;
  switchChain?: (chainId: number) => Promise<void>;
  onState: (state: OnboardingState) => void;
}): Promise<{ accountId: string }> {
  const { address, onState } = options;
  const done: OnboardingStep[] = [];
  let faucetTx: string | undefined;
  let approveTx: string | undefined;
  const emit = (step: OnboardingStep, error?: string) => onState({ step, done: [...done], error, faucetTx, approveTx });

  emit("account");
  let accountId: string;
  if (ONBOARD_MODE === "mock") {
    const drip = await api.faucet(address);
    faucetTx = drip.txId;
    accountId = drip.accountId;
  } else {
    let account = await getAccount(address);
    if (!account) {
      try {
        const drip = await api.faucet(address);
        faucetTx = drip.txId;
      } catch {
        /* no faucet endpoint yet; fall through to polling / instructions */
      }
      account = await pollUntil(() => getAccount(address), { timeoutMs: 40_000, intervalMs: 2_500 });
    }
    if (!account) {
      const message = `No Hedera account for ${address} yet. Send it a little testnet HBAR (portal.hedera.com faucet) and retry.`;
      emit("account", message);
      throw new Error(message);
    }
    accountId = account.account;
  }
  done.push("account");

  emit("allowance");
  if (ONBOARD_MODE !== "mock") {
    const current = await readCollectorAllowance(accountId).catch(() => 0n);
    if (current < ALLOWANCE_THRESHOLD) {
      if (!options.getProvider) {
        const message = "This wallet cannot send the allowance transaction.";
        emit("allowance", message);
        throw new Error(message);
      }
      try {
        await options.switchChain?.(CHAIN_ID);
        const result = await approveCollectorAllowance({ provider: await options.getProvider(), from: address, accountId });
        approveTx = result.txHash;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emit("allowance", message);
        throw error;
      }
    }
  }
  done.push("allowance");
  emit("ready");
  return { accountId };
}
