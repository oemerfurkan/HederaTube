import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PrivyProvider, getEmbeddedConnectedWallet, useLogin, usePrivy, useWallets } from "@privy-io/react-auth";
import { hederaTestnet } from "viem/chains";
import type { ClientHederaBatchSigner } from "@/payments/x402-lite";
import { createPrivySigner, type Eip1193Provider } from "@/payments/privySigner";
import { loadOrCreateLocalSigner, localProvider } from "@/payments/localSigner";
import { runOnboarding, type OnboardingState } from "@/payments/onboarding";
import { API_MODE, PRIVY_APP_ID, USDC_TOKEN_ID, WALLET_MODE } from "@/lib/hedera";
import { getTokenBalance } from "@/lib/mirror";
import { useBalanceQuery } from "@/api/hooks";

export type LoginMethod = "google" | "email" | "wallet";
export type WalletStatus = "disconnected" | "connecting" | "onboarding" | "ready";

export type WalletContextValue = {
  mode: "privy" | "local";
  status: WalletStatus;
  address?: `0x${string}`;
  accountId?: string;
  signer?: ClientHederaBatchSigner;
  balance?: bigint;
  onboarding?: OnboardingState;
  error?: string;
  login: (method: LoginMethod) => void;
  logout: () => Promise<void>;
  retryOnboarding: () => void;
  refreshBalance: () => void;
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  autoApprove: boolean;
  setAutoApprove: (next: boolean) => void;
  getProvider?: () => Promise<Eip1193Provider>;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used within WalletProvider");
  return value;
}

type Bridge = {
  address?: `0x${string}`;
  connecting: boolean;
  ready: boolean;
  loginImpl: (method: LoginMethod) => void;
  logoutImpl: () => Promise<void>;
  getProvider?: () => Promise<Eip1193Provider>;
  switchChain?: (chainId: number) => Promise<void>;
  /** Local mode provides a fully built signer; Privy mode builds it after onboarding. */
  localSigner?: ClientHederaBatchSigner;
};

const AUTO_APPROVE_KEY = "ht:auto-approve";

