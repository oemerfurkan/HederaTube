import { keccak256, toBytes } from "viem";
import { cn } from "./cn";

/** Deterministic identicon from an address: a 5×5 mirrored grid in one hue. The wallet is the account. */
export function AddressAvatar({ address, size = 32, className }: { address: string; size?: number; className?: string }) {
  const hash = keccak256(toBytes(address.toLowerCase()));
  const bytes = hash.slice(2);
  const hue = parseInt(bytes.slice(0, 2), 16) * 1.4;
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row += 1) {
    const half = [0, 1, 2].map(col => parseInt(bytes[(row * 3 + col + 2) % 64], 16) % 2 === 0);
    cells.push(half[0], half[1], half[2], half[1], half[0]);
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      className={cn("shrink-0 rounded-pill bg-surface-2", className)}
      role="img"
      aria-label={address}
      shapeRendering="crispEdges"
    >
      {cells.map((on, i) =>
        on ? <rect key={i} x={i % 5} y={Math.floor(i / 5)} width={1} height={1} fill={`hsl(${hue} 60% 55%)`} /> : null,
      )}
    </svg>
  );
}
