"use client";

import { ArrowDown, Heart } from "lucide-react";
import { NewCitiesButton } from "@/components/lists/new-cities-button";
import { MilestoneBar } from "@/components/donate/milestone-bar";
import { ACTION, QUIET } from "@/components/styles";
import type { Milestones } from "@/hooks/use-milestones";
import { useI18n } from "@/hooks/use-i18n";
import { defaultGoal, leading, rankCities, withGoal } from "@/lib/city-picker";
import { tileSpan } from "@/lib/home";
import { cn } from "@/lib/utils";
import { SITE_ID } from "@/site";

/** How many of the cities nearest to being built the tile shows. */
const LEADING = 3;

/** The room a city's bar takes with its status under it, kept for every bar and for the ones awaited. */
const BAR_ROOM = "min-h-[50px]";

// written out, so the stylesheet has them: a span is a number worked out from the cards
const SPAN_SM: Record<number, string> = { 1: "sm:col-span-1", 2: "sm:col-span-2" };
const SPAN_LG: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
};

/**
 * "Which city should I build next?": the tile after the worlds' cards, in the slot they leave
 * empty at the end of their last row (or in a row of its own when they leave none). The three
 * cities nearest to being built, a button to fund one and a link to the whole ranking: most
 * visitors look at the worlds and never reach it otherwise. A sign like the others, set apart
 * by the dashed line of an empty lot.
 */
export function NextCityTile({
  cards,
  columns = 3,
  milestones,
  onDonate,
  newCities,
}: {
  /** how many cards stand before it */
  cards: number;
  /** how many columns the grid has at its widest */
  columns?: number;
  milestones: Milestones;
  onDonate: () => void;
  /** the "new cities" list: its button is there only with an API */
  newCities?: { on: boolean; onJoin: () => void; onLeave: () => void };
}) {
  const { t, locale } = useI18n();
  const small = tileSpan(cards, Math.min(columns, 2));
  const large = tileSpan(cards, Math.min(columns, 3));
  const cities = leading(rankCities(milestones.cities), LEADING);
  const waiting = milestones.state === "loading";
  const bars = waiting || cities.length > 0;
  return (
    <li className={cn("min-w-0", SPAN_SM[small], SPAN_LG[large])}>
      <div className="sign h-full p-1.5">
        <div
          className={cn(
            "grid h-full items-center gap-x-8 gap-y-5 rounded-[6px] border-[1.5px] border-dashed border-paper/20 px-5 py-5",
            // the bars stand beside the words where the tile is wide, under them where it is not;
            // with no bars to show, the words have the tile to themselves
            bars && small > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1",
            bars && large > 1 ? "lg:grid-cols-2" : "lg:grid-cols-1",
          )}
        >
          <div className="min-w-0">
            <p className="font-pixel text-xs leading-none tracking-[0.1em] text-taxi uppercase">
              {t.home.next.kicker}
            </p>
            <h3 className="pt-2.5 text-[22px] leading-tight font-semibold text-paper">
              {t.home.next.title}
            </h3>
            <p className="pt-1.5 text-sm leading-relaxed text-paper-dim">
              {withGoal(t.home.next.body, defaultGoal(milestones.cities), locale)}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 pt-4">
              <button
                type="button"
                onClick={onDonate}
                data-rybbit-event="donate_open"
                data-rybbit-prop-world={SITE_ID}
                className={ACTION}
              >
                <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
                {t.home.next.action}
              </button>
              {newCities && <NewCitiesButton {...newCities} />}
              <a href="#ranking" className={cn(QUIET, "inline-flex items-center gap-1")}>
                {t.home.next.ranking}
                <ArrowDown aria-hidden className="size-3.5" strokeWidth={2.5} />
              </a>
            </div>
          </div>
          {/* each bar keeps the height of one with a status under it, and while the list is on
              its way three empty ones hold their place: the page below does not move */}
          {bars && (
            <ol className="min-w-0 space-y-3.5">
              {waiting
                ? Array.from({ length: LEADING }, (_, i) => (
                    <li key={i} aria-hidden className={BAR_ROOM}>
                      <div className="mt-1 h-3 w-24 rounded-sm bg-white/[0.07]" />
                      <div className="mt-2.5 h-1.5 rounded-full bg-white/[0.07]" />
                    </li>
                  ))
                : cities.map((city) => (
                    <li key={city.id} className={BAR_ROOM}>
                      <MilestoneBar city={city} locale={locale} t={t} />
                    </li>
                  ))}
            </ol>
          )}
        </div>
      </div>
    </li>
  );
}
