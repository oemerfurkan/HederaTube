import { formatUsdc } from "@/lib/money";
import { cn } from "./cn";

/** Every USDC figure: tabular-nums, four decimals, never animated digit by digit. */
export function Amount({
  value,
  unit = "USDC",
  className,
  decimals = 4,
}: {
  value: bigint | string | number;
  unit?: string | null;
  className?: string;
  decimals?: number;
}) {
  return (
    <span className={cn("tabular", className)}>
      {formatUsdc(value, decimals)}
      {unit ? <span className="ml-1">{unit}</span> : null}
    </span>
  );
}
