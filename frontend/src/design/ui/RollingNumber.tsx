import { useEffect, useState } from "react";
import { cn } from "./cn";

/** A counter that rolls: the new value rises from below when it grows, drops in from above when it shrinks. */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const [state, setState] = useState<{ current: number; leaving: number | null; up: boolean }>({ current: value, leaving: null, up: true });

  useEffect(() => {
    setState(s => (s.current === value ? s : { current: value, leaving: s.current, up: value > s.current }));
  }, [value]);

  const { current, leaving, up } = state;
  return (
    <span className={cn("relative inline-grid overflow-hidden align-middle tabular", className)}>
      <span key={current} className={cn("[grid-area:1/1]", leaving !== null && (up ? "animate-roll-up-in" : "animate-roll-down-in"))}>
        {current.toLocaleString()}
      </span>
      {leaving !== null ? (
        <span
          key={`leaving-${leaving}`}
          aria-hidden
          className={cn("[grid-area:1/1]", up ? "animate-roll-up-out" : "animate-roll-down-out")}
          onAnimationEnd={() => setState(s => ({ ...s, leaving: null }))}
        >
          {leaving.toLocaleString()}
        </span>
      ) : null}
    </span>
  );
}
