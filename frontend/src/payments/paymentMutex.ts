/**
 * Serialises paid requests per channel. The batch-settlement server rejects concurrent requests
 * on one channel (`invalid_batch_settlement_hedera_channel_busy`), and cumulative vouchers only
 * make sense in order.
 */
export class PaymentMutex {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;

  run<T>(task: () => Promise<T>): Promise<T> {
    this.pending += 1;
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      this.pending -= 1;
    });
    return result;
  }

  /** Resolves once every queued task has finished. */
  idle(): Promise<void> {
    return this.tail;
  }

  get size(): number {
    return this.pending;
  }
}
