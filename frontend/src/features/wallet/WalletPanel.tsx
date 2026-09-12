import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, ArrowSquareOut, Check, Copy, SignOut } from "@phosphor-icons/react";
import { Amount, ChainMark, cn, toast, type Chain } from "@/design/ui";
import { hashscanAccountUrl, shortAddress } from "@/lib/hedera";
import { useWallet } from "./WalletProvider";

type Row = {
  chain: Chain;
  label: string;
  value?: string;
  display?: string;
  missing: string;
  explorer?: string;
};

/**
 * The connected wallet at a glance: the balance that funds playback, and the three addresses a
 * deposit can be sent to. Anything that needs a page, locks and history, lives on My channel.
 */
export function WalletPanel({ showChannelLink = true, showDisconnect = true }: { showChannelLink?: boolean; showDisconnect?: boolean }) {
  const wallet = useWallet();
  const rows: Row[] = [
    {
      chain: "hedera",
      label: "Hedera account",
      value: wallet.accountId,
      display: wallet.accountId,
      missing: "Created on first use",
      explorer: wallet.accountId ? hashscanAccountUrl(wallet.accountId) : undefined,
    },
    {
      chain: "evm",
      label: "EVM address",
      value: wallet.address,
      display: wallet.address ? shortAddress(wallet.address, 8, 6) : undefined,
      missing: "Not available",
    },
    {
      chain: "svm",
      label: "Solana address",
      value: wallet.solanaAddress,
      display: wallet.solanaAddress ? shortAddress(wallet.solanaAddress, 6, 6) : undefined,
      missing: "Not available in this wallet",
    },
  ];

  return (
    <div className="grid gap-5">
      <div className="grid gap-0.5">
        <span className="label-caps text-muted-fg">Balance</span>
        <Amount value={wallet.balance ?? 0n} className="text-[28px] font-bold leading-9 tracking-[-0.02em]" />
        <span className="text-[12px] leading-[18px] text-muted-fg">USDC · Hedera testnet</span>
      </div>

      <section className="grid gap-2">
        <h3 className="label-caps text-muted-fg">Deposit addresses</h3>
        <ul className="grid gap-1.5">
          {rows.map(row => (
            <AddressRow key={row.chain} row={row} />
          ))}
        </ul>
      </section>

      {showChannelLink || showDisconnect ? (
        <div className="grid gap-1">
          {showChannelLink ? (
            <Link
              to="/me"
              onClick={wallet.closeSheet}
              className="flex h-10 items-center justify-between rounded-pill bg-surface-2 px-4 text-[14px] font-medium transition-colors duration-[180ms] ease-ht hover:bg-surface-3"
            >
              Locks, history and earnings
              <ArrowRight size={16} className="text-muted-fg" />
            </Link>
          ) : null}
          {showDisconnect ? <DisconnectRow /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Quiet destructive row: muted until hovered, so leaving is available but never the loudest thing. */
export function DisconnectRow() {
  const wallet = useWallet();
  return (
    <button
      type="button"
      onClick={() => void wallet.logout()}
      className="flex h-9 w-full items-center justify-between rounded-pill px-4 text-[13px] font-medium text-muted-fg transition-colors duration-[180ms] ease-ht hover:bg-surface-2 hover:text-destructive"
    >
      Disconnect wallet
      <SignOut size={16} />
    </button>
  );
}

function AddressRow({ row }: { row: Row }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!row.value) return;
    await navigator.clipboard.writeText(row.value).catch(() => undefined);
    setCopied(true);
    toast(`${row.label} copied`);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <li className="group flex items-center rounded-md bg-surface-2 transition-colors duration-[180ms] ease-ht hover:bg-surface-3">
      <button
        type="button"
        onClick={copy}
        disabled={!row.value}
        title={row.value ? `Copy ${row.label.toLowerCase()}` : undefined}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-2 text-left disabled:cursor-default"
      >
        <ChainMark chain={row.chain} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] leading-[18px] text-muted-fg">{row.label}</span>
          <span className={cn("block truncate font-mono text-[13px] leading-5", row.value ? "text-fg" : "text-muted-fg")}>
            {row.display ?? row.missing}
          </span>
        </span>
        {row.value ? (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-pill transition-colors duration-[180ms] ease-ht", copied ? "text-positive-fg" : "text-muted-fg group-hover:text-fg")}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </span>
        ) : null}
      </button>
      {row.explorer ? (
        <a
          href={row.explorer}
          target="_blank"
          rel="noreferrer"
          aria-label="Open on HashScan"
          title="Open on HashScan"
          className="mr-2 grid size-8 shrink-0 place-items-center rounded-pill text-muted-fg transition-colors duration-[180ms] ease-ht hover:bg-surface-2 hover:text-fg"
        >
          <ArrowSquareOut size={16} />
        </a>
      ) : null}
    </li>
  );
}
