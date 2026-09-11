import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gsap, EASE, DURATION, prefersReducedMotion } from "@/design/motion";

/** Right sheet, 400 px, card corner on the left, shadow-2. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const reduced = prefersReducedMotion();
    gsap.fromTo(
      panel.current,
      reduced ? { opacity: 0 } : { x: 40, opacity: 0 },
      { x: 0, opacity: 1, duration: reduced ? DURATION.reduced : DURATION.route, ease: EASE },
    );
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 bg-black/50" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal
        className="absolute inset-y-0 right-0 w-full max-w-[400px] overflow-y-auto rounded-l-card bg-surface p-6 shadow-2"
        onMouseDown={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
