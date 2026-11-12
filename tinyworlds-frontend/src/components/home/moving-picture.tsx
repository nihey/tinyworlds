"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/** How much of the picture must be on screen before its loop plays. */
const IN_VIEW = 0.4;

interface MovingPictureProps {
  /** the still: shown first, and all there is for visitors who asked for less motion or less data */
  still: string;
  /** a silent loop that opens on the still's own picture, so one takes over from the other unseen */
  loop: string;
  alt: string;
  /** what to show when the still is not there (a world not deployed yet) */
  fallback?: ReactNode;
  /** load the still at once: it is at the top of the page */
  eager?: boolean;
  /**
   * Whether this is the picture being shown (the hero's current slide). One that is not keeps
   * its still, or the frame it stopped on, and fetches and plays nothing.
   */
  active?: boolean;
  /** sizes the frame: the picture fills it */
  className?: string;
  /**
   * Which side of the picture a frame of another shape keeps: its middle, or its right (a
   * share card's wordmark is at its bottom left, and a tall frame would cut through it).
   */
  focus?: "center" | "right";
  style?: CSSProperties;
}

/**
 * A still that comes alive. The loop is fetched only once the picture is on screen (and is the
 * one being shown), plays while it stays there and stops when it leaves; it is never fetched
 * under `prefers-reduced-motion` or a data-saving connection, and if it cannot play the still
 * simply stays.
 */
export function MovingPicture({
  still,
  loop,
  alt,
  fallback,
  eager,
  active = true,
  className,
  style,
  focus = "center",
}: MovingPictureProps) {
  const fit = focus === "right" ? "object-cover object-right" : "object-cover";
  const frame = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const film = useRef<HTMLVideoElement>(null);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");

  // a picture that failed before the page came alive never tells: ask it
  useEffect(() => {
    const img = picture.current;
    if (img && img.complete && img.naturalWidth === 0) setMissing(true);
  }, []);

  useEffect(() => {
    const box = frame.current;
    const video = film.current;
    if (!box || !video || calm || !active) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (connection?.saveData) return;
    const watcher = new IntersectionObserver(
      (entries) => {
        // the last word of a delivery is how things stand (out of view and back in at once)
        if (entries.at(-1)?.isIntersecting) {
          // the browser may refuse (no autoplay): the still stays, which is fine
          video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: IN_VIEW },
    );
    watcher.observe(box);
    return () => {
      watcher.disconnect();
      video.pause();
    };
  }, [calm, active]);

  return (
    <div
      ref={frame}
      className={cn("relative overflow-hidden bg-sign-raised", className)}
      style={style}
    >
      {!missing ? (
        // eslint-disable-next-line @next/next/no-img-element -- a plain file, no optimizer in a static export
        <img
          ref={picture}
          src={still}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : undefined}
          onError={() => setMissing(true)}
          className={cn("absolute inset-0 size-full", fit)}
        />
      ) : (
        <div role="img" aria-label={alt} className="absolute inset-0 grid place-items-center">
          {fallback}
        </div>
      )}
      {!calm && (
        <video
          ref={film}
          src={loop}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          className={cn(
            "pointer-events-none absolute inset-0 size-full transition-opacity duration-300",
            fit,
            playing ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
