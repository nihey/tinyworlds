"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/** How much of the picture must be on screen before its loop plays. */
const IN_VIEW = 0.4;

interface MovingPictureProps {
  /** the still: shown first, and all there is for visitors who asked for less motion or less data */
  still: string;
  /** the still at other sizes, and how wide it is shown: the browser takes the one it needs */
  srcSet?: string;
  sizes?: string;
  /**
   * The still in a few hundred bytes (a data: URL), shown blurred until the still is there: the
   * frame opens on the picture's shapes and colours, never on an empty plate.
   */
  preview?: string;
  /** a silent loop that opens on the still's own picture, so one takes over from the other unseen */
  loop: string;
  alt: string;
  /** what to show when the still is not there (a world not deployed yet) */
  fallback?: ReactNode;
  /** load the still at once: it is at the top of the page */
  eager?: boolean;
  /** prepare a carousel slide and tell it when its still or fallback can be shown */
  onStillReady?: () => void;
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

/** Whether the page has finished loading (its `load` event): what a film waits for. */
function usePageLoaded(): boolean {
  return useSyncExternalStore(
    (changed) => {
      window.addEventListener("load", changed);
      return () => window.removeEventListener("load", changed);
    },
    () => document.readyState === "complete",
    () => false,
  );
}

/**
 * A still that comes alive. The loop waits until the still is ready, the page has loaded and the
 * picture is on screen (and is the one being shown), plays while it stays there and stops when it leaves; it is never fetched
 * under `prefers-reduced-motion` or a data-saving connection, and if it cannot play the still
 * simply stays.
 */
export function MovingPicture({
  still,
  srcSet,
  sizes,
  preview,
  loop,
  alt,
  fallback,
  eager,
  onStillReady,
  active = true,
  className,
  style,
  focus = "center",
}: MovingPictureProps) {
  const fit = focus === "right" ? "object-cover object-right" : "object-cover";
  const bgFit = focus === "right" ? "bg-right" : "bg-center";
  const frame = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const film = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState<{ still: string; missing: boolean } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const settled = loaded?.still === still;
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");
  const pageLoaded = usePageLoaded();

  const finishStill = useCallback(
    (img: HTMLImageElement) => {
      const finish = () => {
        if (picture.current === img) setLoaded({ still, missing: img.naturalWidth === 0 });
      };
      // A fetched picture may still be decoding. Keep the previous slide visible in the meantime.
      void img.decode().then(finish, finish);
    },
    [still],
  );

  // A picture that loaded (or failed) before hydration may never send us an event.
  useEffect(() => {
    const img = picture.current;
    if (img?.complete) finishStill(img);
  }, [finishStill]);

  useEffect(() => {
    if (settled) onStillReady?.();
  }, [onStillReady, settled]);

  useEffect(() => {
    const box = frame.current;
    const video = film.current;
    // a film waits for the page: until it has loaded, the stills and the code come first
    if (!box || !video || calm || !active || !settled || !pageLoaded) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (connection?.saveData || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver(
      (entries) => {
        // the last word of a delivery is how things stand (out of view and back in at once)
        const entry = entries.at(-1);
        if (entry && entry.intersectionRatio >= IN_VIEW) {
          if (!video.hasAttribute("src")) video.src = loop;
          // the browser may refuse (no autoplay): the still stays, which is fine
          void video.play().catch(() => undefined);
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
  }, [calm, active, loop, settled, pageLoaded]);

  return (
    <div
      ref={frame}
      className={cn("relative overflow-hidden bg-sign-raised", className)}
      style={style}
    >
      {preview && !settled && (
        // under the still, blurred, and grown a little so the blur keeps a clean edge
        <div
          aria-hidden
          className={cn("absolute inset-0 scale-110 bg-cover blur-xl", bgFit)}
          style={{ backgroundImage: `url("${preview}")` }}
        />
      )}
      {!(settled && loaded.missing) ? (
        // eslint-disable-next-line @next/next/no-img-element -- a plain file, no optimizer in a static export
        <img
          key={still}
          ref={picture}
          src={still}
          srcSet={srcSet}
          sizes={srcSet ? sizes : undefined}
          alt={alt}
          loading={eager || onStillReady ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : undefined}
          onLoad={(event) => finishStill(event.currentTarget)}
          onError={() => setLoaded({ still, missing: true })}
          className={cn("absolute inset-0 size-full", fit)}
        />
      ) : (
        <div role="img" aria-label={alt} className="absolute inset-0 grid place-items-center">
          {fallback}
        </div>
      )}
      {!calm && (
        <video
          key={loop}
          ref={film}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden
          tabIndex={-1}
          onPlaying={() => setPlaying(loop)}
          className={cn(
            "pointer-events-none absolute inset-0 size-full transition-opacity duration-300",
            fit,
            playing === loop ? "opacity-100" : "opacity-0",
          )}
        />
      )}
    </div>
  );
}
