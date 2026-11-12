"use client";

import { Heart } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ACTION } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import { API_URL } from "@/lib/donate";
import { cityAsked, fetchHall, hallCities, hallTotals, type HallData } from "@/lib/hall";
import { SITE_ID } from "@/site";
import { CityHall } from "./city-hall";
import { BuiltCityCard, CARDS, CityTile, HallFigures, PersonCard } from "./hall-cards";
import { HallFrame } from "./hall-frame";

/** The address does not change under the page: nothing to listen for. */
const never = () => () => {};
const search = () => window.location.search;

const HEADING =
  "text-[22px] leading-tight font-semibold tracking-[-0.01em] text-[#15171a] dusk:text-paper";
const LINE = "text-sm leading-snug text-[#15171a]/70 dusk:text-paper-dim";

/** A section's title and its line, on the fog. */
function Head({ id, title, line }: { id: string; title: string; line: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 pb-4">
      <h2 id={id} className={HEADING}>
        {title}
      </h2>
      <p className={LINE}>{line}</p>
    </div>
  );
}

/**
 * The hall of fame: what everyone gave, in three figures; the cities they brought to the map,
 * each with its picture and their plaque; everyone who gave to a city, the largest gifts first,
 * each with the links they show; then the other cities with a hall. Each city leads to a hall
 * of its own. `initial` is what the build
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
  // the cities their benefactors brought to the map lead; the others follow
  const brought = cities.flatMap((city) =>
    city.broughtBy && city.worldId ? [{ city, by: city.broughtBy, worldId: city.worldId }] : [],
  );
  const others = cities.filter((city) => !(city.broughtBy && city.worldId));
  const totals = data ? hallTotals(data) : null;
  return (
    <HallFrame title={t.hall.title}>
      {(donate) => (
        <>
          <header className="flex flex-col gap-5">
            <div>
              <h1 className="text-[34px] leading-tight font-semibold tracking-[-0.015em] text-[#15171a] sm:text-[42px] dusk:text-paper">
                {t.hall.heading}
              </h1>
              <p className="max-w-2xl pt-1.5 text-[15px] leading-relaxed text-[#15171a]/70 dusk:text-paper-dim">
                {t.hall.line}
              </p>
            </div>
            {totals && totals.people > 0 && <HallFigures totals={totals} />}
          </header>

          {!data && (
            <p
              role={failed ? "alert" : "status"}
              className="text-[15px] text-[#15171a]/70 dusk:text-paper-dim"
            >
              {failed || !API_URL ? t.hall.failed : t.hall.loading}
            </p>
          )}

          {brought.length > 0 && (
            <section aria-labelledby="hall-built">
              <Head id="hall-built" title={t.hall.builtBy} line={t.hall.builtByLine} />
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {brought.map(({ city, by, worldId }) => (
                  <BuiltCityCard key={city.slug} city={city} by={by} worldId={worldId} />
                ))}
              </ul>
            </section>
          )}

          {data && (
            <section aria-labelledby="hall-everyone">
              <Head id="hall-everyone" title={t.hall.everyone} line={t.benefactors.wall.line} />
              {data.wall.length === 0 ? (
                <p className="text-[15px] text-[#15171a]/80 dusk:text-paper-dim">{t.hall.empty}</p>
              ) : (
                <ul className={CARDS}>
                  {data.wall.map((entry, i) => (
                    <PersonCard key={i} entry={entry} rank={i + 1} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {others.length > 0 && (
            <section aria-labelledby="hall-cities">
              <Head id="hall-cities" title={t.hall.byCity} line={t.hall.byCityLine} />
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {others.map((city) => (
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
