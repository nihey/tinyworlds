"use client";

import { ArrowRight, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { EXPLORE_KEY, invites, placesUrl, putAwayAt } from "@/lib/explore";
import { cn } from "@/lib/utils";
import { HOME_URL, SITE_ID } from "@/site";
import { WORLDS } from "@/worlds";

/** The site's other places: every world but the one this map is of. */
const OTHERS = Object.values(WORLDS).filter((world) => world.id !== SITE_ID);

/** Whether this visitor is invited, asked once when the map appears. */
function invited(): boolean {
  let putAway = 0;
  try {
    putAway = putAwayAt(window.localStorage.getItem(EXPLORE_KEY));
  } catch {
    // storage blocked: they are invited on every visit, and can still put it away for this one
  }
  return invites(OTHERS.length, putAway);
}

/** A skyline of four towers, each lit in another world's colour: the other places, in a glyph. */
function Skyline() {
  const heights = [7, 11, 14, 9];
  return (
    <svg
      aria-hidden
      viewBox="0 0 19 14"
      shapeRendering="crispEdges"
      className="h-3.5 w-[19px] shrink-0"
    >
      {heights.map((height, i) => (
        <rect
          key={i}
          x={i * 5}
          y={14 - height}
          width={4}
          height={height}
          fill={OTHERS[i % OTHERS.length].accent.color}
        />
      ))}
    </svg>
  );
}

/**
 * A small sign under the search box, for someone who landed on this map and may not know it is
 * one of several: how many other places there are, and the way to them. It can be put away, and
 * then stays away on every map until the site has grown (lib/explore.ts). Only ever mounted
 * in the browser, once the map is up, so it may ask the browser things as it starts.
 */
export function ExploreBanner({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t } = useI18n();
  const [shown, setShown] = useState(invited);
  if (!shown) return null;

  const putAway = () => {
    setShown(false);
    try {
      window.localStorage.setItem(EXPLORE_KEY, String(OTHERS.length));
    } catch {
      // this visit only
    }
  };

  return (
    <div className={cn("other-places sign z-[5] flex items-center", className)} style={style}>
      {/* another build of the site, so a plain link */}
      <a
        href={placesUrl(HOME_URL)}
        data-rybbit-event="explore_more"
        data-rybbit-prop-world={SITE_ID}
        className="group flex min-w-0 items-center gap-2.5 rounded-l-[10px] py-2.5 pr-1 pl-3 text-[13px] leading-snug font-semibold text-paper outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--taxi)]"
      >
        <Skyline />
        <span className="min-w-0">{t.explore.more.replace("{n}", String(OTHERS.length))}</span>
        <ArrowRight
          aria-hidden
          className="size-4 shrink-0 text-taxi transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          strokeWidth={2.5}
        />
      </a>
      <button
        type="button"
        aria-label={t.explore.dismiss}
        onClick={putAway}
        data-rybbit-event="explore_dismiss"
        data-rybbit-prop-world={SITE_ID}
        className="bullet mr-1 ml-0.5 size-7 text-paper-dim hover:text-paper"
      >
        <X aria-hidden className="size-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
