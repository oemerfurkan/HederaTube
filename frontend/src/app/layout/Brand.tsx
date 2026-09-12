import { Link } from "react-router";
import { Play } from "@phosphor-icons/react";
import { cn } from "@/design/ui";

/** The wordmark, shared by the header and the overlay drawer so both read identically. */
export function Brand({ onClick, className }: { onClick?: () => void; className?: string }) {
  return (
    <Link to="/" onClick={onClick} className={cn("flex shrink-0 items-center gap-2 font-bold tracking-[-0.02em]", className)}>
      <span className="grid h-[22px] w-[31px] place-items-center rounded-sm bg-primary text-white">
        <Play size={12} weight="fill" />
      </span>
      <span className="hidden sm:inline">HederaTube</span>
    </Link>
  );
}
