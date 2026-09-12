import { useLayoutEffect, useRef } from "react";
import type { Video } from "@/api/types";
import { VideoCard } from "./VideoCard";
import { Flip, EASE, DURATION, prefersReducedMotion } from "@/design/motion";

/** 16 px gutter, 280 px minimum, auto-fill. Reflows with Flip when the filter changes. */
export function VideoGrid({ videos, flipKey }: { videos: Video[]; flipKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastState = useRef<ReturnType<typeof Flip.getState> | undefined>(undefined);
  useLayoutEffect(() => {
    if (!ref.current) return;
    if (lastState.current && !prefersReducedMotion()) {
      Flip.from(lastState.current, { duration: DURATION.shared, ease: EASE, absolute: true, onEnter: els => els.length && ({ opacity: 0 } as unknown), fade: true });
    }
    lastState.current = Flip.getState(ref.current.querySelectorAll("[data-card]"));
  }, [flipKey, videos]);
  return (
    <div
      ref={ref}
      className="grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 [@media(min-width:2100px)]:grid-cols-4"
    >
      {videos.map(video => (
        <div key={video.id} data-card data-flip-id={`card-${video.id}`}>
          <VideoCard video={video} />
        </div>
      ))}
    </div>
  );
}
