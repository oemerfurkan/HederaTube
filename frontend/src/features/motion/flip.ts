import { Flip, EASE, DURATION, prefersReducedMotion } from "@/design/motion";

/**
 * Shared-element transitions (guide §4.2): thumbnail → player, price badge → meter label,
 * avatar → channel row. The source state is captured on card click, before the route changes;
 * the watch page plays it once its elements have mounted.
 */
let pending: { videoId: string; state: ReturnType<typeof Flip.getState> } | undefined;

export function rememberFlipSource(videoId: string): void {
  if (prefersReducedMotion()) return;
  const targets = document.querySelectorAll(`[data-flip-id="player-${videoId}"], [data-flip-id="price-${videoId}"], [data-flip-id="avatar-${videoId}"]`);
  if (!targets.length) return;
  pending = { videoId, state: Flip.getState(targets) };
}

export function playFlipInto(videoId: string): void {
  if (!pending || pending.videoId !== videoId) return;
  const state = pending.state;
  pending = undefined;
  requestAnimationFrame(() => {
    Flip.from(state, { duration: DURATION.shared, ease: EASE, absolute: true, scale: true, nested: true });
  });
}
