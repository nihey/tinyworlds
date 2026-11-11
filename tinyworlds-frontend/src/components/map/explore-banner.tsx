"use client";

import { ArrowRight } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { placesUrl } from "@/lib/explore";
import { siteEvent } from "@/lib/site-events";
import { cn } from "@/lib/utils";
import { HOME_URL, SITE_ID } from "@/site";
import { WORLDS } from "@/worlds";

/** The site's other places: every world but the one this map is of. */
const OTHERS = Object.values(WORLDS).filter((world) => world.id !== SITE_ID);

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
 * A small sign under the search box that says this map is one of several: how many other
 * places there are, and the way to them. It is always there, for everyone: most visitors land
 * on one map and never see the front page, and nothing about it is worth hiding it for.
 */
export function ExploreBanner({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t } = useI18n();
  if (OTHERS.length === 0) return null;
  return (
    // another build of the site, so a plain link
    <a
      href={placesUrl(HOME_URL)}
      data-rybbit-event="explore_more"
      data-rybbit-prop-world={SITE_ID}
      onClick={() => siteEvent("explore_more", { world: SITE_ID })}
      className={cn(
        "other-places sign group z-[5] flex items-center gap-2.5 py-2.5 pr-3 pl-3 text-[13px] leading-snug font-semibold text-paper outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)]",
        className,
      )}
      style={style}
    >
      <Skyline />
      <span className="min-w-0">{t.explore.more.replace("{n}", String(OTHERS.length))}</span>
      <ArrowRight
        aria-hidden
        className="size-4 shrink-0 text-taxi transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        strokeWidth={2.5}
      />
    </a>
  );
}
