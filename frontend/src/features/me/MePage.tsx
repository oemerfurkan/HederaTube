import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Amount, Badge, Button, UsdcMark, cn } from "@/design/ui";
import { useEarnings } from "@/api/hooks";
import { useWallet } from "@/features/wallet/WalletProvider";
import { WalletPanel } from "@/features/wallet/WalletPanel";
import { ActiveLocks } from "@/features/wallet/ActiveLocks";
import { useReceipts } from "@/payments/receipts";
import { formatUsdc } from "@/lib/money";

const TABS = ["Watch", "Wallet", "Earnings"] as const;

export function MePage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Watch");
  if (wallet.status !== "ready") {
    return (
      <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-border px-6 py-12 text-center">
        <div className="text-h2">Connect a wallet to see your channel</div>
        <Button variant="chain" onClick={wallet.openSheet}>
          Connect wallet
        </Button>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-h1">My channel</h1>
        <div className="inline-flex gap-1 rounded-pill bg-surface-2 p-1">
          {TABS.map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cn("h-[34px] rounded-pill px-[18px] text-[14px] font-medium", tab === t ? "bg-surface text-fg shadow-1" : "text-muted-fg")}>
              {t}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Button variant="secondary" onClick={() => navigate("/upload")}>
            Upload
          </Button>
        </div>
      </div>
      {tab === "Watch" ? <WatchTab /> : null}
      {tab === "Wallet" ? (
        <div className="max-w-[480px]">
          <WalletPanel />
        </div>
      ) : null}
      {tab === "Earnings" ? <EarningsTab /> : null}
    </div>
  );
}

function WatchTab() {
  const { receipts } = useReceipts();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="grid gap-3">
        <h2 className="label-caps text-muted-fg">This session</h2>
        {receipts.length === 0 ? (
          <p className="text-small text-muted-fg">
            Nothing watched yet. <Link to="/" className="text-chain-fg underline">Pick a video.</Link>
          </p>
        ) : (
          receipts.map(r => (
            <div key={r.sessionId} className="flex items-center gap-3 rounded-md bg-surface-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{r.videoTitle}</div>
                <div className="flex items-center gap-1 text-small tabular text-muted-fg">
                  paid {formatUsdc(r.watched)} <UsdcMark size={12} /> · refunded {formatUsdc(r.refunded)} <UsdcMark size={12} />
                </div>
              </div>
              <Badge tone={r.phase === "settled" ? "settled" : "pending"}>{r.phase === "settled" ? "Settled" : "Settling"}</Badge>
            </div>
          ))
        )}
      </section>
      <ActiveLocks />
    </div>
  );
}

function EarningsTab() {
  const wallet = useWallet();
  const earnings = useEarnings(wallet.address);
  const data = earnings.data;
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Total earned">
          <Amount value={data?.total_earned ?? 0n} className="text-chain-fg" />
        </Summary>
        <Summary label="Chunks served">
          <span className="tabular">{(data?.chunks_served ?? 0).toLocaleString()}</span>
        </Summary>
        <Summary label="Unique viewers">
          <span className="tabular">{(data?.unique_viewers ?? 0).toLocaleString()}</span>
        </Summary>
      </div>
      {data && data.rows.length === 0 ? (
        <p className="text-small text-muted-fg">No videos yet. Upload your first one.</p>
      ) : (
        <ul className="grid gap-1">
          {data?.rows.map(row => (
            <li key={row.video_id} className={cn("flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-surface-2", row.status === "payout pending" && "opacity-60")}>
              <img src={row.thumbnail_url} alt="" className="h-[34px] w-14 rounded-sm object-cover" />
              <div className="min-w-0 flex-1">
                <Link to={`/watch/${row.video_id}`} className="block truncate text-[14px] font-medium">
                  {row.title}
                </Link>
                <div className="text-[12px] tabular text-muted-fg">{row.chunks_served.toLocaleString()} chunks served</div>
              </div>
              <span className={cn("inline-flex items-center gap-1 text-[14px] font-medium tabular", row.status === "settled" ? "text-positive" : "text-muted-fg")}>
                +{formatUsdc(row.earned)} <UsdcMark size={12} />
              </span>
              {row.status === "settled" ? (
                <Badge tone="settled">Settled</Badge>
              ) : row.status === "processing" ? (
                <Badge tone="pending">Processing</Badge>
              ) : (
                <Badge tone="pending">
                  payout pending · +{formatUsdc(row.pending)} <UsdcMark size={11} />
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Summary({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-card border border-border bg-surface p-6">
      <span className="label-caps text-muted-fg">{label}</span>
      <span className="text-numeric">{children}</span>
    </div>
  );
}
