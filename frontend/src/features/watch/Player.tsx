import { useEffect, useRef } from "react";
import Hls from "hls.js";
import { engine, useEngine } from "@/payments/sessionMachine";
import { hlsConfigFor } from "@/payments/hlsPaidLoader";
import { LockCover } from "./LockCover";
import { Scrubber } from "./Scrubber";
import { InterruptedBanner } from "./InterruptedBanner";
import type { Video } from "@/api/types";

/** 16:9, 12 px corner, Ink. hls.js is created once the session is locked. */
export function Player({ video }: { video: Video }) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | undefined>(undefined);
  const session = useEngine(s => s.session);
  const status = useEngine(s => s.status);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !session) return;
    if (!Hls.isSupported()) {
      engine.interrupt(new Error("Media Source Extensions are not available in this browser"));
      return;
    }
    const hls = new Hls(hlsConfigFor(engine));
    hlsRef.current = hls;
    engine.attach(hls, media);
    // Listeners first, then source, then media: MEDIA_ATTACHED can fire synchronously and a
    // listener registered after attachMedia misses it (no playlist would ever load).
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void media.play().catch(() => undefined);
    });
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal && data.type !== Hls.ErrorTypes.NETWORK_ERROR) engine.interrupt(new Error(data.details));
    });
    hls.loadSource(session.playlistUrl);
    hls.attachMedia(media);
    const onTime = () => {
      const buffered = media.buffered;
      let end = 0;
      for (let i = 0; i < buffered.length; i += 1) {
        if (buffered.start(i) <= media.currentTime && buffered.end(i) > end) end = buffered.end(i);
      }
      engine.onTimeUpdate(media.currentTime, end);
    };
    const onEnded = () => void engine.close("ended");
    media.addEventListener("timeupdate", onTime);
    media.addEventListener("progress", onTime);
    media.addEventListener("ended", onEnded);
    return () => {
      media.removeEventListener("timeupdate", onTime);
      media.removeEventListener("progress", onTime);
      media.removeEventListener("ended", onEnded);
      hls.destroy();
      hlsRef.current = undefined;
    };
  }, [session]);

  const playing = status === "preview" || status === "streaming";
  return (
    <div className="grid gap-3">
      <div className="relative aspect-video overflow-hidden rounded-md bg-ink" data-flip-id={`player-${video.id}`}>
        <video
          ref={mediaRef}
          className="size-full"
          playsInline
          poster={video.thumbnail_url}
          onClick={() => {
            const m = mediaRef.current;
            if (!m || !playing) return;
            if (m.paused) void m.play();
            else m.pause();
          }}
        />
        <LockCover video={video} />
        {status === "interrupted" ? <InterruptedBanner /> : null}
      </div>
      <Scrubber video={video} mediaRef={mediaRef} />
    </div>
  );
}
