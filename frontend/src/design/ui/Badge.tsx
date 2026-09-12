import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "settled" | "streaming" | "free" | "live" | "pending" | "neutral" | "destructive";

const tones: Record<BadgeTone, string> = {
  settled: "bg-positive/15 text-positive-fg",
  streaming: "bg-chain-soft text-chain-fg",
  free: "bg-surface-2 text-muted-fg",
  live: "bg-primary text-white",
  pending: "bg-chain-soft text-chain-fg",
  neutral: "border border-border text-fg",
  destructive: "bg-destructive/12 text-destructive",
};

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 rounded-pill px-3 text-[12px] font-medium transition-colors duration-[180ms] ease-ht",
        tones[tone],
        className,
      )}
    >
      {tone === "live" ? <span className="size-1.5 rounded-pill bg-white" /> : null}
      {children}
    </span>
  );
}
