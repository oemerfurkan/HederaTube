import { useCallback, useEffect, useState } from "react";
import { Amount, Button } from "@/design/ui";
import { channelMeta, type ChannelMeta } from "@/payments/channelStorage";
import { createSessionPaymentClient } from "@/payments/x402Client";
import { engine, useEngine } from "@/payments/sessionMachine";
import { useWallet } from "./WalletProvider";

/** Deposits still held by open channels. Release refunds one without reopening the video. */
export function ActiveLocks() {
  const wallet = useWallet();
  const [locks, setLocks] = useState<ChannelMeta[]>([]);
  const [busy, setBusy] = useState<string>();
  const currentSession = useEngine(s => s.session?.sessionId);
  const status = useEngine(s => s.status);

  const refresh = useCallback(() => {
    if (!wallet.address) return;
    channelMeta.listActive(wallet.address).then(setLocks).catch(() => setLocks([]));
  }, [wallet.address]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [refresh, status]);

  const release = async (lock: ChannelMeta) => {
    if (!wallet.signer) return;
    setBusy(lock.sessionId);
    try {
      if (lock.sessionId === currentSession) {
        await engine.close("release");
      } else {
        const payment = createSessionPaymentClient({
          signer: wallet.signer,
          session: { sessionId: lock.sessionId, price: BigInt(lock.lockedAmount), pricedChunks: 1, closeUrl: lock.closeUrl },
        });
        await payment.scheme.refund(lock.closeUrl);
        await channelMeta.remove(wallet.address!, lock.channelId);
      }
      wallet.refreshBalance();
    } finally {
      setBusy(undefined);
      refresh();
    }
  };

  return (
    <section className="grid gap-2">
      <h3 className="label-caps text-muted-fg">Active locks</h3>
      {locks.length === 0 ? (
        <p className="text-small text-muted-fg">No funds are locked right now.</p>
      ) : (
        locks.map(lock => (
          <div key={lock.channelId} className="flex items-center gap-3 rounded-md bg-surface-2 px-3.5 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium">{lock.videoTitle}</div>
              <Amount value={lock.lockedAmount} className="text-[13px] text-chain-fg" />
            </div>
            <Button variant="link" size="sm" onClick={() => release(lock)} loading={busy === lock.sessionId} className="text-chain-fg">
              Release
            </Button>
          </div>
        ))
      )}
    </section>
  );
}
