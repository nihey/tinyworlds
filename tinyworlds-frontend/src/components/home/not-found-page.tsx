"use client";

import { ArrowRight, Heart, Map as MapGlyph } from "lucide-react";
import { HallFrame } from "@/components/hall/hall-frame";
import { ACTION, ACTION_QUIET, QUIET } from "@/components/styles";
import { useHydrated } from "@/hooks/use-hydrated";
import { useI18n } from "@/hooks/use-i18n";
import { useMilestones } from "@/hooks/use-milestones";
import { defaultGoal, withGoal } from "@/lib/city-picker";
import { formatUsd } from "@/lib/donate";
import { guessAddress } from "@/lib/not-found";
import { CITIES_PATH, SITE_ID, worldUrl } from "@/site";

/**
 * What an address that leads nowhere shows (the front page's 404.html, which the web server
 * answers every such address with). It reads the address: a city that is not built yet
 * (`/tinyparis/`) is offered to whoever typed it, with what it has and a Donate that opens with
 * it chosen; one of the site's maps is linked; anything else leads to the list of cities.
 */
export function NotFoundPage() {
  const { t, locale } = useI18n();
  const words = t.notFound;
  const hydrated = useHydrated();
  const milestones = useMilestones();
  // the address is the browser's: nothing is guessed while the page is prerendered
  const guess = hydrated ? guessAddress(window.location.pathname, milestones.cities) : null;
  const city = guess?.kind === "city" ? guess : null;
  const world = guess?.kind === "world" ? guess.world : null;
  const title = city ? words.cityTitle.replace("{city}", city.name) : words.title;
  const goal = city?.milestone?.goalCents || defaultGoal(milestones.cities);
  const raised = city?.milestone?.raisedCents ?? 0;

  return (
    <HallFrame title={title}>
      {(donate) => (
        <section className="sign mx-auto w-full max-w-xl px-5 py-6 sm:px-7">
          <h1 className="text-2xl leading-tight font-semibold text-paper">{title}</h1>

          {city ? (
            <p className="pt-3 text-[15px] leading-relaxed text-paper">
              {withGoal(words.cityBody, goal, locale)}{" "}
              {raised > 0
                ? words.cityHas
                    .replace("{city}", city.name)
                    .replace("{raised}", formatUsd(raised, locale))
                : words.cityNone.replace("{city}", city.name)}
            </p>
          ) : world ? (
            <p className="pt-3 text-[15px] leading-relaxed text-paper">
              {words.worldBody.replace("{city}", world.copy[locale].city)}
            </p>
          ) : (
            <p className="pt-3 text-[15px] leading-relaxed text-paper">{words.body}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-5">
            {city && donate && (
              <button
                type="button"
                onClick={() => donate(city.name)}
                data-rybbit-event="donate_open"
                data-rybbit-prop-world={SITE_ID}
                data-rybbit-prop-city={city.name}
                className={ACTION}
              >
                <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
                {t.home.donateTo.replace("{city}", city.name)}
              </button>
            )}
            {world && (
              <a href={worldUrl(world.id)} className={ACTION}>
                <MapGlyph aria-hidden className="size-4" strokeWidth={2.5} />
                {t.search.openMap.replace("{city}", world.copy[locale].city)}
              </a>
            )}
            {!city && !world && donate && (
              <button type="button" onClick={() => donate(null)} className={ACTION_QUIET}>
                {t.donate.build.other.title}
              </button>
            )}
            <a href={CITIES_PATH} className={QUIET}>
              {words.everyCity}
              <ArrowRight aria-hidden className="ml-1 inline size-3.5" strokeWidth={2.5} />
            </a>
          </div>
        </section>
      )}
    </HallFrame>
  );
}
