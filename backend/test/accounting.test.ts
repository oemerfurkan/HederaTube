import { describe, expect, it } from "vitest";
import { badgeOf, buildPlaylist, chunkCharge, classifySegment, earningsStatus, parseExtinf, receiptRefunded } from "../src/shared/accounting.js";

const session = { locked_amount: "1000", priced_chunk_count: 4, free_preview_chunks: 2, chunks_consumed: 0, chunks_served: 0, paid_chunks: [] as number[], status: "locked" };

describe("segment classification and charging", () => {
  it("classifies preview, paid, second and already-paid segments", () => {
    expect(classifySegment(session, 0).kind).toBe("preview");
    expect(classifySegment(session, 3).kind).toBe("preview");
    expect(classifySegment(session, 4)).toEqual({ kind: "paid", chunk: 2, pricedIndex: 0, k: 1 });
    expect(classifySegment(session, 5).kind).toBe("second-unpaid");
    const after = { ...session, chunks_consumed: 1, paid_chunks: [2] };
    expect(classifySegment(after, 4).kind).toBe("already-paid");
    expect(classifySegment(after, 5).kind).toBe("second-paid");
    expect(classifySegment(after, 6)).toEqual({ kind: "paid", chunk: 3, pricedIndex: 1, k: 2 });
    // Seeking ahead: chunk 5 becomes the 2nd paid chunk, not the 4th.
    expect(classifySegment(after, 10)).toEqual({ kind: "paid", chunk: 5, pricedIndex: 3, k: 2 });
  });
  it("charges the floor delta per chunk and nothing for repeats; the last chunk lands on the price", () => {
    let charged = 0n;
    let s = { ...session };
    for (let k = 1; k <= 4; k += 1) {
      const d = chunkCharge(s, k, charged);
      charged += d;
      s = { ...s, chunks_consumed: k, paid_chunks: [...s.paid_chunks, k + 1] };
    }
    expect(charged).toBe(1000n);
    expect(chunkCharge(s, 2, charged)).toBe(0n);
  });
  it("maps badges, receipt refund and earnings status like the mock", () => {
    expect(badgeOf({ ...session, status: "streaming" })).toBe("streaming");
    expect(badgeOf({ ...session, status: "settled" })).toBe("settled");
    expect(badgeOf({ ...session, status: "closed" })).toBe("free");
    expect(badgeOf({ ...session, status: "closed", chunks_consumed: 1 })).toBe("pending");
    expect(receiptRefunded({ ...session, status: "streaming", consumed_amount: "250", refunded_amount: "0" })).toBe("750");
    expect(receiptRefunded({ ...session, status: "closed", consumed_amount: "250", refunded_amount: "749" })).toBe("749");
    expect(earningsStatus("ready", 0n)).toBe("settled");
    expect(earningsStatus("ready", 5n)).toBe("payout pending");
    expect(earningsStatus("processing", 0n)).toBe("processing");
  });
  it("builds a VOD playlist and parses EXTINF back", () => {
    const text = buildPlaylist("v-x", "s-1", [2.5, 2.5, 1.2]);
    expect(text).toContain("#EXT-X-TARGETDURATION:3");
    expect(text).toContain("/stream/v-x/seg-0002.ts?s=s-1");
    expect(text.trim().endsWith("#EXT-X-ENDLIST")).toBe(true);
    expect(parseExtinf(text)).toEqual([2.5, 2.5, 1.2]);
  });
});
