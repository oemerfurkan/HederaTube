import { User } from "@phosphor-icons/react";
import { cn } from "./cn";

/**
 * Design system avatar: a pill-radius surface-2 circle with the Phosphor user glyph in muted-fg.
 * Sizes follow the DS scale (28 / 36 / 48); the glyph is half the circle.
 */
export function Avatar({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-pill bg-surface-2 text-muted-fg", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <User size={Math.round(size * 0.5)} />
    </span>
  );
}
