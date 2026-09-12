import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IDKitRequestWidget, selfieCheckLegacy, setDebug, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { ScanSmiley } from "@phosphor-icons/react";
import { Button, Dialog, cn, toast } from "@/design/ui";
import { api } from "@/api/client";
import { queryKeys } from "@/lib/queryKeys";
import { useWallet } from "@/features/wallet/WalletProvider";

const WORLD_APP_ID = (import.meta.env.VITE_WORLD_APP_ID as string) || "";
const WORLD_ACTION = (import.meta.env.VITE_WORLD_ACTION as string) || "hederatube-creator";
const WORLD_ENVIRONMENT = ((import.meta.env.VITE_WORLD_ENVIRONMENT as string) || "production") as "production" | "staging" | "sandbox";

// IDKit's debug report names the failing step (bridge, signature, app); dev builds keep it on
if (import.meta.env.DEV) setDebug(true);

/**
 * The header control for a wallet that has not passed World ID's Selfie Check yet. Pressing it
 * asks the server for a signed request, then IDKit shows the QR code to scan with World App; the
 * proof goes back to the server, which records the nullifier and turns this button into Create.
 * Without an app id the build simulates the check so the creator flow stays usable.
 */
export function VerifyButton({ className }: { className?: string }) {
  const wallet = useWallet();
  const queries = useQueryClient();
  const [rpContext, setRpContext] = useState<RpContext>();
  const [open, setOpen] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const finished = async () => {
    if (wallet.address) await queries.invalidateQueries({ queryKey: queryKeys.me(wallet.address) });
    toast("Verified with World ID");
  };

  const start = async () => {
    if (!wallet.address) return wallet.openSheet();
    if (!WORLD_APP_ID) return setSimulateOpen(true);
    setBusy(true);
    try {
      const ctx = await api.worldRequest(wallet.address);
      setRpContext({ rp_id: ctx.rp_id, nonce: ctx.nonce, created_at: ctx.created_at, expires_at: ctx.expires_at, signature: ctx.signature });
      setOpen(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : "World ID request failed");
    } finally {
      setBusy(false);
    }
  };

  const simulate = async () => {
    if (!wallet.address) return;
    setBusy(true);
    try {
      await api.verifyWorld({ address: wallet.address, accountId: wallet.accountId, simulated: true });
      setSimulateOpen(false);
      await finished();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" size="md" className={cn("h-10 gap-1.5! pl-3! pr-4! text-[14px]", className)} onClick={() => void start()} loading={busy}>
        <ScanSmiley size={20} />
        Verify
      </Button>

      {WORLD_APP_ID && rpContext ? (
        <IDKitRequestWidget
          app_id={WORLD_APP_ID as `app_${string}`}
          action={WORLD_ACTION}
          rp_context={rpContext}
          // World ID 3.0 Selfie Check: the 4.0 credential request did not complete in World App, and the
          // legacy preset is what the sandbox app answers today. The verifier accepts 3.0 payloads as-is.
          preset={selfieCheckLegacy({ signal: wallet.address })}
          allow_legacy_proofs={true}
          environment={WORLD_ENVIRONMENT}
          open={open}
          onOpenChange={setOpen}
          handleVerify={async (result: IDKitResult) => {
            await api.verifyWorld({ address: wallet.address!, accountId: wallet.accountId, result });
          }}
          onSuccess={() => void finished()}
          onError={(code, report) => {
            console.error("[world-id]", code, report);
            toast(`World ID: ${code}`);
          }}
        />
      ) : null}

      <Dialog open={simulateOpen} onClose={() => setSimulateOpen(false)} title="Verify to create">
        <p className="text-[14px] leading-5 text-muted-fg">
          Creators pass one World ID Selfie Check, so the same person cannot open a second channel. This build has no World app id, so the check is simulated.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setSimulateOpen(false)}>
            Not now
          </Button>
          <Button variant="chain" onClick={() => void simulate()} loading={busy}>
            Simulate verification
          </Button>
        </div>
      </Dialog>
    </>
  );
}
