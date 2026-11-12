"use client";

import { ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";
import { BroughtByPlaque } from "@/components/benefactors/brought-by";
import { PixelIcon } from "@/components/benefactors/pixel-badge";
import { MovingPicture } from "@/components/home/moving-picture";
import { Wordmark } from "@/components/map/wordmark";
import { useI18n } from "@/hooks/use-i18n";
import type { BroughtWorld } from "@/lib/brought-by";
import { cn } from "@/lib/utils";
import { visitsLine, type WorldCount } from "@/lib/visits";
import { hallCityUrl, worldCardUrl, worldLoopUrl, worldUrl } from "@/site";
import type { World } from "@/worlds";

/** A card lifts under the pointer and lights up in its world's own colour (`--card`). */
const CARD =
  "group sign relative flex h-full flex-col overflow-hidden transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_0_0_2px_var(--card),0_18px_36px_-14px_rgb(0_0_0/0.7)]";

/** The link that is the whole card: its name, stretched over everything but the buttons. */
const WHOLE =
  "outline-none after:absolute after:inset-0 after:rounded-[10px] after:content-[''] focus-visible:after:shadow-[inset_0_0_0_3px_var(--taxi)]";

const lit = (world: World) => ({ "--card": world.accent.color }) as CSSProperties;

/**
 * A world's picture on its card: its share card, which starts to drift once the card is on
 * screen (the loop opens on the card's own framing, wordmark and all). Until a world has a
 * share card where the front page looks for it, its name on a plain plate.
 */
function CardPicture({ world, alt }: { world: World; alt: string }) {
  return (
    <MovingPicture
      still={worldCardUrl(world.id)}
      loop={worldLoopUrl(world.id)}
      alt={alt}
      className="aspect-[1200/630] w-full"
      fallback={
        <Wordmark suffix={world.wordmark} accent={world.accent.color} className="text-4xl" />
      }
    />
  );
}

/**
 * Under a card's text: every visit its map has had, and how many are exploring it now once
 * that is more than ten. The line's height is there from the start, so a card does not grow
 * when the counts arrive; until then (or if they never do) it says nothing.
 */
function VisitsLine({ count, className }: { count: WorldCount | undefined; className?: string }) {
  const { t, locale } = useI18n();
  const line = visitsLine(count, locale, t.home);
  return (
    <p
      className={cn(
        // box-content: the line's height is kept for its words, whatever padding it is given
        "box-content flex min-h-4 flex-wrap items-center gap-x-2.5 text-xs leading-4 font-semibold text-paper-dim tabular-nums",
        className,
      )}
    >
      {line.visits && <span>{line.visits}</span>}
      {line.live && (
        <span className="inline-flex items-center gap-1.5 text-paper">
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-(--card) motion-safe:animate-pulse"
          />
          {line.live}
        </span>
      )}
    </p>
  );
}

/**
 * A world on the front page: its picture, its name and what it is, how visited it is, and at
 * its foot what can be done with it, in words: explore it, or see who paid for it. The card is
 * one link to the world (its name, stretched over the card); the benefactors' button lies over
 * it as its sibling, never inside it.
 *
 * A city its benefactors brought to the map says so: a gold bar along its top and, under its
 * words, their plaque ("Brought to you by 2 benefactors, who donated $35"), which leads to the
 * city's hall of fame and takes the benefactors' button's place.
 */
export function WorldCard({
  world,
  count,
  showVisits,
  onBenefactors,
  brought,
}: {
  world: World;
  count: WorldCount | undefined;
  /** the build has an API: the card keeps a line for its visits, said or not */
  showVisits: boolean;
  /** the world has a city the API knows: the card offers its benefactors */
  onBenefactors?: () => void;
  /** the world's city is on the map because its benefactors paid for it: who they were */
  brought?: BroughtWorld;
}) {
  const { t, locale } = useI18n();
  const copy = world.copy[locale];
  return (
    <div className={CARD} style={lit(world)}>
      {brought && <div aria-hidden className="h-[3px] shrink-0 bg-taxi" />}
      <CardPicture world={world} alt={copy.cardAlt} />
      <div className="flex flex-1 flex-col px-4 pt-3.5 pb-2.5">
        <h3 className="text-lg leading-tight font-semibold text-paper">
          <a href={worldUrl(world.id)} className={WHOLE}>
            {copy.city}
          </a>
        </h3>
        <p className="pt-1 text-sm leading-snug text-paper-dim">{copy.card}</p>
        {showVisits && <VisitsLine count={count} className="pt-2" />}
        {brought && (
          <BroughtByPlaque
            by={brought}
            href={hallCityUrl(brought.slug)}
            where={t.hall.openCity.replace("{city}", brought.name)}
            // over the card's own link, as the benefactors' button is
            className="relative z-10 mt-3"
          />
        )}
        <div className="mt-auto pt-3">
          <div className="flex min-h-10 items-center justify-between gap-3 border-t border-sign-line pt-2.5">
            <span
              aria-hidden
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-paper transition-colors group-hover:text-(--card)"
            >
              {t.home.exploreShort}
              <ArrowUpRight
                className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={2.25}
              />
            </span>
            {onBenefactors && !brought && (
              <button
                type="button"
                onClick={onBenefactors}
                aria-label={t.home.benefactorsOf.replace("{city}", copy.city)}
                className="relative z-10 inline-flex h-7 items-center gap-1.5 rounded-full border border-paper/15 px-2.5 text-xs font-semibold text-paper transition-colors outline-none hover:border-taxi hover:text-taxi focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
              >
                <PixelIcon art="founding" />
                {t.benefactors.benefactors}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A world in a few words, for a row of several: its picture, its name and its visits. */
export function SmallWorldCard({ world, count }: { world: World; count: WorldCount | undefined }) {
  const { locale } = useI18n();
  const copy = world.copy[locale];
  return (
    <div className={CARD} style={lit(world)}>
      <CardPicture world={world} alt={copy.cardAlt} />
      <div className="flex flex-1 flex-col px-3 pt-2.5 pb-2.5">
        <h3 className="flex items-start justify-between gap-2 text-[15px] leading-tight font-semibold text-paper">
          <a href={worldUrl(world.id)} className={cn(WHOLE, "min-w-0")}>
            {copy.city}
          </a>
          <ArrowUpRight
            aria-hidden
            className="size-4 shrink-0 text-paper-dim transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-(--card)"
            strokeWidth={2.25}
          />
        </h3>
        <VisitsLine count={count} className="pt-1.5" />
      </div>
    </div>
  );
}
