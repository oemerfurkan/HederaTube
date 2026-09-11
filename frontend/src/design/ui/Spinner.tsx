import { cn } from "./cn";

/** 700 ms spin; the only motion besides the chunk tick that is allowed to loop. */
export function Spinner({ className, tone = "current" }: { className?: string; tone?: "current" | "chain" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block rounded-pill border-2 animate-spin-ht",
        tone === "chain" ? "border-border border-t-chain" : "border-current/30 border-t-current",
        className ?? "size-4",
      )}
    />
  );
}
