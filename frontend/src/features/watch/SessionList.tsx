import { useState } from "react";
import { AddressAvatar, Amount, Badge, Mono, cn } from "@/design/ui";
import { useVideoSessions } from "@/api/hooks";
import type { SessionListRow, Video } from "@/api/types";
import { formatClock } from "@/lib/price";
import { hashscanTxUrl, shortAddress } from "@/lib/hedera";

/** Where comments would be: the product's social proof (guide §6.4). Live viewers sit on top. */
export function SessionList({ video }: { video: Video }) {
  const [tab, setTab] = useState<"recent" | "top">("recent");
  const sessions = useVideoSessions(video.id, tab);
  const data = sessions.data;
  return (
    <section className="grid gap-4 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[16px] font-medium leading-[22px]">
          <span className="tabular">{(data?.total_sessions ?? 0).toLocaleString()}</span> sessions ·{" "}
          <Amount value={data?.total_earned ?? 0n} className="text-chain-fg" /> earned
        </h2>
        <div className="inline-flex gap-1 rounded-pill bg-surface-2 p-1">
          {(["recent", "top"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn("h-[34px] rounded-pill px-[18px] text-[14px] font-medium capitalize", tab === t ? "bg-surface text-fg shadow-1" : "text-muted-fg")}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {data && data.rows.length === 0 ? (
        <p className="text-[14px] leading-5 text-muted-fg">No one has paid to watch this yet. Be the first.</p>
      ) : (
        <ul className="grid gap-1">
          {data?.rows.map(row => <SessionRow key={row.id} row={row} video={video} />)}
        </ul>
      )}
    </section>
  );
}

function SessionRow({ row, video }: { row: SessionListRow; video: Video }) {
  const tone = row.badge === "settled" ? "settled" : row.badge === "streaming" ? "streaming" : row.badge === "free" ? "free" : "pending";
  const label = row.badge === "settled" ? "Settled" : row.badge === "streaming" ? "Streaming" : row.badge === "free" ? "Free preview" : "Settling";
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <AddressAvatar address={row.viewer_address} size={32} />
      <Mono className="w-[110px] text-fg">{shortAddress(row.viewer_address, 6, 4)}</Mono>
      <Amount value={row.paid_amount} className="w-[120px] text-[14px] font-medium text-chain-fg" />
      <span className="text-[12px] leading-[18px] tabular text-muted-fg">
        {formatClock(row.watched_seconds)} · {row.watched_percent}% of {formatClock(video.duration_seconds)}
      </span>
      <span className="text-[12px] leading-[18px] tabular text-muted-fg">{new Date(row.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      <span className="ml-auto flex items-center gap-2">
        <Badge tone={tone}>{label}</Badge>
        {row.tx ? (
          /* the settlement transaction is the receipt; the hash itself is noise in a list */
          <a
            href={hashscanTxUrl(row.tx)}
            target="_blank"
            rel="noreferrer"
            title="Open this settlement on HashScan"
            className="hidden h-[26px] cursor-pointer items-center rounded-pill bg-surface-2 px-3 text-[12px] font-medium text-muted-fg transition-colors duration-[180ms] ease-ht hover:bg-surface-3 hover:text-fg lg:inline-flex"
          >
            Receipt
          </a>
        ) : null}
      </span>
    </li>
  );
}
