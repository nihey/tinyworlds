"use client";

import { Heart } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ACTION } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import { API_URL } from "@/lib/donate";
import { cityAsked, fetchHall, hallCities, type HallData } from "@/lib/hall";
import { SITE_ID } from "@/site";
import { CityHall } from "./city-hall";
import { CARDS, CityTile, PersonCard } from "./hall-cards";
import { HallFrame } from "./hall-frame";

/** The address does not change under the page: nothing to listen for. */
const never = () => () => {};
const search = () => window.location.search;

const HEADING =
  "text-[22px] leading-tight font-semibold tracking-[-0.01em] text-[#15171a] dusk:text-paper";
const LINE = "text-sm leading-snug text-[#15171a]/70 dusk:text-paper-dim";

/**
 * The hall of fame: everyone who gave to a city, the largest gifts first, each with the links
 * they show; then the cities, each leading to a hall of its own. `initial` is what the build
 * baked into the page (so the names and links are in its HTML); once open, the page asks the
 * API and shows what is true now.
 *
 * Asked for a city by `?city=` (one that has no page of its own: named since the build, or
 * with a name in another script), it is that city's hall instead.
 */
export function HallOfFame({ initial }: { initial: HallData | null }) {
  const { t } = useI18n();
  const [data, setData] = useState<HallData | null>(initial);
  const [failed, setFailed] = useState(false);
  // the address is not known while the page is built: read once it is open
  const asked = cityAsked(useSyncExternalStore(never, search, () => ""));

  useEffect(() => {
    if (!API_URL) return;
    let live = true;
    fetchHall().then(
      (fresh) => {
        if (live) setData(fresh);
      },
      () => {
        // what the build baked in stays when the API is away
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  if (asked) return <CityHall slug={asked} initial={null} />;

  const cities = data ? hallCities(data) : [];
  return (
    <HallFrame title={t.hall.title}>
      {(donate) => (
        <>
          <header>
            <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.015em] text-[#15171a] dusk:text-paper">
              {t.hall.heading}
            </h1>
            <p className="max-w-2xl pt-1.5 text-[15px] leading-relaxed text-[#15171a]/70 dusk:text-paper-dim">
              {t.hall.line}
            </p>
          </header>

          {!data && (
            <p
              role={failed ? "alert" : "status"}
              className="text-[15px] text-[#15171a]/70 dusk:text-paper-dim"
            >
              {failed || !API_URL ? t.hall.failed : t.hall.loading}
            </p>
          )}

          {data && (
            <section aria-labelledby="hall-everyone">
              <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 pb-4">
                <h2 id="hall-everyone" className={HEADING}>
                  {t.hall.everyone}
                </h2>
                <p className={LINE}>{t.benefactors.wall.line}</p>
              </div>
              {data.wall.length === 0 ? (
                <p className="text-[15px] text-[#15171a]/80 dusk:text-paper-dim">{t.hall.empty}</p>
              ) : (
                <ul className={CARDS}>
                  {data.wall.map((entry, i) => (
                    <PersonCard key={i} entry={entry} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {cities.length > 0 && (
            <section aria-labelledby="hall-cities">
              <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 pb-4">
                <h2 id="hall-cities" className={HEADING}>
                  {t.hall.byCity}
                </h2>
                <p className={LINE}>{t.hall.byCityLine}</p>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cities.map((city) => (
                  <CityTile key={city.slug} city={city} />
                ))}
              </ul>
            </section>
          )}

          {data && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {donate && (
                <button
                  type="button"
                  onClick={() => donate(null)}
                  data-rybbit-event="donate_open"
                  data-rybbit-prop-world={SITE_ID}
                  className={ACTION}
                >
                  <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
                  {t.hall.join}
                </button>
              )}
              <p className="max-w-xl min-w-0 flex-1 basis-64 text-[13px] leading-relaxed text-[#15171a]/70 dusk:text-paper-dim">
                {t.hall.linksNote}
              </p>
            </div>
          )}
        </>
      )}
    </HallFrame>
  );
}
