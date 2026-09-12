import { ArrowRight, Envelope, GoogleLogo, Check, Warning } from "@phosphor-icons/react";
import { Button, Sheet, Spinner, cn } from "@/design/ui";
import { useWallet, type LoginMethod } from "./WalletProvider";
import { DisconnectRow, WalletPanel } from "./WalletPanel";

const options: { method: LoginMethod; title: string; sub: string; Icon: typeof GoogleLogo }[] = [
  { method: "google", title: "Continue with Google", sub: "Wallet created for you", Icon: GoogleLogo },
  { method: "email", title: "Continue with email", sub: "No seed phrase", Icon: Envelope },
];

export function WalletSheet() {
  const wallet = useWallet();
  return (
    <Sheet open={wallet.sheetOpen} onClose={wallet.closeSheet} variant="popover">
      {wallet.status === "disconnected" ? <Disconnected /> : null}
      {wallet.status === "connecting" ? <Connecting /> : null}
      {wallet.status === "onboarding" ? <Onboarding /> : null}
      {wallet.status === "ready" ? <WalletPanel /> : null}
    </Sheet>
  );
}

function Disconnected() {
  const wallet = useWallet();
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-[20px] font-bold tracking-[-0.01em]">Connect a wallet</h2>
        <p className="mt-1 text-[14px] text-muted-fg">
          Signing in creates no account. Your address is your identity and your balance funds playback.
        </p>
      </div>
      <div className="grid gap-2">
        {options.map(({ method, title, sub, Icon }, i) => (
          <button
            key={method}
            type="button"
            onClick={() => wallet.login(method)}
            className="flex h-14 items-center gap-3 rounded-pill border border-border px-[18px] text-left transition-colors duration-[180ms] ease-ht hover:border-chain"
          >
            <span className={cn("grid size-8 place-items-center rounded-pill", i === 0 ? "bg-chain-soft text-chain-fg" : "bg-surface-2 text-muted-fg")}>
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium">{title}</span>
              <span className="block text-[12px] text-muted-fg">{sub}</span>
            </span>
            <ArrowRight size={16} className="text-muted-fg" />
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={wallet.closeSheet}>
          Not now
        </Button>
        <Button variant="chain" onClick={() => wallet.login("google")}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function Connecting() {
  const wallet = useWallet();
  return (
    <div className="grid justify-items-center gap-4 py-10 text-center">
      <Spinner tone="chain" className="size-8" />
      <div className="text-[14px] text-muted-fg">Finish signing in with Privy…</div>
      <Button variant="ghost" size="sm" onClick={() => void wallet.logout()}>
        Cancel
      </Button>
    </div>
  );
}

function Onboarding() {
  const wallet = useWallet();
  const ob = wallet.onboarding;
  const steps = [
    { key: "account", label: "Creating your Hedera account", sub: "A little HBAR for gas, sent by HederaTube" },
    { key: "allowance", label: "Allowing USDC deposits", sub: "One approval, then every lock is a single transaction" },
  ] as const;
  return (
    <div className="grid gap-5">
      <h2 className="text-[20px] font-bold tracking-[-0.01em]">Setting up your wallet</h2>
      <ol className="grid gap-1.5">
        {steps.map(step => {
          const done = ob?.done.includes(step.key);
          const active = ob?.step === step.key;
          const failed = active && !!wallet.error;
          return (
            // same row shape as the wallet panel's address list, so the popover reads as one surface
            <li key={step.key} className="flex items-center gap-3 rounded-md bg-surface-2 py-2.5 pl-3 pr-4">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-pill",
                  done ? "bg-positive/15 text-positive-fg" : failed ? "bg-destructive/12 text-destructive" : "bg-surface-3 text-muted-fg",
                )}
              >
                {done ? <Check size={16} weight="bold" /> : failed ? <Warning size={16} /> : active ? <Spinner tone="chain" className="size-4" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[14px] font-medium leading-5", !done && !active && "text-muted-fg")}>{step.label}</span>
                <span className="block text-[12px] leading-[18px] text-muted-fg">{step.sub}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {wallet.error ? (
        <div className="grid gap-2 rounded-md bg-destructive/12 p-3 text-[13px] text-destructive">
          {wallet.error}
          <Button variant="outline" size="sm" onClick={wallet.retryOnboarding} className="justify-self-start">
            Retry
          </Button>
        </div>
      ) : null}
      <DisconnectRow />
    </div>
  );
}
