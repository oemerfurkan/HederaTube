import { useEffect } from "react";
import { useParams } from "react-router";
import { useVideo } from "@/api/hooks";
import { engine, useEngine } from "@/payments/sessionMachine";
import { useWallet } from "@/features/wallet/WalletProvider";
import { Player } from "./Player";
import { TitleBlock } from "./TitleBlock";
import { DescriptionCard } from "./DescriptionCard";
import { SessionList } from "./SessionList";
import { MoreVideosRail } from "./MoreVideosRail";

/**
 * The demo itself (guide §6.4), laid out like YouTube's watch flexy: a fluid primary column and a
 * secondary one that keeps YouTube's 28.5 % share, 12 px above them, and one 16 px gutter left, between and right.
 */
export function WatchPage() {
  const { videoId = "" } = useParams();
  const video = useVideo(videoId);
  const wallet = useWallet();
  const status = useEngine(s => s.status);
  const activeSessionVideo = useEngine(s => s.session?.videoId);

  // Prepare the engine for this video; the lock cover depends on the balance.
  useEffect(() => {
    if (!video.data) return;
    if (activeSessionVideo === video.data.id && status !== "closed") return;
    if (status === "idle" || status === "insufficient" || status === "closed") {
      engine.prepare(video.data, wallet.signer, wallet.balance);
    }
  }, [video.data, wallet.signer, wallet.balance, activeSessionVideo, status]);

  // Leaving the page closes the session (refund); a different video resets the engine.
  useEffect(() => {
    return () => {
      void engine.close("leave").finally(() => engine.reset());
    };
  }, [videoId]);

  if (video.isLoading) return <div className="text-[14px] leading-5 text-muted-fg">Loading…</div>;
  if (!video.data) return <div className="text-[14px] leading-5 text-destructive">Video not found.</div>;
  const v = video.data;
  return (
    <div className="flex flex-col pt-3 lg:flex-row">
      <div className="grid min-w-0 flex-1 content-start gap-3 px-4 lg:pr-4">
        <Player video={v} />
        <TitleBlock video={v} />
        <DescriptionCard video={v} />
        <SessionList video={v} />
      </div>
      <div className="mt-6 px-4 lg:mt-0 lg:w-[28.5%] lg:min-w-[424px] lg:max-w-[560px] lg:shrink-0 lg:pl-0 lg:pr-4">
        <MoreVideosRail currentId={v.id} />
      </div>
    </div>
  );
}