/** Shared state machine used by both wallet backends. */
function useWalletCore(bridge: Bridge, mode: "privy" | "local"): WalletContextValue {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState>();
  const [accountId, setAccountId] = useState<string>();
  const [error, setError] = useState<string>();
  const [autoApprove, setAutoApproveState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTO_APPROVE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [mirrorBalance, setMirrorBalance] = useState<bigint>();
  const onboardingFor = useRef<string | undefined>(undefined);

  const { address } = bridge;
  const mockLedger = API_MODE === "mock";
  const balanceQuery = useBalanceQuery(address, mockLedger);

  const start = useCallback(() => {
    if (!address) return;
    onboardingFor.current = address;
    setError(undefined);
    setOnboarding({ step: "account", done: [] });
    runOnboarding({
      address,
      getProvider: bridge.getProvider,
      switchChain: bridge.switchChain,
      onState: state => {
        if (onboardingFor.current === address) setOnboarding(state);
      },
    })
      .then(result => {
        if (onboardingFor.current === address) setAccountId(result.accountId);
      })
      .catch(err => {
        if (onboardingFor.current === address) setError(err instanceof Error ? err.message : String(err));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    if (!address) {
      onboardingFor.current = undefined;
      setOnboarding(undefined);
      setAccountId(undefined);
      setError(undefined);
      return;
    }
    if (onboardingFor.current !== address) start();
  }, [address, start]);

  useEffect(() => {
    if (mockLedger || !accountId) return;
    let cancelled = false;
    const tick = () =>
      getTokenBalance(accountId, USDC_TOKEN_ID)
        .then(value => !cancelled && setMirrorBalance(value))
        .catch(() => undefined);
    void tick();
    const timer = setInterval(tick, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [accountId, mockLedger]);

  const signer = useMemo<ClientHederaBatchSigner | undefined>(() => {
    if (!address || !accountId) return undefined;
    if (bridge.localSigner) return { ...bridge.localSigner, accountId };
    if (bridge.getProvider) return createPrivySigner({ address, accountId, getProvider: bridge.getProvider });
    return undefined;
  }, [address, accountId, bridge.localSigner, bridge.getProvider]);

  const status: WalletStatus = !bridge.ready || bridge.connecting
    ? bridge.connecting
      ? "connecting"
      : "disconnected"
    : !address
      ? "disconnected"
      : signer
        ? "ready"
        : "onboarding";

  return {
    mode,
    status,
    address,
    accountId,
    signer,
    balance: mockLedger ? balanceQuery.data : mirrorBalance,
    onboarding,
    error,
    login: method => {
      setError(undefined);
      bridge.loginImpl(method);
    },
    logout: async () => {
      await bridge.logoutImpl();
      setSheetOpen(false);
    },
    retryOnboarding: start,
    refreshBalance: () => {
      void balanceQuery.refetch();
    },
    sheetOpen,
    openSheet: () => setSheetOpen(true),
    closeSheet: () => setSheetOpen(false),
    autoApprove,
    setAutoApprove: next => {
      setAutoApproveState(next);
      try {
        localStorage.setItem(AUTO_APPROVE_KEY, next ? "on" : "off");
      } catch {
        /* ignore */
      }
    },
    getProvider: bridge.getProvider,
  };
}

function PrivyBridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, logout } = usePrivy();
  const { login } = useLogin();
  const { wallets, ready: walletsReady } = useWallets();
  const [connecting, setConnecting] = useState(false);
  const embedded = getEmbeddedConnectedWallet(wallets) ?? wallets[0];
  const address = authenticated && embedded ? (embedded.address as `0x${string}`) : undefined;

  useEffect(() => {
    if (authenticated && walletsReady) setConnecting(false);
  }, [authenticated, walletsReady]);

  const bridge: Bridge = useMemo(
    () => ({
      address,
      ready,
      connecting: connecting && !address,
      loginImpl: method => {
        setConnecting(true);
        login({ loginMethods: [method] });
      },
      logoutImpl: logout,
      getProvider: embedded ? () => embedded.getEthereumProvider() as Promise<Eip1193Provider> : undefined,
      switchChain: embedded ? chainId => embedded.switchChain(chainId) : undefined,
    }),
    [address, ready, connecting, login, logout, embedded],
  );
  const value = useWalletCore(bridge, "privy");
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

const LOCAL_CONNECTED_KEY = "ht:local-wallet:connected";

function LocalBridge({ children }: { children: ReactNode }) {
  const [signer, setSigner] = useState<ClientHederaBatchSigner>();
  const [privateKey, setPrivateKey] = useState<`0x${string}`>();
  const [connecting, setConnecting] = useState(false);
  const [ready, setReady] = useState(false);

  // Reconnect the dev key on reload when the user had connected before.
  useEffect(() => {
    let wanted = false;
    try {
      wanted = localStorage.getItem(LOCAL_CONNECTED_KEY) === "1";
    } catch {
      wanted = false;
    }
    if (!wanted) {
      setReady(true);
      return;
    }
    loadOrCreateLocalSigner()
      .then(result => {
        setSigner(result.signer);
        setPrivateKey(result.privateKey);
      })
      .finally(() => setReady(true));
  }, []);

  const bridge: Bridge = useMemo(
    () => ({
      address: signer?.evmAddress,
      ready,
      connecting,
      loginImpl: () => {
        setConnecting(true);
        loadOrCreateLocalSigner()
          .then(result => {
            setSigner(result.signer);
            setPrivateKey(result.privateKey);
            try {
              localStorage.setItem(LOCAL_CONNECTED_KEY, "1");
            } catch {
              /* ignore */
            }
          })
          .finally(() => setConnecting(false));
      },
      logoutImpl: async () => {
        setSigner(undefined);
        setPrivateKey(undefined);
        try {
          localStorage.removeItem(LOCAL_CONNECTED_KEY);
        } catch {
          /* ignore */
        }
      },
      localSigner: signer,
      getProvider: privateKey ? () => Promise.resolve(localProvider(privateKey)) : undefined,
    }),
    [signer, privateKey, connecting, ready],
  );
  const value = useWalletCore(bridge, "local");
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  if (WALLET_MODE === "privy" && PRIVY_APP_ID) {
    return (
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          appearance: { theme: "dark", accentColor: "#8259EF", walletChainType: "ethereum-only" },
          loginMethods: ["google", "email", "wallet"],
          embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
          defaultChain: hederaTestnet,
          supportedChains: [hederaTestnet],
        }}
      >
        <PrivyBridge>{children}</PrivyBridge>
      </PrivyProvider>
    );
  }
  return <LocalBridge>{children}</LocalBridge>;
}
