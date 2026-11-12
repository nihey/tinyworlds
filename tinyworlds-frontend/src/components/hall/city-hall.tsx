"use client";

import { ArrowUpRight, ChevronRight, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { StoneLegend } from "@/components/benefactors/benefactors-panel";
import { BroughtByPlaque } from "@/components/benefactors/brought-by";
import { StoneGrid } from "@/components/benefactors/stone-grid";
import { statusLabel } from "@/components/donate/milestone-bar";
import { MovingPicture } from "@/components/home/moving-picture";
import { ACTION, ACTION_QUIET, FOG_LINK } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import type { CityBenefactors } from "@/lib/benefactors";
import { broughtBy } from "@/lib/brought-by";
import { API_URL, formatUsd } from "@/lib/donate";
import { fetchCityHall, hasPeople } from "@/lib/hall";
import { cn } from "@/lib/utils";
import { HALL_URL, SITE_ID, worldCardUrl, worldLoopUrl, worldUrl } from "@/site";
import { BenefactorCard, CARDS, FounderCard } from "./hall-cards";
import { HallFrame } from "./hall-frame";

type Load =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "unknown" }
  | { state: "ready"; city: CityBenefactors };

const HEADING = "pb-3 text-[17px] leading-tight font-semibold text-[#15171a] dusk:text-paper";

/**
 * A city's hall of fame: its picture once it is on the map, its foundation (and, for a city its
 * benefactors brought, their plaque), everyone who laid a stone of it, and everyone who has
 * given since, each with the links they show. `initial` is what the build baked into the page
 * (so the names and links are in its HTML); once open, the page asks the API and shows what is
 * true now. A city the API does not know says so, with the way back.
 */
