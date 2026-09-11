import { cn } from "./cn";

/** Switch row: 48×28 pill track, Chain when on (a money setting). */
export function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-pill border border-border px-[18px] py-3.5">
      <span className="grid gap-0.5">
        <span className="text-[14px] font-medium">{label}</span>
        {help ? <span className="text-[12px] text-muted-fg">{help}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-[180ms] ease-ht",
          checked ? "bg-chain" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-[22px] rounded-pill shadow-1 transition-[left] duration-[180ms] ease-ht",
            checked ? "left-[23px] bg-chain-on" : "left-[3px] bg-white",
          )}
        />
      </button>
    </label>
  );
}
