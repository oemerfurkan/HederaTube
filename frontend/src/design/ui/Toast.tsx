import { useEffect } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { cn } from "./cn";

type Toast = { id: number; text: string };
type ToastState = { items: Toast[]; push: (text: string) => void; drop: (id: number) => void };

const store = createStore<ToastState>(set => ({
  items: [],
  push: text => set(s => ({ items: [...s.items, { id: Date.now() + Math.random(), text }].slice(-3) })),
  drop: id => set(s => ({ items: s.items.filter(t => t.id !== id) })),
}));

/** Fire-and-forget confirmation, bottom right. Never used for anything the user must act on. */
export function toast(text: string) {
  store.getState().push(text);
}

function Row({ item }: { item: Toast }) {
  useEffect(() => {
    const id = setTimeout(() => store.getState().drop(item.id), 1800);
    return () => clearTimeout(id);
  }, [item.id]);
  return (
    <div className={cn("animate-toast-in rounded-pill bg-surface-3 px-4 py-2 text-[13px] font-medium text-fg shadow-2")} role="status">
      {item.text}
    </div>
  );
}

export function Toaster() {
  const items = useStore(store, s => s.items);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 grid justify-items-end gap-2">
      {items.map(item => (
        <Row key={item.id} item={item} />
      ))}
    </div>
  );
}
