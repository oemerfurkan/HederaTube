import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type Hls from "hls.js";
import { decodePaymentResponseHeader } from "@x402/core/http";
import type { ClientHederaBatchSigner } from "./x402-lite";
import { computeChannelId } from "./x402-lite";
import { createSessionPaymentClient, type SessionPaymentClient } from "./x402Client";
import { PaymentMutex } from "./paymentMutex";
import { channelMeta } from "./channelStorage";
import { receiptsStore } from "./receipts";
import type { PaymentStatus, ViewingSession } from "./types";
import { SEGMENTS_PER_CHUNK, chunkOfSegment, cumulativeAmount } from "@/lib/price";
import { api } from "@/api/client";
import type { Video } from "@/api/types";

export type EngineState = {
  status: PaymentStatus;
  video?: Video;
  session?: ViewingSession;
  /** Priced chunks the server has charged (0-based chunk indices, includes free-preview offsets). */
  paidChunks: number[];
  /** Server-reported cumulative charge, USDC base units. */
  chargedCumulative: bigint;
  /** Chunk currently under the playhead. */
  activeChunk: number;
  currentTime: number;
  bufferedEnd: number;
  lockTx?: string;
  error?: string;
  pausedAt?: number;
};

const initial: EngineState = {
  status: "idle",
  paidChunks: [],
  chargedCumulative: 0n,
  activeChunk: 0,
  currentTime: 0,
  bufferedEnd: 0,
};

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

/**
 * Drives one viewing session: lock (deposit), per-chunk vouchers via the HLS loader, interruption
 * and retry, close (refund) and the receipt. Lives outside React so the hls.js loader can call it.
 */
export class SessionEngine {
  readonly store = createStore<EngineState>(() => ({ ...initial }));
  readonly mutex = new PaymentMutex();
  private payment?: SessionPaymentClient;
  private signer?: ClientHederaBatchSigner;
  private hls?: Hls;
  private media?: HTMLVideoElement;
  private closing?: Promise<void>;

  get state(): EngineState {
    return this.store.getState();
  }

  private set(patch: Partial<EngineState>): void {
    this.store.setState(patch);
  }

  reset(): void {
    this.payment = undefined;
    this.closing = undefined;
    // replace, not merge: optional keys (session, video, error, lockTx) are absent from `initial`,
    // so a merge would keep the previous video's session alive after the reset
    this.store.setState({ ...initial }, true);
  }

  /** Decides between the Lock and Deposit covers from the wallet balance. */
  prepare(video: Video, signer: ClientHederaBatchSigner | undefined, balance: bigint | undefined): void {
    this.signer = signer;
    const price = BigInt(video.total_price);
    const insufficient = balance !== undefined && balance < price;
    this.set({ video, status: insufficient ? "insufficient" : "idle" });
  }

  attach(hls: Hls, media: HTMLVideoElement): void {
    this.hls = hls;
    this.media = media;
  }

  /** The player is tearing its hls instance down; forget it so a late close never touches a destroyed one. */
  detach(hls: Hls): void {
    if (this.hls !== hls) return;
    this.hls = undefined;
    this.media = undefined;
  }

