import { useEffect } from "react";
import { engine } from "./sessionMachine";
import { api } from "@/api/client";

/**
 * Tab closed mid-session: we cannot sign a refund voucher during `pagehide`, so we mark the
 * session closing with a keepalive request and let the sweeper (batch job) refund it. The wallet
 * sheet's "Active locks → Release" is the manual fallback if even that is missed.
 */
export function useLeaveGuard(): void {
  useEffect(() => {
    const onHide = () => {
      const { status, session } = engine.state;
      if (!session) return;
      if (status === "preview" || status === "streaming" || status === "interrupted") {
        void api.closeSession(session.sessionId, "leave").catch(() => undefined);
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);
}
