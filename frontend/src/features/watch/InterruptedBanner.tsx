import { Button } from "@/design/ui";
import { engine, useEngine } from "@/payments/sessionMachine";
import { formatClock } from "@/lib/price";

/** Failure pauses, never charges: playback stops at the last paid second and says so plainly. */
export function InterruptedBanner() {
  const pausedAt = useEngine(s => s.pausedAt ?? s.currentTime);
  const error = useEngine(s => s.error);
  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 bg-destructive px-4 py-3 text-[14px] text-white">
      <span className="min-w-0 flex-1">
        Connection lost. Playback paused at {formatClock(pausedAt)}. Unwatched time will be refunded.
        {error ? <span className="block text-[12px] opacity-80">{error}</span> : null}
      </span>
      <Button variant="secondary" size="sm" onClick={() => engine.retry()}>
        Retry
      </Button>
    </div>
  );
}
