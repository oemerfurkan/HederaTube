import { describe, expect, it } from "vitest";
import { PaymentMutex } from "@/payments/paymentMutex";

describe("PaymentMutex", () => {
  it("runs tasks strictly in order and survives failures", async () => {
    const mutex = new PaymentMutex();
    const order: string[] = [];
    const a = mutex.run(async () => {
      await new Promise(r => setTimeout(r, 20));
      order.push("a");
      return "a";
    });
    const b = mutex.run(async () => {
      order.push("b");
      throw new Error("boom");
    });
    const c = mutex.run(async () => {
      order.push("c");
      return "c";
    });
    expect(mutex.size).toBe(3);
    await expect(a).resolves.toBe("a");
    await expect(b).rejects.toThrow("boom");
    await expect(c).resolves.toBe("c");
    await mutex.idle();
    expect(order).toEqual(["a", "b", "c"]);
    expect(mutex.size).toBe(0);
  });
});
