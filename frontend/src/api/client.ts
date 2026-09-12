import type {
  ChannelResponse,
  EarningsResponse,
  Me,
  OpenSessionResponse,
  PresignResponse,
  ReceiptResponse,
  SessionListResponse,
  Video,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(path, {
    ...rest,
    headers: {
      accept: "application/json",
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await response.text();
  const body = text ? safeJson(text) : undefined;
  if (!response.ok) {
    const errorField =
      body && typeof body === "object" && "error" in body ? (body as { error?: unknown }).error : undefined;
    const message = errorField ? String(errorField) : `${response.status} ${response.statusText}`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  listVideos: (params?: { filter?: string }) =>
    request<Video[]>(`/api/videos${params?.filter ? `?filter=${encodeURIComponent(params.filter)}` : ""}`),
  getVideo: (id: string) => request<Video>(`/api/videos/${id}`),
  openSession: (videoId: string, viewer: string) =>
    request<OpenSessionResponse>("/api/session/lock", { method: "POST", json: { videoId, viewer } }),
  /** Marks a session closing (used by pagehide with keepalive and as the fallback when refund fails). */
  closeSession: (sessionId: string, reason: string) =>
    request<{ ok: true }>("/api/session/close", {
      method: "POST",
      json: { sessionId, reason },
      keepalive: true,
    }),
  receipt: (sessionId: string) => request<ReceiptResponse>(`/api/session/${sessionId}/receipt`),
  videoSessions: (videoId: string, tab: "recent" | "top", page = 1) =>
    request<SessionListResponse>(`/api/video/${videoId}/sessions?tab=${tab}&page=${page}`),
  balance: (address: string) =>
    request<{ address: string; balance: string }>(`/api/wallet/balance?address=${address}`),
  faucet: (address: string) =>
    request<{ txId: string; accountId: string }>("/api/onboard/faucet", { method: "POST", json: { address } }),
  me: (address: string) => request<Me>(`/api/me?address=${address}`),
  earnings: (address: string) => request<EarningsResponse>(`/api/me/earnings?address=${address}`),
  channel: (handle: string) => request<ChannelResponse>(`/api/channel/${handle}`),
  likeState: (videoId: string, viewer: string) =>
    request<{ likes: number; liked: boolean }>(`/api/video/${videoId}/like?viewer=${viewer}`),
  like: (videoId: string, viewer: string) =>
    request<{ likes: number; liked: boolean }>(`/api/video/${videoId}/like`, { method: "POST", json: { viewer } }),
  presign: (file: { name: string; size: number; type: string }, address: string, accountId?: string) =>
    request<PresignResponse>("/api/upload/presign", { method: "POST", json: { ...file, address, accountId } }),
  completeUpload: (body: {
    videoId: string;
    key: string;
    title: string;
    description: string;
    recipient: string;
    durationSeconds: number;
    address: string;
    accountId?: string;
  }) => request<Video>("/api/upload/complete", { method: "POST", json: body }),
  publish: (body: { videoId: string; totalPrice: string; freePreviewChunks: number; address: string; accountId?: string }) =>
    request<Video>("/api/upload/publish", { method: "POST", json: body }),
  // World ID (parked): re-enable together with features/verify/VerifyPage.tsx and the backend verify router.
  // worldRequest: (address: string) =>
  //   request<{ rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string }>("/api/verify/world/request", {
  //     method: "POST",
  //     json: { address },
  //   }),
  // verifyWorld: (body: { address: string; accountId?: string; proof: unknown; handle: string; displayName: string }) =>
  //   request<Me>("/api/verify/world", { method: "POST", json: body }),
  runBatch: () => request<{ settled: number; txHash: string | null }>("/api/dev/run-batch", { method: "POST" }),
  resetMock: () => request<{ ok: true }>("/api/dev/reset", { method: "POST" }),
};
