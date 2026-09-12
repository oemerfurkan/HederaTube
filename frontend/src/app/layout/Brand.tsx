import { Link } from "react-router";
import { Mark, cn } from "@/design/ui";

/**
 * Header lockup from the logo spec: the two-tone mark at 20 px beside the word spelled in full,
 * 19 px at 700 and -0.02em. Shared by the header and the overlay drawer so both read identically.
 */
export function Brand({ onClick, className }: { onClick?: () => void; className?: string }) {
  return (
    <Link to="/" onClick={onClick} className={cn("flex shrink-0 items-center gap-2.5 text-fg", className)}>
      <Mark height={20} />
      <span className="hidden text-[19px] font-bold leading-none tracking-[-0.02em] sm:inline">HederaTube</span>
    </Link>
  );
}
