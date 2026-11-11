"use client";

import { ArrowUpRight, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { placeSign, signContent } from "@/lib/sight-sign";
import type { MapEngine } from "@/map/engine";
import type { Sight, SightText } from "@/map/sights";
import { cn } from "@/lib/utils";

/** The map's own signs at the top, which the building's sign must not slide under. */
const MAP_SIGNS =
  '.map-root [role="search"], .map-root .other-places, .map-root .quiz-invite, .map-root .quiz-card, .map-root nav';

interface SightSignProps {
  engine: MapEngine;
  sight: Sight;
  /** its article in the visitor's language (or English); undefined when it has none or it is still loading */
  text: SightText | undefined;
  /** pinned by a click or a tap: it takes the pointer, and can be closed */
  pinned: boolean;
  onClose: () => void;
}

/**
 * The sign beside a lit building: what it is, where, a line or two from its Wikipedia article and
 * the way to the rest. It follows the building as the map moves (through a ref, not React state).
 */
export function SightSign({ engine, sight, text, pinned, onClose }: SightSignProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const content = signContent(sight, text, t);

  const place = useCallback(() => {
    const el = ref.current;
    const anchor = engine.sightAnchor(sight.id);
    if (!el || !anchor) return;
    const view = engine.getView();
    const over = [...document.querySelectorAll<HTMLElement>(MAP_SIGNS)]
      .map((sign) => sign.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
    const { x, y } = placeSign(
      anchor,
      { w: el.offsetWidth, h: el.offsetHeight },
      { w: view.width, h: view.height },
      over,
    );
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }, [engine, sight.id]);

  // again whenever what it says changes its size
  useLayoutEffect(place, [place, text, pinned, t]);
  useEffect(() => engine.on("view", place), [engine, place]);

  return (
    <div
      ref={ref}
      // not a dialog: the map's keys (Esc above all) keep working while it is pinned
      role={pinned ? "group" : "status"}
      aria-label={content.name}
      className={cn(
        "sign fixed top-0 left-0 z-[4] w-[17.5rem] max-w-[calc(100vw-1rem)] px-3.5 pt-3 pb-3",
        pinned ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      {pinned && (
        <button
          type="button"
          aria-label={t.dialog.close}
          onClick={onClose}
          className="bullet absolute top-2 right-2 size-7 text-paper-dim hover:text-paper"
        >
          <X className="size-3.5" strokeWidth={2.25} />
        </button>
      )}
      <p
        className={cn(
          "text-[10.5px] leading-snug font-semibold tracking-[0.12em] text-taxi uppercase",
          pinned && "pr-8",
        )}
      >
        {content.kicker}
      </p>
      <p className={cn("mt-0.5 text-[17px] leading-tight font-bold", pinned && "pr-8")}>
        {content.name}
      </p>
      {content.text && (
        <p lang={content.lang} className="mt-1.5 text-[13px] leading-snug text-paper/85">
          {content.text}
        </p>
      )}
      {content.link && (
        <a
          href={content.link.href}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={pinned ? 0 : -1}
          className="mt-2.5 flex items-center gap-1 border-t border-sign-line pt-2 text-[12.5px] font-semibold text-taxi hover:underline"
        >
          {content.link.label}
          <ArrowUpRight className="size-3.5" strokeWidth={2.25} />
        </a>
      )}
    </div>
  );
}
