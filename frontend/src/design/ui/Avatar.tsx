import { useEffect, useState } from "react";
import { User } from "@phosphor-icons/react";
import { cn } from "./cn";

/**
 * Design system avatar: a pill circle. With `src` it shows the channel photo cropped to fill;
 * without one, or when the image fails to load, the surface-2 circle with the Phosphor user glyph.
 */
export function Avatar({ size = 36, src, alt = "", className }: { size?: number; src?: string; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-pill bg-surface-2 object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
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
