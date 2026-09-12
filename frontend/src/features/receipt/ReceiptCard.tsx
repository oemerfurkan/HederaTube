import { useEffect, useLayoutEffect, useRef } from "react";
import { X, ArrowSquareOut } from "@phosphor-icons/react";
import { Amount, Badge } from "@/design/ui";
import { gsap, EASE, DURATION, prefersReducedMotion } from "@/design/motion";
import { useReceiptQuery } from "@/api/hooks";
import { useReceipts } from "@/payments/receipts";
import type { Receipt } from "@/payments/types";
import { hashscanTxUrl } from "@/lib/hedera";

/**
 * Guide §8. Phase one right after close: "Settling on Hedera" with the amounts as the client knows
 * them. Phase two when the batch confirms: "Settled". Paid is the hero line; Receipt opens the
 * transaction that moved the money. The card slides in, the digits never count.
 */
export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const { update, dismiss } = useReceipts();
  const ref = useRef<HTMLDivElement>(null);
  const query = useReceiptQuery(receipt.sessionId, receipt.phase !== "settled");

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    const patch: Partial<Receipt> = {
      watched: BigInt(data.watched),
      watchedChunks: data.chunks,
      toCreator: BigInt(data.toCreator),
      refunded: BigInt(data.refunded),
      refundTx: data.refundTx ?? receipt.refundTx,
    };
    if (data.status === "settled" && data.settlementTx) {
      patch.phase = "settled";
      patch.settlementTx = data.settlementTx;
    }
    update(receipt.sessionId, patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const reduced = prefersReducedMotion();
    gsap.fromTo(ref.current, reduced ? { opacity: 0 } : { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: reduced ? DURATION.reduced : DURATION.route, ease: EASE });
  }, []);

  const settled = receipt.phase === "settled";
  const tx = settled ? receipt.settlementTx : receipt.refundTx;
  return (
    <div ref={ref} className="grid w-[340px] max-w-[calc(100vw-32px)] grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden rounded-card bg-surface p-5 shadow-2 [&>*]:min-w-0">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={settled ? "settled" : "pending"}>{settled ? "Settled" : "Settling on Hedera"}</Badge>
        <button type="button" onClick={() => dismiss(receipt.sessionId)} className="rounded-pill p-1 text-muted-fg hover:bg-surface-2" aria-label="Close receipt">
          <X size={16} />
        </button>
      </div>
      <dl className="grid gap-1.5 text-[14px] leading-5">
        <Row label="Locked">
          <Amount value={receipt.locked} />
        </Row>
        <Row label="Refunded">
          <Amount value={receipt.refunded} />
        </Row>
        <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2.5">
          <dt className="text-muted-fg">
            Paid <span className="text-[12px]">· {receipt.watchedChunks} chunks</span>
          </dt>
          <dd>
            <Amount value={receipt.watched} className="text-[32px] font-bold tracking-[-0.02em] text-chain-fg" />
          </dd>
        </div>
      </dl>
      {tx ? (
        <a
          href={hashscanTxUrl(tx)}
          target="_blank"
          rel="noreferrer"
          className="flex h-10 items-center justify-between rounded-pill bg-surface-2 px-4 text-[14px] font-medium transition-colors duration-[180ms] ease-ht hover:bg-surface-3"
        >
          Receipt
          <ArrowSquareOut size={16} className="text-muted-fg" />
        </a>
      ) : (
        <div className="flex h-10 items-center rounded-pill bg-surface-2 px-4 text-[14px] text-muted-fg">Waiting for the transaction…</div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-fg">{label}</dt>
      <dd className="tabular">{children}</dd>
    </div>
  );
}