  /**
   * Lock: opens a session on the API, then pays the lock route once. The scheme sees an empty
   * channel and builds a deposit payload for exactly the video price (two invisible signatures).
   */
  async lock(): Promise<void> {
    const { video, status } = this.state;
    if (!video || !this.signer) throw new Error("engine not prepared");
    if (status !== "idle") return;
    this.set({ status: "locking", error: undefined });
    try {
      const opened = await api.openSession(video.id, this.signer.evmAddress);
      const session: ViewingSession = {
        sessionId: opened.sessionId,
        videoId: video.id,
        price: BigInt(video.total_price),
        pricedChunks: opened.pricedChunks,
        freePreviewChunks: video.free_preview_chunks,
        chunkCount: video.chunk_count,
        segmentCount: video.segment_count,
        durationSeconds: video.duration_seconds,
        playlistUrl: opened.playlistUrl,
        lockUrl: opened.lockUrl,
        closeUrl: opened.closeUrl,
        creatorAccountId: opened.creatorAccountId,
      };
      this.payment = createSessionPaymentClient({ signer: this.signer, session });
      const response = await this.mutex.run(() => this.payment!.fetchWithPayment(session.lockUrl));
      const settle = this.readSettle(response);
      if (!response.ok || !settle?.success) {
        throw new PaymentError(
          settle?.errorMessage ?? settle?.errorReason ?? `Lock failed (${response.status})`,
          settle?.errorReason,
          response.status,
        );
      }
      const channelId = await this.channelIdFor(session);
      session.channelId = channelId;
      await channelMeta.save(this.signer.evmAddress, {
        channelId,
        sessionId: session.sessionId,
        videoId: video.id,
        videoTitle: video.title,
        closeUrl: session.closeUrl,
        lockedAmount: session.price.toString(),
        createdAt: Date.now(),
      });
      this.set({
        session,
        lockTx: settle.transaction || undefined,
        chargedCumulative: 0n,
        paidChunks: [],
        status: session.freePreviewChunks > 0 ? "preview" : "streaming",
      });
    } catch (error) {
      this.set({ status: "idle", error: describe(error) });
      throw error;
    }
  }

  /** Whether the chunk a segment belongs to still needs its voucher. */
  needsPayment(segmentIndex: number): boolean {
    const session = this.state.session;
    if (!session) return false;
    const chunk = chunkOfSegment(segmentIndex);
    if (chunk < session.freePreviewChunks) return false;
    return !this.state.paidChunks.includes(chunk);
  }

  /**
   * Segment fetch for an unpaid chunk, serialised on the channel mutex. The voucher always rides on
   * the chunk's first segment (the server's paid route); when playback seeks onto the second
   * segment first, the first is paid (and discarded) before the requested one is fetched plainly.
   */
  fetchPaid(url: string, segmentIndex: number): Promise<Response> {
    return this.mutex.run(async () => {
      if (!this.payment) throw new PaymentError("no payment client");
      if (!this.needsPayment(segmentIndex)) return fetch(url);
      const chunk = chunkOfSegment(segmentIndex);
      const firstIndex = chunk * SEGMENTS_PER_CHUNK;
      const firstUrl = url.replace(/seg-\d+\.ts/, `seg-${String(firstIndex).padStart(4, "0")}.ts`);
      const response = await this.payment.fetchWithPayment(firstUrl);
      const settle = this.readSettle(response);
      if (response.status === 402 || !response.ok) {
        throw new PaymentError(
          settle?.errorMessage ?? `Payment for chunk ${chunk} failed (${response.status})`,
          settle?.errorReason,
          response.status,
        );
      }
      if (settle?.success) this.onChunkPaid(chunk, settle);
      if (segmentIndex === firstIndex) return response;
      // Drain the paid body so the connection is reusable, then fetch the segment that was asked for.
      await response.arrayBuffer().catch(() => undefined);
      return fetch(url);
    });
  }

  private onChunkPaid(chunk: number, settle: ReturnType<typeof decodePaymentResponseHeader>): void {
    const session = this.state.session;
    if (!session) return;
    const state = settle.extra?.channelState as { chargedCumulativeAmount?: string } | undefined;
    const paidChunks = this.state.paidChunks.includes(chunk)
      ? this.state.paidChunks
      : [...this.state.paidChunks, chunk].sort((a, b) => a - b);
    const chargedCumulative =
      state?.chargedCumulativeAmount !== undefined
        ? BigInt(state.chargedCumulativeAmount)
        : cumulativeAmount(session.price, paidChunks.length, session.pricedChunks);
    this.set({
      paidChunks,
      chargedCumulative,
      status: this.state.status === "preview" ? "streaming" : this.state.status,
    });
  }

  onTimeUpdate(currentTime: number, bufferedEnd: number): void {
    const activeChunk = Math.floor(currentTime / 5);
    if (
      activeChunk !== this.state.activeChunk ||
      Math.abs(currentTime - this.state.currentTime) > 0.25 ||
      Math.abs(bufferedEnd - this.state.bufferedEnd) > 0.25
    ) {
      this.set({ currentTime, activeChunk, bufferedEnd });
    }
  }

