import { useReceipts } from "@/payments/receipts";
import { ReceiptCard } from "./ReceiptCard";

/** Bottom-right, route-independent, at most three visible, user-dismissed. */
export function ReceiptStack() {
  const { receipts } = useReceipts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-30 grid gap-3">
      {receipts.slice(0, 3).map(receipt => (
        <div key={receipt.sessionId} className="pointer-events-auto">
          <ReceiptCard receipt={receipt} />
        </div>
      ))}
    </div>
  );
}
