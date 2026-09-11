import type { ReactNode } from "react";
import { cn } from "./cn";

/** Tx hash / account id block: mono stack, sm corner, surface-2. */
export function Mono({ children, className, block = false }: { children: ReactNode; className?: string; block?: boolean }) {
  return (
    <span
      className={cn(
        "font-mono text-[12px] text-muted-fg",
        block && "block truncate rounded-sm bg-surface-2 px-3.5 py-3",
        className,
      )}
    >
      {children}
    </span>
  );
}
