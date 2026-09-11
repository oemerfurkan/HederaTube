import { describe, expect, it } from "vitest";
import { channelMeta, createChannelStorage } from "@/payments/channelStorage";

describe("channelStorage (IndexedDB)", () => {
  it("namespaces channels per payer and lists only funded locks", async () => {
    const a = createChannelStorage("0xAAAA000000000000000000000000000000000001");
    const b = createChannelStorage("0xBBBB000000000000000000000000000000000002");
    await a.set("0xchannel1", { balance: "1000", chargedCumulativeAmount: "250" });
    await a.set("0xchannel2", { balance: "1000", chargedCumulativeAmount: "1000" });
    expect(await b.get("0xchannel1")).toBeUndefined();
    expect((await a.get("0xCHANNEL1"))?.balance).toBe("1000");

    const payer = "0xAAAA000000000000000000000000000000000001";
    await channelMeta.save(payer, { channelId: "0xchannel1", sessionId: "s1", videoId: "v", videoTitle: "t", closeUrl: "/c", lockedAmount: "1000", createdAt: 1 });
    await channelMeta.save(payer, { channelId: "0xchannel2", sessionId: "s2", videoId: "v", videoTitle: "t", closeUrl: "/c", lockedAmount: "1000", createdAt: 2 });
    const active = await channelMeta.listActive(payer);
    expect(active.map(l => l.sessionId)).toEqual(["s1"]);

    await a.delete("0xchannel1");
    expect(await channelMeta.listActive(payer)).toEqual([]);
  });
});
