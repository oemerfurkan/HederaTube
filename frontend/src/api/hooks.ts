import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { queryKeys } from "@/lib/queryKeys";

export function useVideos(filter?: string) {
  return useQuery({ queryKey: [...queryKeys.videos, filter ?? "all"], queryFn: () => api.listVideos({ filter }) });
}

export function useVideo(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.video(id ?? ""), queryFn: () => api.getVideo(id!), enabled: !!id });
}

export function useVideoSessions(videoId: string | undefined, tab: "recent" | "top", live = true) {
  return useQuery({
    queryKey: queryKeys.videoSessions(videoId ?? "", tab),
    queryFn: () => api.videoSessions(videoId!, tab),
    enabled: !!videoId,
    refetchInterval: live ? 2500 : false,
  });
}

/** Whether this wallet already liked the video, so the heart comes back filled after a reload. */
export function useLikeState(videoId: string | undefined, viewer: string | undefined) {
  return useQuery({
    queryKey: queryKeys.videoLike(videoId ?? "", viewer ?? ""),
    queryFn: () => api.likeState(videoId!, viewer!),
    enabled: !!videoId && !!viewer,
  });
}

export function useReceiptQuery(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.receipt(sessionId),
    queryFn: () => api.receipt(sessionId),
    enabled,
    refetchInterval: query => (query.state.data?.status === "settled" ? false : 3000),
  });
}

export function useBalanceQuery(address: string | undefined, mockLedger: boolean) {
  return useQuery({
    queryKey: queryKeys.balance(address ?? ""),
    queryFn: async () => BigInt((await api.balance(address!)).balance),
    enabled: !!address && mockLedger,
    refetchInterval: 4000,
  });
}

export function useMe(address: string | undefined) {
  return useQuery({ queryKey: queryKeys.me(address ?? ""), queryFn: () => api.me(address!), enabled: !!address });
}

export function useEarnings(address: string | undefined) {
  return useQuery({
    queryKey: queryKeys.earnings(address ?? ""),
    queryFn: () => api.earnings(address!),
    enabled: !!address,
    refetchInterval: 5000,
  });
}

export function useChannel(handle: string | undefined) {
  return useQuery({ queryKey: queryKeys.channel(handle ?? ""), queryFn: () => api.channel(handle!), enabled: !!handle });
}

export function useRunBatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.runBatch,
    onSuccess: () => {
      void client.invalidateQueries();
    },
  });
}
