import type { RefObject } from "react";
import { ArrowsIn, ArrowsOut, Pause, Play, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { Amount, cn } from "@/design/ui";
import { useEngine } from "@/payments/sessionMachine";
import { formatClock } from "@/lib/price";
import type { Video } from "@/api/types";

/**
 * YouTube-style control bar overlaid on the player: red = playback progress; money lives in the
 * Chain "used" pill (its dot is the only looping motion). Numbers change without animation.
 */
export function PlayerControls({
  video,
  mediaRef,
  visible,
  muted,
  fullscreen,
  paused,
  onTogglePlay,
  onToggleMute,
  onToggleFullscreen,
}: {
  video: Video;
  mediaRef: RefObject<HTMLVideoElement | null>;
  visible: boolean;
  muted: boolean;
  fullscreen: boolean;
  paused: boolean;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
}) {
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
  const active = playing || status === "closing" || status === "closed";

  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / duration) * 100)).toFixed(2)}%`;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const m = mediaRef.current;
    if (!m || !playing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    m.currentTime = Math.min(duration, Math.max(0, ((e.clientX - rect.left) / rect.width) * duration));
  };
  const chunkLabel = Math.min(chunks, active || paidChunks.length ? activeChunk + 1 : 0);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 grid gap-2 bg-gradient-to-t from-black/50 to-transparent px-2 pb-2 pt-8 text-white sm:px-3 sm:pb-3 transition-opacity duration-[180ms] ease-ht",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={stop}
      onDoubleClick={stop}
    >
      {/* scrubber = chunk meter: red is playback, Chain is money */}
      <div className="group/track relative cursor-pointer py-2" onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={currentTime}>
        <div className={cn("relative h-1 rounded-pill transition-[height] duration-[180ms] ease-ht group-hover/track:h-[5px]", interrupted ? "bg-destructive/40" : "bg-white/25")}>
          <div className="absolute inset-y-0 left-0 rounded-pill bg-white/40" style={{ width: pct(bufferedEnd) }} />
          <div className="absolute inset-y-0 left-0 rounded-pill bg-primary" style={{ width: pct(currentTime) }} />
          <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-primary" style={{ left: pct(currentTime) }} />
        </div>
      </div>

      {/* One row at every width: below sm the pills shrink and the price drops out of the counter. */}
      <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap sm:gap-2">
        <span className="inline-flex h-10 shrink-0 items-center rounded-pill bg-black/50 px-0.5 backdrop-blur-sm sm:h-12 sm:px-1">
          <button type="button" onClick={onTogglePlay} disabled={!playing} aria-label={paused ? "Play" : "Pause"} className="grid size-9 place-items-center rounded-pill hover:bg-white/15 disabled:opacity-50 sm:size-10">
            {paused ? <Play size={20} weight="fill" className="sm:size-[22px]" /> : <Pause size={20} weight="fill" className="sm:size-[22px]" />}
          </button>
          <button type="button" onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"} className="grid size-9 max-[359px]:hidden place-items-center rounded-pill hover:bg-white/15 sm:size-10">
            {muted ? <SpeakerSlash size={20} className="sm:size-[22px]" /> : <SpeakerHigh size={20} className="sm:size-[22px]" />}
          </button>
        </span>
        <span className="inline-flex h-10 shrink-0 items-center rounded-pill bg-black/50 px-3 text-[12px] font-medium tabular backdrop-blur-sm sm:h-12 sm:px-4 sm:text-[14px]">
          {formatClock(currentTime)} / {formatClock(duration)}
        </span>
        <span className="ml-auto inline-flex h-10 shrink-0 items-center gap-1 rounded-pill bg-black/50 pl-1 pr-0.5 backdrop-blur-sm sm:h-12 sm:pl-4 sm:pr-1">
          <span className="hidden text-[12px] tabular text-white/80 md:inline">
            chunk {chunkLabel} / {chunks}
            {free > 0 ? ` · ${free} free` : ""}
          </span>
          <span
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-pill px-2.5 text-[12px] font-medium tabular sm:mx-2 sm:gap-2 sm:px-3",
              interrupted ? "bg-destructive/40 text-white" : "bg-chain/35 text-white",
            )}
          >
            <span className={cn("size-[7px] shrink-0 rounded-pill", interrupted ? "bg-destructive" : "bg-chain", playing && !interrupted && "animate-chunk-tick")} />
            <span className="inline-flex items-center gap-1">
              <Amount value={charged} unit={false} />
              <span className="hidden items-center gap-1 sm:inline-flex">
                of <Amount value={price} />
              </span>
              <span className="max-[399px]:hidden">used</span>
            </span>
          </span>
          <button type="button" onClick={onToggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} className="grid size-9 place-items-center rounded-pill hover:bg-white/15 sm:size-10">
            {fullscreen ? <ArrowsIn size={20} className="sm:size-[22px]" /> : <ArrowsOut size={20} className="sm:size-[22px]" />}
          </button>
        </span>
      </div>
    </div>
  );
}
