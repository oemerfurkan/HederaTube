import { describe, expect, it } from "vitest";
import { chunkCount, chunkDelta, cumulativeAmount, maxChunkAmount, minTotalPrice, pricedChunkCount, segmentCount } from "../src/shared/price.js";

describe("price derivation", () => {
  it("watching to the end pays exactly the price; every delta stays under the announced ceiling", () => {
    for (const [price, priced] of [[72_000n, 720], [1_000n, 4], [1_200n, 12], [999_999n, 7], [2_400n, 23]] as [bigint, number][]) {
      let sum = 0n;
      const cap = maxChunkAmount(price, priced);
      for (let k = 1; k <= priced; k += 1) {
        const d = chunkDelta(price, k, priced);
        expect(d).toBeLessThanOrEqual(cap);
        sum += d;
        // charged + ceiling never exceeds the locked balance (the scheme checks maxClaimable <= balance)
        expect(cumulativeAmount(price, k - 1, priced) + cap).toBeLessThanOrEqual(price);
      }
      expect(sum).toBe(price);
    }
  });
  it("derives chunk counts and the minimum price", () => {
    expect(segmentCount(30)).toBe(12);
    expect(chunkCount(30)).toBe(6);
    expect(pricedChunkCount(30, 2)).toBe(4);
    expect(minTotalPrice(720)).toBe(1000n);
    expect(minTotalPrice(5000)).toBe(5000n);
  });
});
