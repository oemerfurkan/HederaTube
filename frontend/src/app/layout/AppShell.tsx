import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { cn, Toaster } from "@/design/ui";
import { Topbar } from "./Topbar";
import { Sidebar } from "./Sidebar";
import { RouteTransition } from "./RouteTransition";
import { WalletSheet } from "@/features/wallet/WalletSheet";
import { ReceiptStack } from "@/features/receipt/ReceiptStack";
import { useLeaveGuard } from "@/payments/refundOnLeave";

const COLLAPSED_KEY = "ht:sidebar-collapsed";

export function AppShell() {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  useLeaveGuard();

  // The watch page is player-first: the rail is only ever a drawer there (YouTube does the same).
  const isWatch = location.pathname.startsWith("/watch/");

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const onMenu = useCallback(() => {
    const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
    if (isWatch || !wide) {
      setDrawerOpen(v => !v);
      return;
    }
    setCollapsed(v => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [isWatch]);

  return (
    <div className="flex min-h-full flex-col bg-bg text-fg">
      <Topbar onMenu={onMenu} />
      <div className="flex flex-1">
        <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} collapsed={collapsed} drawerOnly={isWatch} />
        {/* the watch page owns its own gutters (YouTube's flexy columns); every other page uses the shell's */}
        <main className={cn("min-w-0 flex-1 pb-16", isWatch ? "pt-0" : "px-4 pt-6 md:px-6")}>
          <RouteTransition routeKey={location.pathname}>
            <Outlet />
          </RouteTransition>
        </main>
      </div>
      <WalletSheet />
      <ReceiptStack />
      <Toaster />
    </div>
  );
}
