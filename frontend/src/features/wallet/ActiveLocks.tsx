import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Amount, Badge, Button, toast } from "@/design/ui";
import { loadActiveLocks, releaseLock, type ActiveLock } from "@/payments/locks";
import { engine, useEngine } from "@/payments/sessionMachine";
import { formatUsdc } from "@/lib/money";
import { useWallet } from "./WalletProvider";

/** Deposits still held by open channels, checked against the server. Release refunds one without reopening the video. */
export function ActiveLocks() {
  const wallet = useWallet();
  const [locks, setLocks] = useState<ActiveLock[]>();
  const [busy, setBusy] = useState<string>();
  const currentSession = useEngine(s => s.session?.sessionId);
  const status = useEngine(s => s.status);

  const refresh = useCallback(() => {
    if (!wallet.address) return;
    loadActiveLocks(wallet.address)
      .then(setLocks)
      .catch(() => setLocks([]));
  }, [wallet.address]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh, status]);

  const release = async (lock: ActiveLock) => {
    if (!wallet.signer) return;
    setBusy(lock.sessionId);
    try {
      if (lock.sessionId === currentSession) {
        await engine.close("release");
        toast(`Released ${formatUsdc(lock.lockedAmount)} USDC`);
      } else {
        const outcome = await releaseLock(wallet.signer, lock);
        toast(outcome.kind === "released" ? `Released ${formatUsdc(lock.lockedAmount)} USDC` : "Already refunded on chain");
      }
      wallet.refreshBalance();
    } catch (error) {
      toast(`Release failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(undefined);
      refresh();
    }
  };

  return (
    <section className="grid gap-3">
      <h2 className="label-caps text-muted-fg">Active locks</h2>
      {!locks ? (
        <p className="text-[14px] leading-5 text-muted-fg">Checking…</p>
      ) : locks.length === 0 ? (
        <p className="text-[14px] leading-5 text-muted-fg">No funds are locked right now.</p>
      ) : (
        <ul className="grid gap-1.5">
          {locks.map(lock => (
            <li key={lock.channelId} className="flex items-center gap-3 rounded-md bg-surface-2 py-2.5 pl-4 pr-2.5">
              <div className="min-w-0 flex-1">
                <Link to={`/watch/${lock.videoId}`} className="block truncate text-[14px] font-medium leading-5 hover:underline">
                  {lock.videoTitle}
                </Link>
                <Amount value={lock.lockedAmount} className="text-[12px] leading-[18px] text-chain-fg" />
              </div>
              <Badge tone={lock.status === "streaming" ? "streaming" : "pending"}>{lock.status === "streaming" ? "Streaming" : "Locked"}</Badge>
              <Button variant="outline" size="sm" onClick={() => release(lock)} loading={busy === lock.sessionId} disabled={!!busy}>
                Release
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
