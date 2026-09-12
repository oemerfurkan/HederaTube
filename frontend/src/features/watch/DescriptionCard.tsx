import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/design/ui";
import type { Video } from "@/api/types";

/**
 * Two lines of description are free. Whether the rest is hidden depends on the real overflow at this
 * width, not on a character count, so Show more never appears with nothing behind it.
 */
export function DescriptionCard({ video }: { video: Video }) {
  const [open, setOpen] = useState(false);
  const [foldable, setFoldable] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const text = video.description ?? "";

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || open) return;
    const measure = () => setFoldable(el.scrollHeight - el.clientHeight > 1);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, open]);

  const toggle = () => setOpen(v => !v);

  return (
    <div
      role={foldable ? "button" : undefined}
      tabIndex={foldable ? 0 : undefined}
      onClick={foldable ? toggle : undefined}
      onKeyDown={
        foldable
          ? e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle();
              }
            }
          : undefined
      }
      className={cn("grid w-full gap-1 rounded-md bg-surface-2 p-3 text-left", foldable && "cursor-pointer")}
    >
      <div className="text-[14px] font-medium tabular">
        {video.views.toLocaleString()} views · {new Date(video.created_at).toLocaleDateString()}
      </div>
      <p ref={bodyRef} className={cn("whitespace-pre-line text-[14px] leading-5", !open && "line-clamp-2")}>
        {text}
      </p>
      {foldable ? <span className="text-[14px] font-medium">{open ? "Show less" : "Show more"}</span> : null}
    </div>
  );
}
