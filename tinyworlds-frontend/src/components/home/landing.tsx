"use client";

import { ArrowUpRight, BadgeCheck, Code, Heart } from "lucide-react";
import { useState } from "react";
import { DonateDialog } from "@/components/donate/donate-dialog";
import { MilestoneBar } from "@/components/donate/milestone-bar";
import { MovingPicture } from "@/components/home/moving-picture";
import { Wordmark } from "@/components/map/wordmark";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useI18n } from "@/hooks/use-i18n";
import { useMilestones } from "@/hooks/use-milestones";
import { usePrefs } from "@/hooks/use-prefs";
import { useDocumentLanguage, useDonationReturn, useFunnelVisit } from "@/hooks/use-site-effects";
import { useTheme } from "@/hooks/use-theme";
import type { Locale, Strings } from "@/i18n";
import { RANKING_LIMIT, rankCities } from "@/lib/city-picker";
import { API_URL, donationsLabel, paymentLinkFor, type CityMilestone } from "@/lib/donate";
import { cn } from "@/lib/utils";
import {
  ADMIN_PATH,
  CONTACT_EMAIL,
  CONTACT_URL,
  GITHUB_URL,
  HERO,
  SITE_ID,
  worldCardUrl,
  worldLoopUrl,
  worldUrl,
} from "@/site";
import { WORLDS, type World } from "@/worlds";

const HEADING =
  "pb-3 text-[11px] font-semibold tracking-[0.16em] uppercase text-[#15171a]/70 dusk:text-paper-dim";

const SUBHEADING =
  "flex items-center gap-1.5 pb-1 text-[10.5px] font-semibold tracking-[0.14em] text-paper-dim uppercase";

const ACTION =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-taxi px-5 text-[15px] font-semibold text-taxi-ink transition-[filter,transform] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] active:scale-[0.98]";

const QUIET =
  "rounded-sm text-xs font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi";

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

