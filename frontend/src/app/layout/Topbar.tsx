import { Link, useNavigate } from "react-router";
import { List, MagnifyingGlass, Play } from "@phosphor-icons/react";
import { Button } from "@/design/ui";
import { useWallet } from "@/features/wallet/WalletProvider";
import { BalancePill } from "@/features/wallet/BalancePill";
import { ConnectButton } from "@/features/wallet/ConnectButton";
import { AddressAvatar } from "@/design/ui";
import { useMe } from "@/api/hooks";

/** 56 px, surface, 1 px border. Verify/Create is secondary: play owns the only red on the watch page. */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const wallet = useWallet();
  const navigate = useNavigate();
  const me = useMe(wallet.address);
  const verified = me.data?.verified ?? false;
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 md:px-6">
      <button type="button" className="rounded-pill p-2 hover:bg-surface-2 md:hidden" onClick={onMenu} aria-label="Menu">
        <List size={20} />
      </button>
      <Link to="/" className="flex items-center gap-2 font-bold tracking-[-0.02em]">
        <span className="grid h-[22px] w-[31px] place-items-center rounded-sm bg-primary text-white">
          <Play size={12} weight="fill" />
        </span>
        <span className="hidden sm:inline">HederaTube</span>
      </Link>
      <form
        className="mx-auto hidden h-11 w-full max-w-[560px] items-center gap-2.5 rounded-pill border border-input bg-bg px-[18px] md:flex"
        onSubmit={e => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          navigate(q ? `/?q=${encodeURIComponent(String(q))}` : "/");
        }}
      >
        <MagnifyingGlass size={17} className="text-muted-fg" />
        <input name="q" placeholder="Search" className="w-full bg-transparent text-body outline-none placeholder:text-muted-fg" />
      </form>
      <div className="ml-auto flex items-center gap-2.5">
        {wallet.status === "ready" ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => navigate(verified ? "/upload" : "/verify")}>
              {verified ? "Create" : "Verify"}
            </Button>
            <BalancePill />
            <button type="button" onClick={wallet.openSheet} className="rounded-pill" aria-label="Wallet">
              <AddressAvatar address={wallet.address!} size={32} />
            </button>
          </>
        ) : (
          <ConnectButton />
        )}
      </div>
    </header>
  );
}
