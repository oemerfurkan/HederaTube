import { LoadStats, type FragmentLoaderContext, type Loader, type LoaderCallbacks, type LoaderConfiguration, type LoaderStats } from "hls.js";
import type { SessionEngine } from "./sessionMachine";

/** Segment index from a `/stream/:videoId/seg-0007.ts?s=…` URL. */
export function segmentIndexFromUrl(url: string): number | undefined {
  const match = /seg-(\d+)\.ts/.exec(url);
  return match ? Number(match[1]) : undefined;
}

/**
 * hls.js fragment loader that pays for the first segment of every chunk through the x402 fetch
 * wrapper. Free-preview segments, second segments of paid chunks and playlists use plain fetch.
 * An in-flight paid request is never aborted after the voucher was sent: cancelling it would
 * leave the server's cumulative ahead of ours and force a corrective 402 on the next chunk.
 */
export function createPaidFragmentLoader(engine: SessionEngine) {
  return class PaidFragmentLoader implements Loader<FragmentLoaderContext> {
    context: FragmentLoaderContext | null = null;
    stats: LoaderStats = new LoadStats();
    private controller: AbortController | undefined;
    private paidInFlight = false;
    private aborted = false;

    constructor(_config: unknown) {}

    destroy(): void {
      this.abort();
    }

    abort(): void {
      this.aborted = true;
      if (!this.paidInFlight) this.controller?.abort();
    }

    load(
      context: FragmentLoaderContext,
      _config: LoaderConfiguration,
      callbacks: LoaderCallbacks<FragmentLoaderContext>,
    ): void {
      this.context = context;
      this.stats = new LoadStats();
      this.aborted = false;
      const stats = this.stats;
      stats.loading.start = performance.now();
      this.controller = new AbortController();
      const url = context.url;
      const segmentIndex = segmentIndexFromUrl(url);
      const paid = segmentIndex !== undefined && engine.needsPayment(segmentIndex);

      const request = paid
        ? (() => {
            this.paidInFlight = true;
            return engine.fetchPaid(url, segmentIndex!);
          })()
        : fetch(url, { signal: this.controller.signal, cache: "no-store" });

      request
        .then(async response => {
          if (!response.ok) {
            throw Object.assign(new Error(`HTTP ${response.status} for ${url}`), { code: response.status });
          }
          stats.loading.first = performance.now();
          const data = await response.arrayBuffer();
          stats.loaded = stats.total = data.byteLength;
          stats.loading.end = performance.now();
          if (this.aborted && !paid) {
            callbacks.onAbort?.(stats, context, null);
            return;
          }
          callbacks.onSuccess({ url, data }, stats, context, null);
        })
        .catch(error => {
          if (this.aborted && !paid) {
            callbacks.onAbort?.(stats, context, null);
            return;
          }
          const code = typeof error?.httpStatus === "number" ? error.httpStatus : (error?.code ?? 0);
          if (paid) engine.interrupt(error);
          stats.aborted = true;
          callbacks.onError({ code, text: error?.message ?? String(error) }, context, null, stats);
        })
        .finally(() => {
          this.paidInFlight = false;
        });
    }
  };
}

/** hls.js configuration: a 10 s buffer is the two-chunk credit window (guide §2.6); retries belong to the engine. */
export function hlsConfigFor(engine: SessionEngine) {
  return {
    fLoader: createPaidFragmentLoader(engine) as unknown as undefined,
    maxBufferLength: 10,
    maxMaxBufferLength: 10,
    backBufferLength: 30,
    startLevel: 0,
    enableWorker: true,
    lowLatencyMode: false,
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 20_000,
        maxLoadTimeMs: 60_000,
        timeoutRetry: null,
        errorRetry: null,
      },
    },
  };
}
