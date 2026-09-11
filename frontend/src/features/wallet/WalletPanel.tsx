import { useState } from "react";
import { Copy, Check, ArrowSquareOut } from "@phosphor-icons/react";
import { Amount, Button, Mono, Toggle } from "@/design/ui";
import { approxUsd } from "@/lib/money";
import { hashscanAccountUrl } from "@/lib/hedera";
import { useWallet } from "./WalletProvider";
import { ActiveLocks } from "./ActiveLocks";
import { DepositPanel } from "./DepositPanel";

/** Connected wallet view, shared by the sheet and the /me Wallet tab. */
export function WalletPanel() {
  const wallet = useWallet();
  const [copied, setCopied] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const copy = async () => {
    if (!wallet.accountId) return;
    await navigator.clipboard.writeText(wallet.accountId).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <Mono block className="flex-1 text-fg">
            {wallet.accountId ?? "0.0.—"}
          </Mono>
          <Button variant="icon" onClick={copy} aria-label="Copy account id">
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </Button>
          <a
            href={hashscanAccountUrl(wallet.accountId ?? "")}
            target="_blank"
            rel="noreferrer"
            className="grid size-10 place-items-center rounded-pill border border-border hover:bg-surface-2"
            aria-label="Open on HashScan"
          >
            <ArrowSquareOut size={18} />
          </a>
        </div>
        <Mono className="truncate">{wallet.address}</Mono>
        <div>
          <Amount value={wallet.balance ?? 0n} className="text-display font-bold tracking-[-0.03em]" />
          <div className="text-small text-muted-fg">{approxUsd(wallet.balance ?? 0n)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="chain" onClick={() => setDepositOpen(v => !v)}>
          Deposit
        </Button>
        <Button variant="outline" disabled title="Withdraw ships after the hackathon">
          Withdraw
        </Button>
        <Button variant="link" className="text-destructive" onClick={() => void wallet.logout()}>
          Disconnect
        </Button>
      </div>

      {depositOpen ? <DepositPanel onClose={() => setDepositOpen(false)} /> : null}

      <Toggle
        checked={wallet.autoApprove}
        onChange={wallet.setAutoApprove}
        label="Auto-approve chunks"
        help="No signature prompt while watching"
      />

      <ActiveLocks />
    </div>
  );
}
