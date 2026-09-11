import { cn } from "@/design/ui";

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "hedera", label: "Hedera" },
  { id: "live", label: "Live" },
  { id: "free", label: "Free chunks" },
] as const;
export type FilterId = (typeof FILTERS)[number]["id"];

export function FilterChips({ value, onChange }: { value: FilterId; onChange: (next: FilterId) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map(f => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          className={cn(
            "h-8 rounded-pill px-3.5 text-[13px] transition-colors duration-[180ms] ease-ht",
            value === f.id ? "bg-fg font-medium text-bg" : "bg-surface-2 text-fg hover:brightness-[0.96]",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
