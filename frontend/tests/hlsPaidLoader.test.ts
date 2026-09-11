import { describe, expect, it } from "vitest";
import { segmentIndexFromUrl } from "@/payments/hlsPaidLoader";

describe("hls paid loader helpers", () => {
  it("parses the segment index from stream URLs", () => {
    expect(segmentIndexFromUrl("/stream/v-x402/seg-0007.ts?s=abc")).toBe(7);
    expect(segmentIndexFromUrl("http://localhost:5173/stream/v/seg-0120.ts")).toBe(120);
    expect(segmentIndexFromUrl("/stream/v/playlist.m3u8")).toBeUndefined();
  });
});
