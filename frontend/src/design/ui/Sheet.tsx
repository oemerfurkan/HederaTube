import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gsap, EASE, DURATION, prefersReducedMotion } from "@/design/motion";
import { cn } from "./cn";

export type SheetVariant = "sheet" | "popover";

/**
 * `sheet`: right-hand panel, 400 px, card corner on the left, dimmed page.
 * `popover`: the same 400 px anchored under the header's right edge, sized to its content and
 * without a dim, the way an account menu drops from an avatar.
 */
export function Sheet({
  open,
  onClose,
  children,
  variant = "sheet",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: SheetVariant;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const popover = variant === "popover";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // The popover enters with a CSS animation: a tween needs animation frames, which a background
  // tab withholds, and a half-faded menu is worse than no motion at all.
  useLayoutEffect(() => {
    if (!open || !panel.current || popover) return;
    const reduced = prefersReducedMotion();
    gsap.fromTo(
      panel.current,
      reduced ? { opacity: 0 } : { x: 40, opacity: 0 },
      { x: 0, opacity: 1, duration: reduced ? DURATION.reduced : DURATION.route, ease: EASE },
    );
  }, [open, popover]);

  if (!open) return null;
  return createPortal(
    <div className={cn("fixed inset-0 z-40", popover ? "bg-transparent" : "bg-black/50")} onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal
        className={cn(
          "absolute overflow-y-auto bg-surface shadow-2",
          popover
            ? "right-4 top-16 max-h-[calc(100vh-80px)] w-[calc(100vw-32px)] max-w-[400px] animate-pop-in rounded-card border border-border p-5 motion-reduce:animate-none"
            : "inset-y-0 right-0 w-full max-w-[400px] rounded-l-card p-7",
        )}
        onMouseDown={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
