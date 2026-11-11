"use client";

import { ArrowUpRight, Code, UserRound } from "lucide-react";
import { useState } from "react";
import { BenefactorsSign } from "@/components/benefactors/benefactors-sign";
import { PixelIcon } from "@/components/benefactors/pixel-badge";
import type { CityRef } from "@/components/benefactors/benefactors-panel";
import { BuildNext } from "@/components/donate/build-next";
import { DonateDialog } from "@/components/donate/donate-dialog";
import { MovingPicture } from "@/components/home/moving-picture";
import { Wordmark } from "@/components/map/wordmark";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useI18n } from "@/hooks/use-i18n";
import { useMilestones } from "@/hooks/use-milestones";
import { usePrefs } from "@/hooks/use-prefs";
import { useDocumentLanguage, useDonationReturn, useFunnelVisit } from "@/hooks/use-site-effects";
import { useTheme } from "@/hooks/use-theme";
import { useWorldVisits } from "@/hooks/use-world-visits";
import type { Locale, Strings } from "@/i18n";
import { consentStore, GTM_ID } from "@/lib/consent";
import { API_URL, paymentLinkFor } from "@/lib/donate";
import { cn } from "@/lib/utils";
import { byVisits, visitsLine, type WorldCount, type WorldCounts } from "@/lib/visits";
import {
  ADMIN_PATH,
  CONTACT_EMAIL,
  CONTACT_URL,
  GITHUB_URL,
  HERO,
  ME_PATH,
  SITE_ID,
  worldCardUrl,
  worldLoopUrl,
  worldUrl,
} from "@/site";
import { WORLDS, type World } from "@/worlds";

/** the footer's quiet links: the address, the cookie settings, the admin pages */
const FOOTER_LINK =
  "rounded-sm font-semibold text-[#15171a] underline decoration-[#15171a]/40 underline-offset-2 outline-none hover:decoration-[#15171a] focus-visible:decoration-2 dusk:text-paper dusk:decoration-paper-dim/60 dusk:hover:decoration-paper";

const HEADING =
  "pb-3 text-[11px] font-semibold tracking-[0.16em] uppercase text-[#15171a]/70 dusk:text-paper-dim";

const ACTION =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-taxi px-5 text-[15px] font-semibold text-taxi-ink transition-[filter,transform] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] active:scale-[0.98]";

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

/** Every world the front page lists, for the count of their visits. */
const WORLD_IDS = Object.keys(WORLDS);

/**
 * Under a card: every visit its map has had, and how many are exploring it now once that is
 * more than ten. With an API the line's height is there from the start, so the cards do not
 * grow when the counts arrive; until then (or if they never do) it says nothing.
 */
function VisitsLine({
  count,
  locale,
  t,
}: {
  count: WorldCount | undefined;
  locale: Locale;
  t: Strings;
}) {
  const line = visitsLine(count, locale, t.home);
  return (
    <p className="flex min-h-4 flex-wrap items-center gap-x-2.5 pt-2 text-xs leading-4 font-semibold text-paper-dim tabular-nums">
      {line.visits && <span>{line.visits}</span>}
      {line.live && (
        <span className="inline-flex items-center gap-1.5 text-paper">
          <span aria-hidden className="size-1.5 rounded-full bg-taxi motion-safe:animate-pulse" />
          {line.live}
        </span>
      )}
    </p>
  );
}

