import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { Receipt } from "./types";

type ReceiptsState = {
  receipts: Receipt[];
  push: (receipt: Receipt) => void;
  update: (sessionId: string, patch: Partial<Receipt>) => void;
  dismiss: (sessionId: string) => void;
};

/** Receipt cards are route-independent (guide §8): they live outside the router tree. */
export const receiptsStore = createStore<ReceiptsState>(set => ({
  receipts: [],
  push: receipt =>
    set(state => ({
      receipts: [receipt, ...state.receipts.filter(r => r.sessionId !== receipt.sessionId)],
    })),
  update: (sessionId, patch) =>
    set(state => ({
      receipts: state.receipts.map(r => (r.sessionId === sessionId ? { ...r, ...patch } : r)),
    })),
  dismiss: sessionId => set(state => ({ receipts: state.receipts.filter(r => r.sessionId !== sessionId) })),
}));

export function useReceipts(): ReceiptsState {
  return useStore(receiptsStore);
}
