import { useEffect, useLayoutEffect, useRef } from "react";
import { X, ArrowSquareOut } from "@phosphor-icons/react";
import { Amount, Badge, Mono } from "@/design/ui";
import { gsap, EASE, DURATION, prefersReducedMotion } from "@/design/motion";
import { useReceiptQuery } from "@/api/hooks";
import { useReceipts } from "@/payments/receipts";
import type { Receipt } from "@/payments/types";
import { hashscanTxUrl } from "@/lib/hedera";

/**
 * Guide §8. Phase one right after close: amber "Settling on Hedera", optimistic amounts.
 * Phase two when the batch confirms: green Settled + tx hash. Refunded is the hero line.
 * Amounts arrive final; the card slides in, the digits never count.
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
      <div className="flex items-center gap-2">
        <Badge tone={settled ? "settled" : "pending"}>{settled ? "Settled" : "Settling on Hedera"}</Badge>
        <span className="min-w-0 flex-1 truncate text-small text-muted-fg">{receipt.videoTitle}</span>
        <button type="button" onClick={() => dismiss(receipt.sessionId)} className="rounded-pill p-1 text-muted-fg hover:bg-surface-2" aria-label="Close receipt">
          <X size={16} />
        </button>
      </div>
      <dl className="grid gap-1.5 text-small">
        <Row label="Locked">
          <Amount value={receipt.locked} />
        </Row>
        <Row label="Watched">
          <Amount value={receipt.watched} /> <span className="text-muted-fg">· {receipt.watchedChunks} chunks</span>
        </Row>
        <Row label="To creator">
          <Amount value={receipt.toCreator} />
        </Row>
        <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2.5">
          <dt className="text-small text-muted-fg">Refunded</dt>
          <dd>
            <Amount value={receipt.refunded} className="text-[32px] font-bold tracking-[-0.02em] text-chain-fg" />
          </dd>
        </div>
      </dl>
      {tx ? (
        <a href={hashscanTxUrl(tx)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-sm bg-surface-2 px-3.5 py-3 hover:text-fg">
          <Mono className="min-w-0 flex-1 truncate">{tx}</Mono>
          <ArrowSquareOut size={14} className="text-muted-fg" />
        </a>
      ) : (
        <Mono block>waiting for transaction…</Mono>
      )}
      <div className="text-small text-muted-fg">Gas sponsored by HederaTube</div>
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
