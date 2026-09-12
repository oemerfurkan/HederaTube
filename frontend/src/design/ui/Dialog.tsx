import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

/** Dialog: card corner on surface with shadow-2 over rgba(0,0,0,0.6). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        className={cn("grid w-full max-w-[420px] gap-5 rounded-card bg-surface p-7 shadow-2", className)}
        onMouseDown={e => e.stopPropagation()}
      >
        {title ? <h2 className="text-[20px] font-bold tracking-[-0.01em]">{title}</h2> : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
