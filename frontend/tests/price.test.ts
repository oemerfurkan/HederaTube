import { describe, expect, it } from "vitest";
import {
  chunkCount,
  chunkDelta,
  cumulativeAmount,
  isPaidSegment,
  maxChunkAmount,
  minTotalPrice,
  perMinute,
  pricedChunkCount,
  segmentCount,
  suggestedTotalPrice,
} from "@/lib/price";

describe("price derivation (guide §2.12)", () => {
  it("splits durations into 2.5 s segments and 5 s chunks regardless of frame rate", () => {
    for (const duration of [30, 60, 120, 300, 3600, 3599.96, 61.2]) {
      expect(segmentCount(duration)).toBe(Math.ceil(duration / 2.5 - 1e-9));
      expect(chunkCount(duration)).toBe(Math.ceil(segmentCount(duration) / 2));
    }
    expect(chunkCount(3600)).toBe(720);
  });

  it("watching to the end pays exactly the total price, never leaving dust", () => {
    const cases: [bigint, number][] = [[72_000n, 720], [1_000n, 4], [1_200n, 12], [999_999n, 7], [1_000n, 1000]];
    for (const [price, priced] of cases) {
      expect(cumulativeAmount(price, priced, priced)).toBe(price);
      expect(cumulativeAmount(price, 0, priced)).toBe(0n);
      let sum = 0n;
      const cap = maxChunkAmount(price, priced);
      for (let k = 1; k <= priced; k += 1) {
        const delta = chunkDelta(price, k, priced);
        expect(delta).toBeGreaterThanOrEqual(0n);
        expect(delta).toBeLessThanOrEqual(cap);
        sum += delta;
      }
      expect(sum).toBe(price);
    }
  });

  it("rounds partial watches in the viewer's favour", () => {
    // 60 min video, 0.0720 USDC, 7 minutes watched = 84 chunks → 0.0084 USDC (guide example)
    expect(cumulativeAmount(72_000n, 84, 720)).toBe(8_400n);
    expect(cumulativeAmount(1_000n, 1, 3)).toBe(333n);
  });

  it("free preview chunks raise the unit value of the remaining chunks but not the total", () => {
    expect(pricedChunkCount(30, 2)).toBe(4);
    expect(cumulativeAmount(1_000n, 4, 4)).toBe(1_000n);
    expect(isPaidSegment(0, 2)).toBe(false);
    expect(isPaidSegment(4, 2)).toBe(true);
    expect(isPaidSegment(5, 2)).toBe(false);
  });

  it("enforces the practical minimum and derives suggested / per-minute prices", () => {
    expect(minTotalPrice(720)).toBe(1_000n);
    expect(minTotalPrice(5_000)).toBe(5_000n);
    expect(suggestedTotalPrice(3600)).toBe(72_000n);
    expect(perMinute(72_000n, 3600)).toBe(1_200n);
  });
});
