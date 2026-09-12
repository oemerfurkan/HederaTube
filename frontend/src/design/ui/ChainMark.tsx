import { cn } from "./cn";

export type Chain = "hedera" | "evm" | "svm";

const MARKS: Record<Chain, { src: string; alt: string }> = {
  hedera: { src: "/hedera.svg", alt: "Hedera" },
  evm: { src: "/eth.svg", alt: "Ethereum" },
  svm: { src: "/sol.svg", alt: "Solana" },
};

/** A chain's logo on a white disc, the way wallets show network marks in either theme. */
export function ChainMark({ chain, size = 28, className }: { chain: Chain; size?: number; className?: string }) {
  const { src, alt } = MARKS[chain];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-pill bg-white", className)} style={{ width: size, height: size }}>
      <img src={src} alt={alt} className="object-contain" style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}
