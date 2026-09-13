import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ClockCounterClockwise, MagnifyingGlass, X } from "@phosphor-icons/react";
import { cn } from "@/design/ui";

const KEY = "ht:search-history";
const MAX = 12;

/** Search history lives only in this browser; a blocked or cleared store degrades to "no history". */
function readHistory(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function writeHistory(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* private window, or storage disabled */
  }
}

/**
 * YouTube's header search: up to 536 px at rest, 632 px while focused, with the leading glass and the
 * recent-search list appearing on focus. Picking a row runs it; the × forgets it.
 */
export function SearchBar() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setHistory(readHistory()), []);

  // clicking anywhere else closes the list, exactly like the real header
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!form.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const needle = value.trim().toLowerCase();
  const matches = history.filter(h => !needle || h.toLowerCase().includes(needle));

  const run = (term: string) => {
    const q = term.trim();
    setValue(q);
    setOpen(false);
    setActive(-1);
    input.current?.blur();
    if (q) {
      const next = [q, ...history.filter(h => h.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
      setHistory(next);
      writeHistory(next);
    }
    navigate(q ? `/?q=${encodeURIComponent(q)}` : "/");
  };

  const forget = (term: string) => {
    const next = history.filter(h => h !== term);
    setHistory(next);
    writeHistory(next);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!matches.length) return;
      e.preventDefault();
      setOpen(true);
      // -1 is "the typed text"; stepping past either end returns to it
      setActive(prev => (e.key === "ArrowDown" ? (prev + 1 >= matches.length ? -1 : prev + 1) : prev <= -1 ? matches.length - 1 : prev - 1));
    }
  };

  return (
    <form
      ref={form}
      onSubmit={e => {
        e.preventDefault();
        run(active >= 0 && matches[active] ? matches[active] : value);
      }}
      // Centred over the page only when the header is wide enough to never reach the brand or the
      // wallet controls; narrower (tablets, phones on their side) it joins the row and shrinks.
      className={cn(
        "relative mx-auto hidden min-w-0 flex-1 transition-[width,max-width] duration-200 ease-ht md:flex xl:absolute xl:left-1/2 xl:mx-0 xl:max-w-none xl:flex-none xl:-translate-x-1/2",
        open ? "max-w-[632px] xl:w-[632px]" : "max-w-[536px] xl:w-[536px]",
      )}
    >
      <div
        className={cn(
          "flex h-10 min-w-0 flex-1 items-center gap-3 rounded-l-pill border pl-4 pr-3 transition-colors duration-[180ms] ease-ht",
          open ? "border-muted-fg/70 bg-bg" : "border-input bg-surface-2/40",
        )}
      >
        {open ? <MagnifyingGlass size={20} className="shrink-0 text-muted-fg" /> : null}
        <input
          ref={input}
          name="q"
          autoComplete="off"
          placeholder="Search"
          value={value}
          onChange={e => {
            setValue(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-muted-fg"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setValue("");
              input.current?.focus();
            }}
            className="grid size-7 shrink-0 place-items-center rounded-pill text-muted-fg transition-colors duration-[180ms] ease-ht hover:text-fg"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>
      <button
        type="submit"
        aria-label="Search"
        className="grid h-10 w-16 shrink-0 place-items-center rounded-r-pill border border-l-0 border-input bg-surface-2 text-muted-fg transition-colors duration-[180ms] ease-ht hover:text-fg"
      >
        <MagnifyingGlass size={20} />
      </button>

      {open && matches.length ? (
        <ul className="absolute left-0 top-[calc(100%+8px)] z-50 w-[calc(100%-64px)] overflow-hidden rounded-md border border-border bg-surface p-2 shadow-2">
          {matches.map((term, i) => (
            <li
              key={term}
              className={cn("group flex items-center rounded-sm", active === i && "bg-surface-2")}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(-1)}
            >
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => run(term)}
                className="flex min-w-0 flex-1 items-center gap-4 px-3 py-2 text-left text-[14px] font-medium"
              >
                <ClockCounterClockwise size={20} className="shrink-0 text-muted-fg" />
                <span className="truncate">{term}</span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${term} from search history`}
                onMouseDown={e => e.preventDefault()}
                onClick={() => forget(term)}
                className="mr-1 grid size-7 shrink-0 place-items-center rounded-pill text-muted-fg opacity-0 transition-opacity duration-[180ms] ease-ht hover:text-fg group-hover:opacity-100"
              >
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
