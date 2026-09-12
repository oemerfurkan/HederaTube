import { useLayoutEffect, useRef, type ReactNode } from "react";
import { gsap, EASE, DURATION, prefersReducedMotion } from "@/design/motion";

/** Route transition: 240 ms fade + slight rise (120 ms fade under reduced motion). */
export function RouteTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const reduced = prefersReducedMotion();
    const tween = gsap.fromTo(
      ref.current,
      reduced ? { opacity: 0 } : { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: reduced ? DURATION.reduced : DURATION.route, ease: EASE, clearProps: "transform" },
    );
    return () => {
      tween.kill();
    };
  }, [routeKey]);
  return (
    <div ref={ref} className="mx-auto w-full max-w-[2100px]">
      {children}
    </div>
  );
}
