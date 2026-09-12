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
        "absolute inset-x-0 bottom-0 grid gap-2 bg-gradient-to-t from-black/50 to-transparent px-3 pb-3 pt-8 text-white transition-opacity duration-[180ms] ease-ht",
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

      <div className="flex items-center gap-2">
        <span className="inline-flex h-12 items-center rounded-pill bg-black/50 px-1 backdrop-blur-sm">
          <button type="button" onClick={onTogglePlay} disabled={!playing} aria-label={paused ? "Play" : "Pause"} className="grid size-10 place-items-center rounded-pill hover:bg-white/15 disabled:opacity-50">
            {paused ? <Play size={22} weight="fill" /> : <Pause size={22} weight="fill" />}
          </button>
          <button type="button" onClick={onToggleMute} aria-label={muted ? "Unmute" : "Mute"} className="grid size-10 place-items-center rounded-pill hover:bg-white/15">
            {muted ? <SpeakerSlash size={22} /> : <SpeakerHigh size={22} />}
          </button>
        </span>
        <span className="inline-flex h-12 items-center rounded-pill bg-black/50 px-4 text-[14px] font-medium tabular backdrop-blur-sm">
          {formatClock(currentTime)} / {formatClock(duration)}
        </span>
        <span className="ml-auto inline-flex h-12 items-center gap-1 rounded-pill bg-black/50 pl-4 pr-1 backdrop-blur-sm">
          <span className="hidden text-[12px] tabular text-white/80 sm:inline">
            chunk {chunkLabel} / {chunks}
            {free > 0 ? ` · ${free} free` : ""}
          </span>
          <span className={cn("mx-2 inline-flex h-8 items-center gap-2 rounded-pill px-3 text-[12px] font-medium tabular", interrupted ? "bg-destructive/40 text-white" : "bg-chain/35 text-white")}>
            <span className={cn("size-[7px] rounded-pill", interrupted ? "bg-destructive" : "bg-chain", playing && !interrupted && "animate-chunk-tick")} />
            <span>
              <Amount value={charged} unit={false} /> of <Amount value={price} /> used
            </span>
          </span>
          <button type="button" onClick={onToggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} className="grid size-10 place-items-center rounded-pill hover:bg-white/15">
            {fullscreen ? <ArrowsIn size={22} /> : <ArrowsOut size={22} />}
          </button>
        </span>
      </div>
    </div>
  );
}
