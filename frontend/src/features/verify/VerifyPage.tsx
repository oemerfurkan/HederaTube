import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { IDKitRequestWidget, proofOfHuman, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { keccak256, toBytes } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, cn } from "@/design/ui";
import { useMe } from "@/api/hooks";
import { api } from "@/api/client";
import { API_MODE } from "@/lib/hedera";
import { useWallet } from "@/features/wallet/WalletProvider";

const WORLD_APP_ID = (import.meta.env.VITE_WORLD_APP_ID as string) || "";
const WORLD_ACTION = (import.meta.env.VITE_WORLD_ACTION as string) || "hederatube-creator";

const input =
  "h-11 rounded-pill border border-input bg-bg px-5 text-body outline-none transition-all duration-[180ms] ease-ht focus:border-primary focus:ring-[3px] focus:ring-ring";

/** Best-effort nullifier extraction across IDKit result versions; the backend is the authority. */
function nullifierOf(result: unknown): string {
  const r = result as { nullifier_hash?: string; nullifier?: string; responses?: { nullifier?: string; nullifier_hash?: string }[] };
  return r.nullifier_hash ?? r.nullifier ?? r.responses?.[0]?.nullifier ?? r.responses?.[0]?.nullifier_hash ?? keccak256(toBytes(JSON.stringify(result)));
}

/** Guide §6.6: one dialog, three steps. Already verified → no dialog, straight to upload. */
export function VerifyPage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe(wallet.address);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext>();
  const [widgetOpen, setWidgetOpen] = useState(false);

  // Already verified on arrival → no dialog. After verifying here, step 3 shows the result first.
  useEffect(() => {
    if (me.data?.verified && step === 1) navigate("/upload", { replace: true });
  }, [me.data?.verified, step, navigate]);

  const submit = async (proof: unknown) => {
    if (!wallet.address) return;
    setBusy(true);
    setError(undefined);
    try {
      await api.verifyWorld({
        address: wallet.address,
        accountId: wallet.accountId,
        proof: { ...(proof as object), nullifier_hash: nullifierOf(proof) },
        handle,
        displayName,
      });
      await queryClient.invalidateQueries({ queryKey: ["me", wallet.address] });
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openWorldId = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const ctx = await api.worldRequest(wallet.address!);
      setRpContext(ctx);
      setWidgetOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (wallet.status !== "ready") {
    return (
      <Dialog open onClose={() => navigate("/")} title="Verify to create">
        <p className="text-[14px] text-muted-fg">Connect a wallet first. Creators are wallets with a World ID behind them.</p>
        <Button variant="chain" onClick={wallet.openSheet}>
          Connect wallet
        </Button>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={() => navigate("/")} title="Verify to create">
      <ol className="flex gap-2 text-[12px]">
        {["Why", "World ID", "Done"].map((label, i) => (
          <li key={label} className={cn("rounded-pill px-3 py-1", step === i + 1 ? "bg-fg text-bg" : "bg-surface-2 text-muted-fg")}>
            {label}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <>
          <p className="text-[14px] text-muted-fg">
            One human, one creator account: the World ID nullifier is stored with a unique index, so the same person cannot open creator accounts with different wallets.
          </p>
          <label className="grid gap-1 text-[13px]">
            Handle
            <input value={handle} onChange={e => setHandle(e.target.value)} placeholder="ledgerlab" className={input} />
          </label>
          <label className="grid gap-1 text-[13px]">
            Display name
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Ledger Lab" className={input} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate("/")}>
              Not now
            </Button>
            <Button variant="primary" onClick={() => setStep(2)} disabled={!handle.trim()}>
              Continue
            </Button>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          {WORLD_APP_ID ? (
            <>
              <Button variant="primary" onClick={() => void openWorldId()} loading={busy}>
                Verify with World ID
              </Button>
              {rpContext ? (
                <IDKitRequestWidget
                  app_id={WORLD_APP_ID as `app_${string}`}
                  action={WORLD_ACTION}
                  rp_context={rpContext}
                  preset={proofOfHuman({ signal: wallet.address })}
                  allow_legacy_proofs={true}
                  open={widgetOpen}
                  onOpenChange={setWidgetOpen}
                  onSuccess={(result: IDKitResult) => void submit(result)}
                  onError={code => setError(`World ID: ${code}`)}
                />
              ) : null}
            </>
          ) : (
            <p className="text-[14px] text-muted-fg">
              World ID is not configured (`VITE_WORLD_APP_ID`). Standard IDKit ships with the app id; Selfie Check is roadmap.
            </p>
          )}
          {API_MODE === "mock" ? (
            <Button
              variant={WORLD_APP_ID ? "outline" : "primary"}
              loading={busy}
              onClick={() => void submit({ nullifier_hash: keccak256(toBytes(`sim:${wallet.address!.toLowerCase()}`)), simulated: true })}
            >
              Simulate verification (dev)
            </Button>
          ) : null}
          {error ? <div className="rounded-md bg-destructive/12 p-3 text-[13px] text-destructive">{error}</div> : null}
          <Button variant="ghost" onClick={() => setStep(1)} className="justify-self-start">
            Back
          </Button>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <p className="text-[14px]">You are verified. Upload your first video and set its price.</p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => navigate("/upload")}>
              Go to upload
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
