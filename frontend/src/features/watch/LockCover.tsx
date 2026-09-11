import { useLayoutEffect, useRef, useState } from "react";
import { Lock } from "@phosphor-icons/react";
import { Amount, Button } from "@/design/ui";
import { gsap, EASE, DURATION } from "@/design/motion";
import { engine, useEngine } from "@/payments/sessionMachine";
import { useWallet } from "@/features/wallet/WalletProvider";
import { formatUsdc } from "@/lib/money";
import type { Video } from "@/api/types";

/** Guide §6.4: one button, one line. Insufficient balance is caught here, never mid-playback. */
export function LockCover({ video }: { video: Video }) {
  const status = useEngine(s => s.status);
  const error = useEngine(s => s.error);
  const wallet = useWallet();
  const ref = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  const covering = status === "idle" || status === "insufficient" || status === "locking";

  useLayoutEffect(() => {
    if (!ref.current) return;
    if (covering) {
      setGone(false);
      gsap.set(ref.current, { opacity: 1 });
      return;
    }
    const tween = gsap.to(ref.current, { opacity: 0, duration: DURATION.route, ease: EASE, onComplete: () => setGone(true) });
    return () => {
      tween.kill();
    };
  }, [covering]);

  if (gone) return null;
  const price = BigInt(video.total_price);
  const connected = wallet.status === "ready";
  return (
    <div ref={ref} className="absolute inset-0 grid place-items-center bg-ink/70 backdrop-blur-[2px]">
      <div className="grid justify-items-center gap-3 px-6 text-center">
        {!connected ? (
          <>
            <Button variant="chain" size="lg" onClick={wallet.openSheet} loading={wallet.status === "connecting" || wallet.status === "onboarding"}>
              Connect wallet to watch
            </Button>
            <div className="text-small text-[#AAAAAA]">
              This video costs <Amount value={price} /> for the full watch
            </div>
          </>
        ) : status === "insufficient" ? (
          <>
            <Button variant="chain" size="lg" onClick={wallet.openSheet}>
              Deposit to watch
            </Button>
            <div className="text-small text-[#AAAAAA]">You need {formatUsdc(price)} USDC for this video</div>
          </>
        ) : status === "locking" ? (
          <>
            <Button variant="chain" size="lg" loading disabled>
              Locking
            </Button>
            <div className="text-small text-[#AAAAAA]">Locking on Hedera…</div>
          </>
        ) : (
          <>
            <Button variant="chain" size="lg" onClick={() => void engine.lock().catch(() => undefined)}>
              <Lock size={18} />
              Lock {formatUsdc(price)} USDC and watch
            </Button>
            <div className="text-small text-[#AAAAAA]">Unwatched time is refunded</div>
            {error ? <div className="max-w-[420px] text-small text-destructive">{error}</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
