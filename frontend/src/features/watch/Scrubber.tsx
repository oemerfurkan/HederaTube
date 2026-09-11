import { useMemo, type RefObject } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { Amount, cn } from "@/design/ui";
import { useEngine } from "@/payments/sessionMachine";
import { formatClock } from "@/lib/price";
import type { Video } from "@/api/types";

/**
 * The chunk meter lives in the scrubber (guide §6.4): buffer (muted 30 %), playback progress
 * (Signal), consumed strip (Chain, 3 px below), 7 px ticks on chunk boundaries. The active chunk
 * pulses — the only loop in the product. Numbers change without animation.
 */
export function Scrubber({ video, mediaRef }: { video: Video; mediaRef: RefObject<HTMLVideoElement | null> }) {
  const status = useEngine(s => s.status);
  const currentTime = useEngine(s => s.currentTime);
  const bufferedEnd = useEngine(s => s.bufferedEnd);
  const paidChunks = useEngine(s => s.paidChunks);
  const activeChunk = useEngine(s => s.activeChunk);
  const charged = useEngine(s => s.chargedCumulative);
  const duration = video.duration_seconds;
  const chunks = video.chunk_count;
  const free = video.free_preview_chunks;
  const price = BigInt(video.total_price);
  const playing = status === "preview" || status === "streaming";
  const interrupted = status === "interrupted";

  const consumedEnd = useMemo(() => {
    const paidMax = paidChunks.length ? Math.max(...paidChunks) + 1 : 0;
    const freeMax = playing || status === "closing" || status === "closed" ? Math.min(free, activeChunk + 1) : 0;
    return (Math.max(paidMax, freeMax) * 5) / duration;
  }, [paidChunks, free, activeChunk, playing, status, duration]);

  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / duration) * 100)).toFixed(2)}%`;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const m = mediaRef.current;
    if (!m || !playing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    m.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };
  const toggle = () => {
    const m = mediaRef.current;
    if (!m || !playing) return;
    if (m.paused) void m.play();
    else m.pause();
  };
  const paused = mediaRef.current?.paused ?? true;

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={!playing}
          aria-label={paused ? "Play" : "Pause"}
          className="grid size-9 shrink-0 place-items-center rounded-pill bg-primary text-white disabled:bg-secondary disabled:text-muted-fg"
        >
          {paused ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}
        </button>
        <div className="relative flex-1 py-3" onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={currentTime}>
          {/* ticks */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-3">
            {Array.from({ length: chunks + 1 }, (_, i) => {
              const chunkIndex = Math.min(i, chunks - 1);
              const consumed = paidChunks.includes(chunkIndex) || (chunkIndex < free && (playing || status === "closing" || status === "closed") && chunkIndex <= activeChunk);
              const isActive = playing && chunkIndex === activeChunk && i < chunks;
              const isFree = chunkIndex < free;
              return (
                <span
                  key={i}
                  className={cn(
                    "absolute top-0 size-[7px] -translate-x-1/2 rounded-pill",
                    consumed ? (isFree ? "bg-muted-fg" : "bg-chain") : "bg-border",
                    isActive && (interrupted ? "bg-destructive" : "animate-chunk-tick"),
                    isActive && !consumed && !interrupted && "bg-chain",
                  )}
                  style={{ left: `${(i / chunks) * 100}%` }}
                />
              );
            })}
          </div>
          {/* track */}
          <div className={cn("relative h-1.5 rounded-pill", interrupted ? "bg-destructive/40" : "bg-border")}>
            <div className="absolute inset-y-0 left-0 rounded-pill bg-muted-fg/30" style={{ width: pct(bufferedEnd) }} />
            <div className="absolute inset-y-0 left-0 rounded-pill bg-primary" style={{ width: pct(currentTime) }} />
            <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-primary" style={{ left: pct(currentTime) }} />
          </div>
          {/* consumed strip */}
          <div className="relative mt-1 h-[3px] rounded-pill">
            <div className={cn("absolute inset-y-0 left-0 rounded-pill", interrupted ? "bg-destructive" : "bg-chain")} style={{ width: `${(consumedEnd * 100).toFixed(2)}%` }} />
          </div>
        </div>
        <span className="w-[92px] shrink-0 text-right text-small tabular text-muted-fg">
          {formatClock(currentTime)} / {formatClock(duration)}
        </span>
      </div>
      <div className="flex items-center justify-between text-small">
        <span className="tabular" data-flip-id={`price-${video.id}`}>
          <Amount value={charged} unit={null} className="font-medium text-chain-fg" /> of <Amount value={price} /> used
        </span>
        <span className="tabular text-muted-fg">
          chunk {Math.min(chunks, playing || paidChunks.length ? activeChunk + 1 : 0)} / {chunks}
          {free > 0 ? ` · ${free} free` : ""}
        </span>
      </div>
    </div>
  );
}