/** One group of worlds as cards: the cities, or the places that only exist in stories. */
function WorldGrid({
  id,
  heading,
  worlds,
  columns,
  locale,
}: {
  id: string;
  heading: string;
  worlds: World[];
  /** how many cards the widest group has: the grid is laid out for that many */
  columns: number;
  locale: Locale;
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className={HEADING}>
        {heading}
      </h2>
      {/* the same columns for every group, so a card is the same size wherever it is listed */}
      <ul
        className={cn(
          "grid gap-4",
          columns > 1 && "sm:grid-cols-2",
          columns > 2 && "lg:grid-cols-3",
        )}
      >
        {worlds.map((world) => {
          const copy = world.copy[locale];
          return (
            <li key={world.id}>
              <a
                href={worldUrl(world.id)}
                className="group sign block h-full overflow-hidden transition-transform outline-none hover:-translate-y-0.5 focus-visible:shadow-[0_0_0_3px_var(--taxi)]"
              >
                <CardPicture world={world} alt={copy.cardAlt} />
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg leading-tight font-semibold text-paper">{copy.city}</h3>
                    <p className="pt-1 text-sm leading-snug text-paper-dim">{copy.card}</p>
                  </div>
                  <ArrowUpRight
                    aria-hidden
                    className="mt-0.5 size-5 shrink-0 text-paper-dim transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-taxi"
                    strokeWidth={2.25}
                  />
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface CityRowProps {
  city: CityMilestone;
  /** its place in the ranking; a city that reached its goal carries a mark instead */
  place?: number;
  locale: Locale;
  t: Strings;
  onDonate: (city: string) => void;
}

/** One city of the ranking: the whole row opens the donate sign with that city chosen. */
function CityRow({ city, place, locale, t, onDonate }: CityRowProps) {
  return (
    <button
      type="button"
      onClick={() => onDonate(city.name)}
      aria-label={t.home.donateTo.replace("{city}", city.name)}
      data-rybbit-event="donate_open"
      data-rybbit-prop-world={SITE_ID}
      data-rybbit-prop-city={city.name}
      className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors outline-none hover:bg-sign-raised focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
    >
      {place === undefined ? (
        <BadgeCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-taxi" strokeWidth={2.25} />
      ) : (
        <span
          aria-hidden
          className={cn(
            "w-5 shrink-0 text-right text-[15px] leading-5 font-bold tabular-nums",
            place <= 3 && city.raisedCents > 0 ? "text-taxi" : "text-paper-dim",
          )}
        >
          {place}
        </span>
      )}
      <MilestoneBar
        city={city}
        locale={locale}
        t={t}
        note={donationsLabel(city.donations, locale, t.donate.donations)}
      />
      <Heart
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-paper-dim/60 transition-colors group-hover:fill-taxi group-hover:text-taxi"
        strokeWidth={2.25}
      />
    </button>
  );
}

/** The front page: what this is, the cities there are, the ones people are funding, and where the code lives. */
export function Landing() {
  const { t, locale } = useI18n();
  const [prefs] = usePrefs();
  useTheme(prefs.theme);
  useDocumentLanguage(locale, t.home.title);
  useDonationReturn();
  useFunnelVisit();
  // only an admin who is signed in on this browser is shown the way to the admin pages
  const admin = useAdminSession();

  // null: closed; otherwise open, with the city it was opened for (or none)
  const [donate, setDonate] = useState<{ city: string | null } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const milestones = useMilestones();
  const withList = API_URL !== "" && milestones.state !== "failed";
  const takesDonations = API_URL !== "" || paymentLinkFor(locale, SITE_ID) !== null;
  const { funded, ranked, anyRaised } = rankCities(milestones.cities);
  const shown = showAll ? ranked : ranked.slice(0, RANKING_LIMIT);
  // the real cities first, then the places that only exist in stories
  const cities = Object.values(WORLDS).filter((world) => !world.fictional);
  const imagined = Object.values(WORLDS).filter((world) => world.fictional);
  const columns = Math.max(cities.length, imagined.length);
  const openFor = (city: string) => setDonate({ city });
  // the world the hero's picture shows, and its button leads into
  const lead = WORLDS[HERO.world];
  const [beforeEmail, afterEmail] = t.home.contact.split("{email}");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-10 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-12 sm:px-6 sm:pt-8">
      {/* The hero is a share card grown to the page's width: a city, alive, signed in its lower
          left corner. On a narrow screen the sign hangs from the picture's edge instead of
          covering it. */}
      <header className="relative">
        <MovingPicture
          still={HERO.still}
          loop={HERO.loop}
          alt=""
          eager
          className="aspect-[16/11] w-full rounded-[10px] shadow-[0_0_0_1px_rgb(0_0_0/0.6),0_16px_34px_-14px_rgb(0_0_0/0.65)] sm:aspect-[16/9] lg:aspect-[2/1]"
        />
        <div className="sign relative mx-3 -mt-14 overflow-hidden sm:mx-5 sm:-mt-24 sm:max-w-md lg:absolute lg:bottom-5 lg:left-5 lg:m-0">
          <div aria-hidden className="h-[3px] bg-taxi" />
          <div className="px-5 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-6">
            <h1>
              <Wordmark className="text-[clamp(2.75rem,12vw,3.75rem)]" />
            </h1>
            <p className="pt-2.5 text-xl leading-tight font-semibold text-paper">
              {t.home.tagline}
            </p>
            <p className="pt-1.5 text-[15px] leading-relaxed text-paper-dim">{t.home.pitch}</p>
            <a href={worldUrl(lead.id)} className={`${ACTION} mt-4`}>
              {t.home.explore.replace("{city}", lead.copy[locale].city)}
              <ArrowUpRight aria-hidden className="size-4" strokeWidth={2.5} />
            </a>
          </div>
        </div>
      </header>

      <WorldGrid
        id="cities"
        heading={t.home.cities}
        worlds={cities}
        columns={columns}
        locale={locale}
      />
      {imagined.length > 0 && (
        <WorldGrid
          id="imagined"
          heading={t.home.imagined}
          worlds={imagined}
          columns={columns}
          locale={locale}
        />
      )}

      {takesDonations && (
        <section aria-labelledby="ranking">
          <h2 id="ranking" className={HEADING}>
            {t.home.ranking}
          </h2>
          <div className="sign px-5 py-5 sm:px-6">
            <p className="max-w-2xl text-[15px] leading-relaxed text-paper">
              {withList ? `${t.donate.goal} ${t.donate.priority}` : t.home.nextPitch}
            </p>
            {withList && (
              <p className="max-w-2xl pt-1.5 text-sm leading-relaxed text-paper-dim">
                {t.donate.over}
              </p>
            )}
            {withList && milestones.state === "loading" && (
              <p role="status" className="pt-4 text-sm text-paper-dim">
                {t.donate.loading}
              </p>
            )}

            {withList && funded.length > 0 && (
              <div className="pt-5">
                <h3 className={SUBHEADING}>
                  <BadgeCheck aria-hidden className="size-3.5 text-taxi" strokeWidth={2.5} />
                  {t.home.funded}
                </h3>
                <ul className="grid gap-x-10 sm:grid-cols-2">
                  {funded.map((city) => (
                    <li key={city.id}>
                      <CityRow city={city} locale={locale} t={t} onDonate={openFor} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {withList && ranked.length > 0 && (
              <div className="pt-5">
                {funded.length > 0 && <h3 className={SUBHEADING}>{t.donate.groupFunding}</h3>}
                {!anyRaised && (
                  <p className="pb-1 text-sm leading-relaxed text-taxi">{t.home.rankingEmpty}</p>
                )}
                {/* down the first column, then the second: the ranking reads top to bottom */}
                <ol className="gap-x-10 sm:columns-2">
                  {shown.map((city, i) => (
                    <li key={city.id} className="break-inside-avoid">
                      <CityRow city={city} place={i + 1} locale={locale} t={t} onDonate={openFor} />
                    </li>
                  ))}
                </ol>
                {ranked.length > RANKING_LIMIT && (
                  <button
                    type="button"
                    onClick={() => setShowAll(!showAll)}
                    aria-expanded={showAll}
                    className={cn(QUIET, "mt-2")}
                  >
                    {showAll ? t.donate.showFewer : t.donate.showAll}
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setDonate({ city: null })}
              data-rybbit-event="donate_open"
              data-rybbit-prop-world={SITE_ID}
              className={`${ACTION} mt-5`}
            >
              <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
              {t.donate.action}
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="open-source">
        <h2 id="open-source" className={HEADING}>
          {t.home.openSource}
        </h2>
        <div className="sign px-5 py-5 sm:px-6">
          <p className="max-w-2xl text-[15px] leading-relaxed text-paper">
            {t.home.openSourceBody}
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-paper/25 px-5 text-[15px] font-semibold text-paper transition-colors outline-none hover:border-taxi hover:text-taxi focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
          >
            <Code aria-hidden className="size-4" strokeWidth={2.5} />
            {t.home.github}
            <ArrowUpRight aria-hidden className="size-4 opacity-70" strokeWidth={2.25} />
          </a>
        </div>
      </section>

      <footer className="mt-auto space-y-1.5 pt-2 text-xs leading-relaxed text-[#15171a]/65 dusk:text-paper-dim">
        <p>
          {beforeEmail}
          <a
            href={CONTACT_URL}
            className="rounded-sm font-semibold text-[#15171a] underline decoration-[#15171a]/40 underline-offset-2 outline-none hover:decoration-[#15171a] focus-visible:decoration-2 dusk:text-paper dusk:decoration-paper-dim/60 dusk:hover:decoration-paper"
          >
            {CONTACT_EMAIL}
          </a>
          {afterEmail}
        </p>
        <p>{t.home.credits}</p>
        {admin && (
          <p>
            <a
              href={ADMIN_PATH}
              className="rounded-sm font-semibold text-[#15171a] underline decoration-[#15171a]/40 underline-offset-2 outline-none hover:decoration-[#15171a] focus-visible:decoration-2 dusk:text-paper dusk:decoration-paper-dim/60 dusk:hover:decoration-paper"
            >
              {t.admin.footerLink}
            </a>
          </p>
        )}
      </footer>

      {takesDonations && (
        <DonateDialog
          open={donate !== null}
          onOpenChange={(open) => !open && setDonate(null)}
          city={donate?.city ?? null}
        />
      )}
    </main>
  );
}