  /** The signing lane broke: stop at the last paid second and say so (design rule 7). */
  interrupt(error: unknown): void {
    if (this.state.status !== "streaming" && this.state.status !== "preview") return;
    this.media?.pause();
    this.hls?.stopLoad();
    this.set({ status: "interrupted", error: describe(error), pausedAt: this.media?.currentTime ?? this.state.currentTime });
  }

  retry(): void {
    if (this.state.status !== "interrupted") return;
    this.set({ status: "streaming", error: undefined });
    this.hls?.startLoad(this.media?.currentTime ?? -1);
    void this.media?.play().catch(() => undefined);
  }

  /**
   * Close: stop loading, publish the optimistic receipt, wait for in-flight vouchers, then send
   * the cooperative refund. The receipt flips to "settled" when the batch job reports a claim tx.
   */
  close(reason: "ended" | "leave" | "release" = "leave"): Promise<void> {
    if (this.closing) return this.closing;
    const { session, video, status } = this.state;
    if (!session || !video || !this.payment || !this.signer) return Promise.resolve();
    if (status === "closed" || status === "closing" || status === "idle" || status === "locking") {
      return Promise.resolve();
    }
    this.closing = (async () => {
      this.set({ status: "closing" });
      this.hls?.stopLoad();
      this.media?.pause();
      const watched = this.state.chargedCumulative;
      receiptsStore.getState().push({
        sessionId: session.sessionId,
        videoId: video.id,
        videoTitle: video.title,
        phase: "settling",
        locked: session.price,
        watched,
        watchedChunks: this.state.paidChunks.length,
        toCreator: watched,
        refunded: session.price - watched,
        createdAt: Date.now(),
      });
      await this.mutex.idle();
      let refundTx: string | undefined;
      try {
        if (watched < session.price) {
          const settle = await this.payment!.scheme.refund(session.closeUrl);
          refundTx = settle.transaction || undefined;
        } else {
          await api.closeSession(session.sessionId, "complete");
        }
      } catch (error) {
        // Best effort: mark the session closing so the sweeper refunds it; the wallet sheet also offers Release.
        await api.closeSession(session.sessionId, reason).catch(() => undefined);
        this.set({ error: describe(error) });
      }
      // The close route stops answering 402 once the session is over, so re-probing it here used to
      // throw and leave a ghost "active lock" behind. Use the id remembered at lock time.
      const channelId = session.channelId ?? (await this.channelIdFor(session).catch(() => undefined));
      if (channelId) await channelMeta.prune(this.signer!.evmAddress, channelId).catch(() => undefined);
      receiptsStore.getState().update(session.sessionId, { refundTx });
      this.set({ status: "closed" });
    })();
    return this.closing;
  }

  private readSettle(response: Response) {
    const header = response.headers.get("PAYMENT-RESPONSE");
    if (!header) return undefined;
    try {
      return decodePaymentResponseHeader(header);
    } catch {
      return undefined;
    }
  }

  private async channelIdFor(session: ViewingSession): Promise<`0x${string}`> {
    if (!this.payment) throw new Error("no payment client");
    const probe = await fetch(session.closeUrl);
    const header = probe.headers.get("PAYMENT-REQUIRED");
    if (probe.status !== 402 || !header) throw new Error("close route did not return payment requirements");
    const { decodePaymentRequiredHeader } = await import("@x402/core/http");
    const required = decodePaymentRequiredHeader(header);
    const accept = required.accepts.find(a => a.scheme === "batch-settlement");
    if (!accept) throw new Error("close route has no batch-settlement option");
    return computeChannelId(this.payment.scheme.buildChannelConfig(accept), accept.network);
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const engine = new SessionEngine();

// Dev hook for manual testing from the console (e.g. `__ht.engine.interrupt(new Error("outage"))`).
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __ht: { engine: SessionEngine } }).__ht = { engine };
}

export function useEngine<T>(selector: (state: EngineState) => T): T {
  return useStore(engine.store, selector);
}
