import { Amount } from "@/design/ui";
import { useWallet } from "./WalletProvider";

/** Chain outline pill with the tabular balance. Opens the wallet sheet. */
export function BalancePill() {
  const wallet = useWallet();
  return (
    <button
      type="button"
      onClick={wallet.openSheet}
      className="inline-flex h-9 items-center rounded-pill border border-chain/60 px-3.5 text-[13px] font-medium text-chain-fg transition-colors duration-[180ms] ease-ht hover:bg-chain-soft"
    >
      {wallet.balance !== undefined ? <Amount value={wallet.balance} /> : <span className="text-muted-fg">—</span>}
    </button>
  );
}
