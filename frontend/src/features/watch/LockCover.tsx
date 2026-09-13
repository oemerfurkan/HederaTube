import { useEffect, useState } from "react";
import { Play } from "@phosphor-icons/react";
import { UsdcMark, cn } from "@/design/ui";
import { engine, useEngine } from "@/payments/sessionMachine";
import { useWallet } from "@/features/wallet/WalletProvider";
import { formatUsdc } from "@/lib/money";
import type { Video } from "@/api/types";

/**
 * One translucent play circle over the poster, though anywhere on the cover starts the video.
 * The press connects, deposits or locks, whichever this viewer still needs, and the circle spins
 * until the lock is on chain and playback takes over.
 */
export function LockCover({ video }: { video: Video }) {
  const engineStatus = useEngine(s => s.status);
  const engineError = useEngine(s => s.error);
  const engineVideoId = useEngine(s => s.session?.videoId ?? s.video?.id);
  const wallet = useWallet();
  const [gone, setGone] = useState(false);
  // Until the engine has been handed this video (the previous one may still be refunding), show a
  // spinner and ignore presses instead of the old video's state.
  const switching = engineVideoId !== video.id;
  const status = switching ? "locking" : engineStatus;
  const error = switching ? undefined : engineError;
  const covering = status === "idle" || status === "insufficient" || status === "locking";

  // a plain CSS fade: it still runs when the tab is not painting frames, unlike a tweened one
  useEffect(() => {
    if (covering) setGone(false);
  }, [covering]);

  if (gone) return null;
  const price = BigInt(video.total_price);
  const connected = wallet.status === "ready";
  const busy = status === "locking" || wallet.status === "connecting" || wallet.status === "onboarding";
  const label = !connected ? "Connect a wallet to watch" : status === "insufficient" ? "Add funds to watch" : "Play";

  const onPress = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!connected || status === "insufficient") {
      wallet.openSheet();
      return;
    }
    void engine.lock().catch(() => undefined);
  };

  return (
    <div
      onClick={onPress}
      onTransitionEnd={() => {
        if (!covering) setGone(true);
      }}
      className={cn(
        "absolute inset-0 grid place-items-center bg-black/55 transition-opacity duration-300 ease-ht",
        covering ? "cursor-pointer opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="grid justify-items-center gap-3 px-6 text-center">
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={onPress}
          className="grid size-[128px] place-items-center rounded-pill bg-black/60 text-white backdrop-blur-sm transition-colors duration-[180ms] ease-ht hover:bg-black/50 active:bg-black/40"
        >
          {busy ? (
            <span className="size-16 animate-spin-ht rounded-pill border-4 border-white/25 border-t-white" />
          ) : (
            <Play size={56} weight="fill" className="translate-x-[3px]" />
          )}
        </button>
        {/* only the states the viewer has to fix say anything at all */}
        {status === "insufficient" ? (
          <div className="flex items-center gap-1 text-[14px] leading-5 text-white/80">
            You need {formatUsdc(price)} <UsdcMark size={13} /> for this video
          </div>
        ) : null}
        {error ? <div className="max-w-[420px] text-[14px] leading-5 text-destructive">{error}</div> : null}
      </div>
    </div>
  );
}
