import { cn } from "./cn";

/**
 * USDC brand mark; stands in for the written "USDC" label next to every amount.
 * Scales with the surrounding font size unless an explicit pixel size is given.
 */
export function UsdcMark({ size, className }: { size?: number; className?: string }) {
  const box = size ? `${size}px` : "1em";
  return (
    <img
      src="/usdc.svg"
      alt="USDC"
      className={cn("inline-block shrink-0 align-[-0.12em]", className)}
      style={{ width: box, height: box }}
      loading="lazy"
      decoding="async"
    />
  );
}
