import { useNavigate } from "react-router";
import { List, Plus } from "@phosphor-icons/react";
import { Avatar, Button } from "@/design/ui";
import { useWallet } from "@/features/wallet/WalletProvider";
import { useMe } from "@/api/hooks";
import { VerifyButton } from "@/features/verify/VerifyButton";
import { BalancePill } from "@/features/wallet/BalancePill";
import { ConnectButton } from "@/features/wallet/ConnectButton";
import { SearchBar } from "@/features/search/SearchBar";
import { Brand } from "./Brand";

/**
 * 56 px header, no divider: the search sits centred with its own submit button, and every control
 * on the right shares one 40 px height. Create is secondary — play owns the only red.
 */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const wallet = useWallet();
  const navigate = useNavigate();
  const me = useMe(wallet.address);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-bg px-4">
      <button type="button" className="grid size-10 shrink-0 place-items-center rounded-pill hover:bg-surface-2" onClick={onMenu} aria-label="Menu">
        <List size={24} />
      </button>
      <Brand />

      <SearchBar />

      <div className="ml-auto flex items-center gap-2">
        {wallet.status === "ready" ? (
          <>
            {me.data?.verified ? (
              <Button variant="secondary" size="md" className="h-10 gap-1.5! pl-3! pr-4! text-[14px]" onClick={() => navigate("/upload")}>
                <Plus size={20} />
                Create
              </Button>
            ) : me.data ? (
              <VerifyButton />
            ) : null}
            <BalancePill />
            <button type="button" onClick={wallet.openSheet} className="grid size-10 place-items-center rounded-pill" aria-label="Wallet">
              <Avatar size={40} />
            </button>
          </>
        ) : (
          <ConnectButton />
        )}
      </div>
    </header>
  );
}
