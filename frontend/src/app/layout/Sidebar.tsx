import { NavLink } from "react-router";
import { House, List, UserCircle } from "@phosphor-icons/react";
import { cn } from "@/design/ui";
import { Brand } from "./Brand";
import { ESCROW_ID } from "@/lib/hedera";

const items = [
  { to: "/", label: "Home", short: "Home", icon: House, end: true },
  { to: "/me", label: "My channel", short: "You", icon: UserCircle, end: false },
];

const links = [
  { label: "GitHub", href: "https://github.com/x402-foundation/x402" },
  { label: "Twitter", href: "https://x.com/hedera" },
  { label: "Contract", href: `https://hashscan.io/testnet/contract/${ESCROW_ID}` },
];

/** Footer of the expanded rail: a hairline, the three outbound links, and the credits. */
function SidebarFooter({ hidden = false }: { hidden?: boolean }) {
  return (
    <div
      className={cn(
        "mt-auto grid w-[216px] gap-2.5 border-t border-border px-3 pb-4 pt-4 text-[12px] leading-[18px] transition-opacity duration-200 ease-ht",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {links.map(l => (
          <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="font-medium text-muted-fg hover:text-fg">
            {l.label}
          </a>
        ))}
      </div>
      <p className="text-muted-fg">© 2026 HederaTube · Testnet</p>
      <p className="text-muted-fg">
        Made for ETHOnline 2026 with <span className="text-primary">♥</span>
      </p>
    </div>
  );
}

export type SidebarProps = {
  /** Drawer state (mobile and the watch page). */
  open: boolean;
  onClose: () => void;
  /** Desktop rail collapsed to icons. */
  collapsed?: boolean;
  /** Render only as an overlay drawer (watch page). */
  drawerOnly?: boolean;
};

/**
 * YouTube-style navigation: a 240 px rail with labels, a 72 px icon rail when collapsed, and an
 * overlay drawer on small screens and on the watch page. The hamburger in the header drives all three.
 */
export function Sidebar({ open, onClose, collapsed = false, drawerOnly = false }: SidebarProps) {
  const mini = collapsed && !drawerOnly;

  const rail = (inDrawer: boolean) => {
    const icons = mini && !inDrawer;
    return (
      <nav className={cn("flex min-h-0 flex-1 flex-col gap-0.5 px-3 py-3", icons && "items-center px-1")}>
        {items.map(({ to, label, short, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                "rounded-[10px] transition-all duration-200 ease-ht hover:bg-surface-2",
                icons ? "grid w-16 justify-items-center gap-1.5 px-1 py-4 text-[10px] leading-[14px]" : "flex h-10 items-center gap-6 px-3 text-[14px]",
                isActive && "font-medium",
              )
            }
          >
            {/* the current page is marked by a filled glyph, not by a stuck hover */}
            {({ isActive }) => (
              <>
                <Icon size={24} weight={isActive ? "fill" : "regular"} />
                {icons ? short : label}
              </>
            )}
          </NavLink>
        ))}
        <SidebarFooter hidden={icons} />
      </nav>
    );
  };

  return (
    <>
      {/* overlay drawer: small screens, and the watch page at any width */}
      {open ? <div className="fixed inset-0 z-30 bg-black/50" onClick={onClose} /> : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col overflow-y-auto bg-bg transition-transform duration-[180ms] ease-ht",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* the drawer carries its own header so the hamburger and wordmark stay where they were */}
        <div className="flex h-14 shrink-0 items-center gap-3 px-4">
          <button type="button" className="grid size-10 shrink-0 place-items-center rounded-pill hover:bg-surface-2" onClick={onClose} aria-label="Close menu">
            <List size={24} />
          </button>
          <Brand onClick={onClose} className="[&>span:last-child]:inline" />
        </div>
        {rail(true)}
      </aside>

      {/* inline rail */}
      {!drawerOnly ? (
        <aside
          className={cn(
            "sticky top-14 hidden h-[calc(100vh-56px)] shrink-0 flex-col overflow-y-auto overflow-x-hidden bg-bg transition-[width] duration-200 ease-ht md:flex",
            mini ? "w-[72px]" : "w-60",
          )}
        >
          {rail(false)}
        </aside>
      ) : null}
    </>
  );
}
