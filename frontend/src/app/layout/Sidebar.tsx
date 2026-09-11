import { NavLink } from "react-router";
import { House, UserCircle } from "@phosphor-icons/react";
import { cn, Amount, Mono } from "@/design/ui";
import { useWallet } from "@/features/wallet/WalletProvider";
import { useMe, useRunBatch } from "@/api/hooks";
import { API_MODE, DEV_CONTROLS } from "@/lib/hedera";
import { api } from "@/api/client";

const items = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/me", label: "My channel", icon: UserCircle, end: false },
];

/** 240 px, bg, no border. Active item is a pill on surface-2. Hidden under md; hamburger opens it. */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wallet = useWallet();
  const me = useMe(wallet.address);
  const runBatch = useRunBatch();
  return (
    <>
      {open ? <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={onClose} /> : null}
      <aside
        className={cn(
          "fixed inset-y-14 left-0 z-20 flex w-60 shrink-0 flex-col gap-1 bg-bg px-3 py-4 transition-transform duration-[180ms] ease-ht md:sticky md:top-14 md:h-[calc(100vh-56px)] md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                "flex h-10 items-center gap-3 rounded-pill px-4 text-[14px] font-medium transition-colors duration-[180ms] ease-ht hover:bg-surface-2",
                isActive && "bg-surface-2",
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
        {DEV_CONTROLS ? (
          <div className="mt-auto grid gap-1.5 px-1 pb-3">
            <span className="label-caps text-muted-fg">Demo controls</span>
            <button
              type="button"
              onClick={() => runBatch.mutate()}
              disabled={runBatch.isPending}
              className="flex h-9 items-center justify-between rounded-pill bg-surface-2 px-4 text-[13px] font-medium hover:brightness-[0.96] disabled:opacity-60"
            >
              Run settlement batch
              {runBatch.data ? <span className="tabular text-muted-fg">{runBatch.data.settled} settled</span> : null}
            </button>
            {API_MODE === "mock" ? (
              <button
                type="button"
                onClick={() => api.resetMock().then(() => window.location.reload())}
                className="h-9 rounded-pill px-4 text-left text-[13px] text-muted-fg hover:bg-surface-2"
              >
                Reset mock data
              </button>
            ) : null}
          </div>
        ) : null}
        {wallet.status === "ready" ? (
          <div className={cn("grid gap-1 rounded-card border border-chain/40 bg-surface p-4", !DEV_CONTROLS && "mt-auto")}>
            <Mono className="text-fg">{wallet.accountId ?? "0.0.—"}</Mono>
            <span className="text-[12px] text-muted-fg">Spent today</span>
            <Amount value={me.data?.spent_today ?? 0n} className="text-[14px] font-medium text-chain-fg" />
          </div>
        ) : null}
      </aside>
    </>
  );
}