/** One group of worlds as cards: the cities, or the places that only exist in stories. */
function WorldGrid({
  id,
  heading,
  worlds,
  columns,
  locale,
  t,
  onBenefactors,
  benefactorWorlds,
  visits,
}: {
  id: string;
  heading: string;
  worlds: World[];
  /** how many cards the widest group has: the grid is laid out for that many */
  columns: number;
  locale: Locale;
  t: Strings;
  onBenefactors: (world: string) => void;
  /** the worlds the API knows a city for: only their cards offer the benefactors */
  benefactorWorlds: ReadonlySet<string>;
  /** each world's visits; undefined when the build has no API, and the cards say none */
  visits?: WorldCounts | null;
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
            <li key={world.id} className="relative">
              <a
                href={worldUrl(world.id)}
                className="group sign block h-full overflow-hidden transition-transform outline-none hover:-translate-y-0.5 focus-visible:shadow-[0_0_0_3px_var(--taxi)]"
              >
                <CardPicture world={world} alt={copy.cardAlt} />
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg leading-tight font-semibold text-paper">{copy.city}</h3>
                    <p className="pt-1 text-sm leading-snug text-paper-dim">{copy.card}</p>
                    {visits !== undefined && (
                      <VisitsLine count={visits?.get(world.id)} locale={locale} t={t} />
                    )}
                  </div>
                  <ArrowUpRight
                    aria-hidden
                    className="mt-0.5 size-5 shrink-0 text-paper-dim transition-[color,transform] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-taxi"
                    strokeWidth={2.25}
                  />
                </div>
              </a>
              {benefactorWorlds.has(world.id) && (
                <button
                  type="button"
                  onClick={() => onBenefactors(world.id)}
                  aria-label={t.home.benefactorsOf.replace("{city}", copy.city)}
                  className="sign absolute top-2.5 right-2.5 flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-paper outline-none transition-[filter] hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
                >
                  <PixelIcon art="founding" />
                  {t.benefactors.benefactors}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
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
  // the city whose benefactors are shown, if any
  // `by` stays what it was when the sign closes, so the fading sign does not change or refetch
  const [benefactors, setBenefactors] = useState<{ open: boolean; by: CityRef }>({
    open: false,
    by: { slug: "" },
  });
  const openBenefactors = (by: CityRef) => setBenefactors({ open: true, by });
  const milestones = useMilestones();
  const takesDonations = API_URL !== "" || paymentLinkFor(locale, SITE_ID) !== null;
  // the real cities first, then the places that only exist in stories; each group most visited
  // first, by the first counts that came (the registry's order until then)
  const visits = useWorldVisits(WORLD_IDS);
  const shownVisits = API_URL !== "" ? visits.counts : undefined;
  const cities = byVisits(
    Object.values(WORLDS).filter((world) => !world.fictional),
    visits.ranked,
  );
  const imagined = byVisits(
    Object.values(WORLDS).filter((world) => world.fictional),
    visits.ranked,
  );
  const columns = Math.max(cities.length, imagined.length);
  const openFor = (city: string) => setDonate({ city });
  // the benefactors need the API; a world's card offers them once the list says it has a city for it
  const showBenefactors = API_URL !== "";
  const benefactorWorlds = new Set(
    milestones.state === "ready"
      ? milestones.cities.flatMap((city) => (city.worldId ? [city.worldId] : []))
      : [],
  );
  // the world the hero's picture shows, and its button leads into
  const lead = WORLDS[HERO.world];
  const [beforeEmail, afterEmail] = t.home.contact.split("{email}");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-10 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-12 sm:px-6 sm:pt-8">
      {showBenefactors && (
        <nav aria-label={t.home.yourCities} className="-mb-6 flex justify-end sm:-mb-8">
          <a
            href={ME_PATH}
            className="inline-flex items-center gap-1.5 rounded-sm text-sm font-semibold text-[#15171a] underline decoration-[#15171a]/40 underline-offset-2 outline-none hover:decoration-[#15171a] focus-visible:decoration-2 dusk:text-paper dusk:decoration-paper-dim/60 dusk:hover:decoration-paper"
          >
            <UserRound aria-hidden className="size-4" strokeWidth={2.25} />
            {t.home.yourCities}
          </a>
        </nav>
      )}

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
        t={t}
        onBenefactors={(world) => openBenefactors({ world })}
        benefactorWorlds={benefactorWorlds}
        visits={shownVisits}
      />
      {imagined.length > 0 && (
        <WorldGrid
          id="imagined"
          heading={t.home.imagined}
          worlds={imagined}
          columns={columns}
          locale={locale}
          t={t}
          onBenefactors={(world) => openBenefactors({ world })}
          benefactorWorlds={benefactorWorlds}
          visits={shownVisits}
        />
      )}

      {takesDonations && (
        <section aria-labelledby="ranking">
          <h2 id="ranking" className={HEADING}>
            {t.home.ranking}
          </h2>
          <BuildNext
            milestones={milestones}
            onDonate={(city) => setDonate({ city })}
            onBenefactors={(slug) => openBenefactors({ slug })}
          />
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
          <a href={CONTACT_URL} className={FOOTER_LINK}>
            {CONTACT_EMAIL}
          </a>
          {afterEmail}
        </p>
        <p>{t.home.credits}</p>
        {GTM_ID && (
          <p>
            <button type="button" onClick={() => consentStore.reopen()} className={FOOTER_LINK}>
              {t.consent.settings}
            </button>
          </p>
        )}
        {admin && (
          <p>
            <a href={ADMIN_PATH} className={FOOTER_LINK}>
              {t.admin.footerLink}
            </a>
          </p>
        )}
      </footer>

      {showBenefactors && (
        <BenefactorsSign
          open={benefactors.open}
          onOpenChange={(open) => !open && setBenefactors((b) => ({ ...b, open: false }))}
          by={benefactors.by}
          onBecome={(city) => {
            // one sign at a time: the donate sign takes the benefactors' place
            setBenefactors((b) => ({ ...b, open: false }));
            openFor(city);
          }}
        />
      )}

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
