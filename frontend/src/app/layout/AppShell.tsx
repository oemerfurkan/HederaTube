import { useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Topbar } from "./Topbar";
import { Sidebar } from "./Sidebar";
import { RouteTransition } from "./RouteTransition";
import { WalletSheet } from "@/features/wallet/WalletSheet";
import { ReceiptStack } from "@/features/receipt/ReceiptStack";
import { useLeaveGuard } from "@/payments/refundOnLeave";

export function AppShell() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useLeaveGuard();
  return (
    <div className="flex min-h-full flex-col bg-bg text-fg">
      <Topbar onMenu={() => setMenuOpen(v => !v)} />
      <div className="flex flex-1">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="min-w-0 flex-1 px-4 pb-16 pt-5 md:px-6">
          <RouteTransition routeKey={location.pathname}>
            <Outlet />
          </RouteTransition>
        </main>
      </div>
      <WalletSheet />
      <ReceiptStack />
    </div>
  );
}
