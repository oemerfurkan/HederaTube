import { Button, Mono } from "@/design/ui";
import { USDC_TOKEN_ID } from "@/lib/hedera";
import { useWallet } from "./WalletProvider";

const SQUID_INTEGRATOR_ID: string = import.meta.env.VITE_SQUID_INTEGRATOR_ID || "";

/**
 * Deposit: the Squid widget (Axelar) with Hedera USDC as the fixed destination. Without an
 * integrator id (or in mock mode) it shows the destination details so a demo wallet can be
 * pre-funded instead — the documented fallback (guide §12).
 */
export function DepositPanel({ onClose }: { onClose: () => void }) {
  const wallet = useWallet();
  return (
    <div className="grid gap-3 rounded-md bg-surface-2 p-4">
      <div className="text-[14px] font-medium">Deposit USDC on Hedera</div>
      {SQUID_INTEGRATOR_ID ? (
        <iframe
          title="Squid"
          className="h-[520px] w-full rounded-md border-0"
          src={`https://app.squidrouter.com/iframe?config=${encodeURIComponent(
            JSON.stringify({
              integratorId: SQUID_INTEGRATOR_ID,
              initialAssets: { to: { chainId: "295", address: USDC_TOKEN_ID } },
              lockToChain: true,
              lockToToken: true,
              destinationAddress: wallet.address,
            }),
          )}`}
        />
      ) : (
        <>
          <p className="text-small text-muted-fg">
            Squid is not configured. Send testnet USDC (token {USDC_TOKEN_ID}) to this account; auto-association is on.
          </p>
          <Mono block>{wallet.accountId ?? wallet.address}</Mono>
        </>
      )}
      <Button variant="ghost" size="sm" onClick={onClose} className="justify-self-end">
        Close
      </Button>
    </div>
  );
}