export function CityHall({ slug, initial }: { slug: string; initial: CityBenefactors | null }) {
  const { t, locale } = useI18n();
  const [load, setLoad] = useState<Load>(
    initial ? { state: "ready", city: initial } : { state: "loading" },
  );

  useEffect(() => {
    if (!API_URL) return;
    let live = true;
    fetchCityHall(slug).then(
      (city) => {
        if (live) setLoad(city ? { state: "ready", city } : { state: "unknown" });
      },
      () => {
        // what the build baked in stays when the API is away
        if (live) setLoad((was) => (was.state === "ready" ? was : { state: "failed" }));
      },
    );
    return () => {
      live = false;
    };
  }, [slug]);

  const city = load.state === "ready" ? load.city : null;
  const title = city ? t.hall.cityTitle.replace("{city}", city.name) : t.hall.title;
  // an older API does not count the people: each row of its lists is someone
  const brought = city
    ? broughtBy({ ...city, donations: city.founders.length + city.benefactors.length })
    : null;

  return (
    <HallFrame title={title}>
      {(donate) => (
        <>
          <nav className="flex items-center gap-1 text-sm">
            <a href={HALL_URL} className={FOG_LINK}>
              {t.hall.back}
            </a>
            {city && (
              <>
                <ChevronRight
                  aria-hidden
                  className="size-4 text-[#15171a]/50 dusk:text-paper-dim"
                  strokeWidth={2.25}
                />
                <span className="text-[#15171a]/70 dusk:text-paper-dim">{city.name}</span>
              </>
            )}
          </nav>

          {load.state === "loading" && (
            <p role="status" className="text-[15px] text-[#15171a]/70 dusk:text-paper-dim">
              {t.hall.loading}
            </p>
          )}
          {(load.state === "failed" || load.state === "unknown") && (
            <p role="alert" className="text-[15px] text-[#15171a] dusk:text-paper">
              {load.state === "failed" ? t.hall.failed : t.hall.unknown}
            </p>
          )}

          {city && (
            <>
              <section aria-labelledby="city-hall" className="sign overflow-hidden">
                <div aria-hidden className="h-[3px] bg-taxi" />
                <div
                  className={cn(
                    "grid",
                    city.worldId && "lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]",
                  )}
                >
                  {city.worldId && (
                    // beside the words where there is room, above them where there is not
                    <MovingPicture
                      still={worldCardUrl(city.worldId)}
                      loop={worldLoopUrl(city.worldId)}
                      alt=""
                      eager
                      focus="right"
                      className="aspect-[1200/630] w-full lg:order-2 lg:aspect-auto lg:h-full lg:min-h-[320px]"
                    />
                  )}
                  <div className="px-5 py-5 sm:px-7 sm:py-6">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h1
                        id="city-hall"
                        className="text-[28px] leading-tight font-semibold tracking-[-0.01em] text-paper"
                      >
                        {t.hall.cityHeading.replace("{city}", city.name)}
                      </h1>
                      {(() => {
                        const status = statusLabel(
                          { ...city, id: city.slug, donations: 0, waiting: 0 },
                          t,
                        );
                        return (
                          status && (
                            <span className="rounded-full bg-taxi px-[7px] py-[3px] text-[11px] font-bold tracking-[0.08em] text-taxi-ink uppercase">
                              {status}
                            </span>
                          )
                        );
                      })()}
                    </div>
                    <p className="max-w-2xl pt-1.5 text-[15px] leading-relaxed text-paper-dim">
                      {(city.status === "BUILT" ? t.hall.cityBuilt : t.hall.cityFunding).replace(
                        "{city}",
                        city.name,
                      )}
                      {!brought && (
                        <>
                          {" "}
                          <span className="whitespace-nowrap tabular-nums">
                            {t.donate.progress
                              .replace("{raised}", formatUsd(city.raisedCents, locale))
                              .replace("{goal}", formatUsd(city.goalCents, locale))}
                          </span>
                        </>
                      )}
                    </p>
                    {brought && (
                      <BroughtByPlaque by={brought} size="large" className="mt-4 max-w-md" />
                    )}

                    <div className="max-w-md">
                      <StoneGrid stones={city.stones} founders={city.founders} t={t} />
                      <StoneLegend t={t} />
                    </div>

                    <div className="flex flex-wrap gap-2.5 pt-5">
                      {donate && (
                        <button
                          type="button"
                          onClick={() => donate(city.name)}
                          data-rybbit-event="donate_open"
                          data-rybbit-prop-world={SITE_ID}
                          data-rybbit-prop-city={city.name}
                          className={ACTION}
                        >
                          <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
                          {t.benefactors.become.replace("{city}", city.name)}
                        </button>
                      )}
                      {city.worldId && (
                        <a href={worldUrl(city.worldId)} className={ACTION_QUIET}>
                          {t.hall.explore.replace("{city}", city.name)}
                          <ArrowUpRight
                            aria-hidden
                            className="size-4 opacity-70"
                            strokeWidth={2.25}
                          />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {!hasPeople(city) && (
                <p className="text-[15px] text-[#15171a]/80 dusk:text-paper-dim">{t.hall.empty}</p>
              )}

              {city.founders.length > 0 && (
                <section aria-labelledby="hall-founders">
                  <h2 id="hall-founders" className={HEADING}>
                    {t.benefactors.founders}
                  </h2>
                  <ul className={CARDS}>
                    {city.founders.map((founder) => (
                      <FounderCard key={founder.number} founder={founder} />
                    ))}
                  </ul>
                </section>
              )}

              {city.benefactors.length > 0 && (
                <section aria-labelledby="hall-benefactors">
                  <h2 id="hall-benefactors" className={HEADING}>
                    {t.benefactors.benefactors}{" "}
                    <span className="text-sm font-medium text-[#15171a]/70 dusk:text-paper-dim">
                      · {t.benefactors.keepingRunning}
                    </span>
                  </h2>
                  <ul className={CARDS}>
                    {city.benefactors.map((benefactor) => (
                      <BenefactorCard key={benefactor.rank} benefactor={benefactor} />
                    ))}
                  </ul>
                </section>
              )}

              <p className="max-w-2xl text-[13px] leading-relaxed text-[#15171a]/70 dusk:text-paper-dim">
                {t.hall.linksNote}
              </p>
            </>
          )}
        </>
      )}
    </HallFrame>
  );
}
