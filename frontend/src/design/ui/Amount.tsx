import { formatUsdc } from "@/lib/money";
import { cn } from "./cn";
import { UsdcMark } from "./UsdcMark";

/**
 * Every USDC figure: tabular-nums, four decimals, never animated digit by digit.
 * The USDC brand mark replaces the written unit (design rule: amounts read as money at a glance).
 */
export function Amount({
  value,
  unit = true,
  className,
  decimals = 4,
  markSize,
}: {
  value: bigint | string | number;
  /** Show the USDC mark after the figure. */
  unit?: boolean;
  className?: string;
  decimals?: number;
  markSize?: number;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 tabular", className)}>
      {formatUsdc(value, decimals)}
      {unit ? <UsdcMark {...(markSize ? { size: markSize } : {})} /> : null}
    </span>
  );
}
