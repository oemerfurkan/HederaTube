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
  const hasSession = useEngine(s => !!s.session);
  const engineVideoId = useEngine(s => s.video?.id);

  // Prepare the engine for this video; the lock cover depends on the balance. While a session is
  // around (this video's, or the previous video's still refunding) the engine is not ours to touch:
  // the reset after that close clears it and this runs again.
  useEffect(() => {
    if (!video.data || hasSession) return;
    if (status === "idle" || status === "insufficient") engine.prepare(video.data, wallet.signer, wallet.balance);
  }, [video.data, wallet.signer, wallet.balance, hasSession, engineVideoId, status]);

  // Leaving the page, or picking another video, closes the session (refund) and resets the engine.
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
        {/* a fresh player per video: new poster, no last frame or buffer carried over */}
        <Player key={v.id} video={v} />
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
