import { getAddress } from "viem";

export type VideoFixture = {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  /** USDC base units for the full watch. */
  totalPrice: string;
  freePreviewChunks: number;
  createdAt: string;
  creatorHandle: string;
  /** Demo asset folder under /public/demo. */
  asset: string;
  seedViews: number;
};

export const MOCK_CREATOR = {
  id: "creator-1",
  handle: "ledgerlab",
  displayName: "Ledger Lab",
  accountId: (import.meta.env.VITE_MOCK_CREATOR_ACCOUNT_ID as string) || "0.0.10463864",
  walletAddress: "0x00000000000000000000000000000000009faa78",
  subscribers: 1284,
};

/** EVM address that signs claim batches / refunds server-side. The mock never signs; it only commits the address. */
export const MOCK_RECEIVER_AUTHORIZER: `0x${string}` = getAddress(
  (import.meta.env.VITE_MOCK_RECEIVER_AUTHORIZER as string) &&
    (import.meta.env.VITE_MOCK_RECEIVER_AUTHORIZER as string) !==
      "0x0000000000000000000000000000000000000000"
    ? (import.meta.env.VITE_MOCK_RECEIVER_AUTHORIZER as string)
    : "0x00000000000000000000000000000000009fAA79",
);

export const VIDEOS: VideoFixture[] = [
  {
    id: "v-consensus",
    title: "Building a Hedera consensus node from scratch",
    description:
      "A walkthrough of the gossip, hashgraph and virtual-voting layers, with a live testnet demo at the end. Free preview for the first ten seconds.",
    durationSeconds: 30,
    totalPrice: "1000",
    freePreviewChunks: 2,
    createdAt: "2026-09-04T10:00:00Z",
    creatorHandle: "ledgerlab",
    asset: "d30",
    seedViews: 402,
  },
  {
    id: "v-x402",
    title: "x402 batch settlement explained in sixty seconds",
    description: "Why fifty sessions can close in one Hedera transaction, and what the voucher actually proves.",
    durationSeconds: 60,
    totalPrice: "1200",
    freePreviewChunks: 0,
    createdAt: "2026-09-07T14:30:00Z",
    creatorHandle: "ledgerlab",
    asset: "d60",
    seedViews: 1180,
  },
  {
    id: "v-hts",
    title: "HTS allowances vs. ERC-20 approvals",
    description: "Two minutes on how the Hedera Token Service exposes allowances to the EVM, and where the facade differs.",
    durationSeconds: 120,
    totalPrice: "2400",
    freePreviewChunks: 1,
    createdAt: "2026-09-09T09:15:00Z",
    creatorHandle: "ledgerlab",
    asset: "d120",
    seedViews: 96,
  },
  {
    id: "v-mirror",
    title: "Reading the Mirror Node like a pro",
    description: "Five minutes of REST endpoints, contract call simulation and the lag you have to design around.",
    durationSeconds: 300,
    totalPrice: "6000",
    freePreviewChunks: 0,
    createdAt: "2026-09-10T18:45:00Z",
    creatorHandle: "ledgerlab",
    asset: "d300",
    seedViews: 27,
  },
];
