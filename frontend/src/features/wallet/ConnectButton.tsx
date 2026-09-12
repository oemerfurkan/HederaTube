import { Wallet } from "@phosphor-icons/react";
import { Button } from "@/design/ui";
import { useWallet } from "./WalletProvider";

export function ConnectButton() {
  const wallet = useWallet();
  return (
    <Button variant="chain" size="md" className="h-10 gap-1.5! pl-3.5! pr-4! text-[14px]" onClick={wallet.openSheet} loading={wallet.status === "connecting"}>
      <Wallet size={18} />
      {wallet.status === "connecting" ? "Connecting" : wallet.status === "onboarding" ? "Setting up" : "Connect wallet"}
    </Button>
  );
}
