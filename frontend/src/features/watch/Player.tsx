import { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { cn } from "@/design/ui";
import { engine, useEngine } from "@/payments/sessionMachine";
import { hlsConfigFor } from "@/payments/hlsPaidLoader";
import { LockCover } from "./LockCover";
import { PlayerControls } from "./Scrubber";
import { InterruptedBanner } from "./InterruptedBanner";
import type { Video } from "@/api/types";

const HIDE_AFTER_MS = 2500;

/** 16:9, 12 px corner, Ink. YouTube-style overlay controls that auto-hide while playing; fullscreen on the wrapper. */
export function Player({ video }: { video: Video }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const session = useEngine(s => s.session);
  const status = useEngine(s => s.status);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  // The previous video's session can still be refunding after a switch; it never plays in this player.
  const foreign = !!session && session.videoId !== video.id;
  const playing = !foreign && (status === "preview" || status === "streaming");
  const covered = foreign || status === "idle" || status === "insufficient" || status === "locking";

  const wake = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    const m = mediaRef.current;
    if (m && !m.paused) hideTimer.current = setTimeout(() => setControlsVisible(false), HIDE_AFTER_MS);
  }, []);

  const togglePlay = useCallback(() => {
    const m = mediaRef.current;
    if (!m || !playing) return;
    if (m.paused) void m.play().catch(() => undefined);
    else m.pause();
    wake();
  }, [playing, wake]);

  const toggleMute = useCallback(() => {
    const m = mediaRef.current;
    if (!m) return;
    m.muted = !m.muted;
    setMuted(m.muted);
    wake();
  }, [wake]);

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current as FullscreenElement | null;
    const media = mediaRef.current as FullscreenVideo | null;
    if (!el) return;
    const doc = document as FullscreenDocument;
    if (fullscreenElement()) {
      void Promise.resolve((doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc)).catch(() => undefined);
    } else if (media?.webkitDisplayingFullscreen) {
      media.webkitExitFullscreen?.();
    } else if (el.requestFullscreen || el.webkitRequestFullscreen) {
      // Wrapper fullscreen keeps our controls and the money counter on screen (desktop, Android, iPad).
      const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
      void Promise.resolve(request?.call(el))
        .then(() => lockLandscape())
        .catch(() => media?.webkitEnterFullscreen?.());
    } else {
      // iPhone Safari only lets the <video> itself go fullscreen, with the native controls.
      media?.webkitEnterFullscreen?.();
    }
    wake();
  }, [wake]);

  useEffect(() => {
    const onChange = () => {
      const active = fullscreenElement() === wrapperRef.current;
      setFullscreen(active);
      if (!active) unlockOrientation();
    };
    const media = mediaRef.current;
    const onNativeEnd = () => {
      // Returning from the iPhone native player can leave the element paused without an event.
      const m = mediaRef.current;
      if (m) setPaused(m.paused);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    media?.addEventListener("webkitendfullscreen", onNativeEnd);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      media?.removeEventListener("webkitendfullscreen", onNativeEnd);
    };
  }, []);

  // Keyboard: space/k play-pause, f fullscreen, m mute, arrows seek 5 s.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const m = mediaRef.current;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          toggleMute();
          break;
        case "ArrowRight":
          if (m && playing) m.currentTime = Math.min(m.duration || video.duration_seconds, m.currentTime + 5);
          wake();
          break;
        case "ArrowLeft":
          if (m && playing) m.currentTime = Math.max(0, m.currentTime - 5);
          wake();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, toggleFullscreen, toggleMute, playing, wake, video.duration_seconds]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !session || session.videoId !== video.id) return;
    if (!Hls.isSupported()) {
      engine.interrupt(new Error("Media Source Extensions are not available in this browser"));
      return;
    }
    const hls = new Hls(hlsConfigFor(engine));
    engine.attach(hls, media);
    // Listeners first, then source, then media: MEDIA_ATTACHED can fire synchronously.
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      hls.startLoad(0);
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
    const onPlay = () => {
      setPaused(false);
      wake();
    };
    const onPause = () => {
      setPaused(true);
      setControlsVisible(true);
      clearTimeout(hideTimer.current);
    };
    const onEnded = () => void engine.close("ended");
    media.addEventListener("timeupdate", onTime);
    media.addEventListener("progress", onTime);
    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("ended", onEnded);
    return () => {
      media.removeEventListener("timeupdate", onTime);
      media.removeEventListener("progress", onTime);
      media.removeEventListener("play", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("ended", onEnded);
      engine.detach(hls);
      hls.destroy();
      clearTimeout(hideTimer.current);
    };
  }, [session, video.id, wake]);

  const showControls = !covered && (controlsVisible || paused);
  return (
    <div
      ref={wrapperRef}
      className={cn(
        "group/player relative overflow-hidden bg-black",
        fullscreen ? "h-screen w-screen rounded-none" : "aspect-video rounded-md",
        !showControls && playing && !paused && "cursor-none",
      )}
      onMouseMove={wake}
      onClick={togglePlay}
      onDoubleClick={toggleFullscreen}
    >
      <video ref={mediaRef} className="size-full object-contain" playsInline poster={video.thumbnail_url} />
      <PlayerControls
        video={video}
        mediaRef={mediaRef}
        visible={showControls}
        muted={muted}
        fullscreen={fullscreen}
        paused={paused}
        onTogglePlay={togglePlay}
        onToggleMute={toggleMute}
        onToggleFullscreen={toggleFullscreen}
      />
      <LockCover video={video} />
      {status === "interrupted" && !foreign ? <InterruptedBanner /> : null}
    </div>
  );
}

type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FullscreenElement = HTMLDivElement & { webkitRequestFullscreen?: () => void };
type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

function fullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

/** Phones play fullscreen video sideways; browsers without the API (or desktop) just refuse. */
function lockLandscape() {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  void orientation?.lock?.("landscape").catch(() => undefined);
}

function unlockOrientation() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // not locked, or not supported
  }
}
