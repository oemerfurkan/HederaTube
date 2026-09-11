import { useEffect, useLayoutEffect } from "react";
import { useParams } from "react-router";
import { useVideo } from "@/api/hooks";
import { engine, useEngine } from "@/payments/sessionMachine";
import { useWallet } from "@/features/wallet/WalletProvider";
import { Player } from "./Player";
import { TitleBlock } from "./TitleBlock";
import { DescriptionCard } from "./DescriptionCard";
import { SessionList } from "./SessionList";
import { MoreVideosRail } from "./MoreVideosRail";
import { playFlipInto } from "@/features/motion/flip";

/** The demo itself (guide §6.4). Two columns: 1fr and a fixed 380 px rail; single column under 1200 px. */
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

  useLayoutEffect(() => {
    if (video.data) playFlipInto(video.data.id);
  }, [video.data]);

  if (video.isLoading) return <div className="text-small text-muted-fg">Loading…</div>;
  if (!video.data) return <div className="text-small text-destructive">Video not found.</div>;
  const v = video.data;
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
      <div className="grid content-start gap-6">
        <Player video={v} />
        <TitleBlock video={v} />
        <DescriptionCard video={v} />
        <SessionList video={v} />
      </div>
      <MoreVideosRail currentId={v.id} />
    </div>
  );
}
