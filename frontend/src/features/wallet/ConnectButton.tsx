import { Wallet } from "@phosphor-icons/react";
import { Button } from "@/design/ui";
import { useWallet } from "./WalletProvider";

export function ConnectButton() {
  const wallet = useWallet();
  return (
    <Button variant="chain" size="sm" onClick={wallet.openSheet} loading={wallet.status === "connecting"}>
      <Wallet size={17} />
      {wallet.status === "connecting" ? "Connecting" : wallet.status === "onboarding" ? "Setting up" : "Connect wallet"}
    </Button>
  );
}
