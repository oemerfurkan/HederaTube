import { cn } from "./cn";

/**
 * The HederaTube mark: an H whose crossbar is a play chevron. One shape, drawn once, used
 * everywhere. Stems take the current text color; the chevron is Signal red in the two-tone form.
 * Geometry from the logo spec: stems 16 wide, chevron arms 11, tip landing on the right stem, on
 * a 100-unit grid cropped to the 72 × 80 mark.
 */
export const MARK_VIEWBOX = "14 10 72 80";
export const MARK_STEMS = [
  { x: 14, y: 10, width: 16, height: 80 },
  { x: 70, y: 10, width: 16, height: 80 },
] as const;
export const MARK_CHEVRON = "M30 29 L70 50 L30 71 L30 58.5 L46.5 50 L30 41.5 Z";

export function Mark({
  height = 20,
  tone = "two-tone",
  className,
  title = "HederaTube",
}: {
  /** Rendered height in px; the width follows the 72:80 ratio. */
  height?: number;
  /** `two-tone`: Signal chevron. `mono`: everything in the current color. */
  tone?: "two-tone" | "mono";
  className?: string;
  title?: string;
}) {
  const width = Math.round((height * 72) / 80);
  return (
    <svg viewBox={MARK_VIEWBOX} width={width} height={height} role="img" aria-label={title} className={cn("shrink-0", className)}>
      {MARK_STEMS.map(s => (
        <rect key={s.x} {...s} fill="currentColor" />
      ))}
      <path d={MARK_CHEVRON} fill={tone === "two-tone" ? "var(--primary)" : "currentColor"} />
    </svg>
  );
}
