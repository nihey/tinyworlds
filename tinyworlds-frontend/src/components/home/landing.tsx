"use client";

import { ArrowUpRight, Code, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BenefactorsSign } from "@/components/benefactors/benefactors-sign";
import type { CityRef } from "@/components/benefactors/benefactors-panel";
import { JoinSign } from "@/components/lists/join-sign";
import { BuildNext } from "@/components/donate/build-next";
import { DonateDialog } from "@/components/donate/donate-dialog";
import { WallColumns, WallStrip } from "@/components/home/benefactor-wall";
import { HeroCarousel } from "@/components/home/hero-carousel";
import { SectionHead } from "@/components/home/section-head";
import { SiteNumbers } from "@/components/home/site-numbers";
import { WorldCatalogue } from "@/components/home/world-catalogue";
import { LegalLinks } from "@/components/legal/legal-links";
import { Wordmark } from "@/components/map/wordmark";
import { ACTION_QUIET } from "@/components/styles";
import { useAdminSession } from "@/hooks/use-admin-session";
import { useDonorSession } from "@/hooks/use-donor-session";
import { useJoinReturn } from "@/hooks/use-join-return";
import { useLists } from "@/hooks/use-lists";
import { useI18n } from "@/hooks/use-i18n";
import { useMilestones } from "@/hooks/use-milestones";
import { usePrefs } from "@/hooks/use-prefs";
import { useDocumentLanguage, useDonationReturn, useFunnelVisit } from "@/hooks/use-site-effects";
import { useTheme } from "@/hooks/use-theme";
import { useWall } from "@/hooks/use-wall";
import { useWorldVisits } from "@/hooks/use-world-visits";
import { broughtByWorld } from "@/lib/brought-by";
import { rankCities } from "@/lib/city-picker";
import { API_URL, paymentLinkFor, type CityMilestone } from "@/lib/donate";
import { type ListKey } from "@/lib/lists";
import { cn } from "@/lib/utils";
import { byVisits, siteTotals } from "@/lib/visits";
import {
  ADMIN_PATH,
  CONTACT_EMAIL,
  CONTACT_URL,
  GITHUB_URL,
  HALL_URL,
  HERO_FILMS,
  ME_PATH,
  SITE_ID,
  heroSlides,
} from "@/site";
import { WORLDS } from "@/worlds";

/** the footer's quiet links: the address, the terms and the privacy policy, the cookie settings, the admin pages */
const FOOTER_LINK =
  "rounded-sm font-semibold text-[#15171a] underline decoration-[#15171a]/40 underline-offset-2 outline-none hover:decoration-[#15171a] focus-visible:decoration-2 dusk:text-paper dusk:decoration-paper-dim/60 dusk:hover:decoration-paper";

/** the links across the top, on the fog: to the page's own sections */
const TOP_LINK =
  "rounded-sm text-[#15171a]/70 outline-none hover:text-[#15171a] focus-visible:underline focus-visible:underline-offset-4 dusk:text-paper-dim dusk:hover:text-paper";

/** Every world the front page lists, for the count of their visits. */
const WORLD_LIST = Object.values(WORLDS);
const WORLD_IDS = WORLD_LIST.map((world) => world.id);

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
  // the lists "hear when a city is built": the sign for someone not signed in, and a recount of
  // who waits whenever a list is joined or left
  const [join, setJoin] = useState<{ open: boolean; list: ListKey | null }>({
    open: false,
    list: null,
  });
  const [listsVersion, setListsVersion] = useState(0);
  const milestones = useMilestones(listsVersion);
  const donor = useDonorSession();
  const { lists, join: joinList, leave: leaveList } = useLists();
  const joinReturn = useJoinReturn();
  // the page was opened from a sign-in link with a join waiting: the sign opens on its last
  // step, or asks again when the link did not sign the visitor in (saying why)
  const [returnShown, setReturnShown] = useState(true);
  const tellMe = (key: ListKey) => {
    if (!donor) {
      setJoin({ open: true, list: key });
      return;
    }
    void joinList(key).then((ok) => {
      if (ok) setListsVersion((v) => v + 1);
      else toast.error(t.lists.join.failed);
    });
  };
  const stopTelling = (key: ListKey) => {
    void leaveList(key).then((ok) => {
      if (ok) setListsVersion((v) => v + 1);
      else toast.error(t.lists.leaveFailed);
    });
  };
  const cityKey = (city: CityMilestone): ListKey => ({
    kind: "city",
    slug: city.slug,
    name: city.name,
  });
  const takesDonations = API_URL !== "" || paymentLinkFor(locale, SITE_ID) !== null;
  const visits = useWorldVisits(WORLD_IDS);
  const shownVisits = API_URL !== "" ? visits.counts : undefined;
  const worlds = useMemo(() => byVisits(WORLD_LIST, visits.ranked), [visits.ranked]);
  const carouselOrder = useMemo(
    () =>
      heroSlides(
        worlds.map((world) => world.id),
        HERO_FILMS,
      ),
    [worlds],
  );
  const openFor = (city: string) => setDonate({ city });
  // everyone who gave to a city: down the page's sides where there is room, a strip otherwise
  const wall = useWall();
  const wallProps = {
    load: wall,
    onCity: (slug: string) => openBenefactors({ slug }),
    onDonate: takesDonations ? () => setDonate({ city: null }) : undefined,
  };
  // the benefactors need the API; a world's card offers them once the list says it has a city for it
  const withApi = API_URL !== "";
  const benefactorWorlds = new Set(
    milestones.state === "ready"
      ? milestones.cities.flatMap((city) => (city.worldId ? [city.worldId] : []))
      : [],
  );
  // the cities on the map because people paid for them: their cards praise who did
  const brought = broughtByWorld(milestones.cities);
  // how many cities can still be given to: one of the page's figures, once the list is there
  const ranking = rankCities(milestones.cities);
  const funding =
    milestones.state === "ready" ? ranking.funded.length + ranking.ranked.length : null;
  const newCities = {
    on: lists?.newCities ?? false,
    onJoin: () => tellMe({ kind: "new" }),
    onLeave: () => stopTelling({ kind: "new" }),
  };
  const cityLists = {
    mine: lists,
    onTellMe: (city: CityMilestone) => tellMe(cityKey(city)),
    onLeave: (city: CityMilestone) => stopTelling(cityKey(city)),
  };
  const [beforeEmail, afterEmail] = t.home.contact.split("{email}");

  return (
    <main className="home-landing mx-auto flex min-h-dvh w-full max-w-[84rem] flex-col gap-8 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-10 sm:px-6 lg:px-7">
      <div className="flex flex-col gap-5 sm:gap-7">
        <nav
          aria-label={t.home.navLabel}
          className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#d9d7cb] pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 dusk:border-sign-line"
        >
          <Wordmark
            accent="var(--home-wordmark)"
            className="text-[30px] text-[#172321] sm:text-4xl dusk:text-paper"
          />
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold sm:gap-x-6 sm:text-sm">
            <li>
              <a href="#cities" className={TOP_LINK}>
                {t.home.catalogue.all}
              </a>
            </li>
            {takesDonations && (
              <li>
                <a href="#ranking" className={TOP_LINK}>
                  {t.home.ranking}
                </a>
              </li>
            )}
            {withApi && (
              <li className="hidden sm:block">
                <a href={HALL_URL} className={TOP_LINK}>
                  {t.hall.open}
                </a>
              </li>
            )}
            {withApi && (
              <li>
                <a href={ME_PATH} className={cn(TOP_LINK, "inline-flex items-center gap-1.5")}>
                  <UserRound aria-hidden className="size-3.5" strokeWidth={2.25} />
                  {t.home.yourCities}
                </a>
              </li>
            )}
          </ul>
        </nav>
        <HeroCarousel order={carouselOrder} />
        {withApi && (
          <SiteNumbers
            worlds={WORLD_IDS.length}
            totals={siteTotals(visits.counts)}
            funding={funding}
          />
        )}
      </div>

      {takesDonations && (
        <section aria-labelledby="ranking">
          <SectionHead id="ranking" title={t.home.ranking} line={t.home.rankingLine} />
          <BuildNext
            milestones={milestones}
            onDonate={(city) => setDonate({ city })}
            onBenefactors={(slug) => openBenefactors({ slug })}
            lists={withApi ? cityLists : undefined}
            newCities={withApi ? newCities : undefined}
          />
        </section>
      )}

      <WorldCatalogue
        worlds={worlds}
        visits={shownVisits}
        benefactorWorlds={benefactorWorlds}
        brought={brought}
        onBenefactors={(world) => openBenefactors({ world })}
      />

      {withApi && <WallStrip {...wallProps} />}

      <section
        aria-labelledby="open-source"
        className="sign flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:gap-8 sm:px-6"
      >
        <div className="min-w-0 flex-1">
          <h2 id="open-source" className="scroll-mt-6 text-[15px] font-semibold text-paper">
            {t.home.openSource}
          </h2>
          <p className="max-w-2xl pt-1 text-sm leading-relaxed text-paper-dim">
            {t.home.openSourceBody}
          </p>
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(ACTION_QUIET, "shrink-0 self-start sm:self-center")}
        >
          <Code aria-hidden className="size-4" strokeWidth={2.5} />
          {t.home.github}
          <ArrowUpRight aria-hidden className="size-4 opacity-70" strokeWidth={2.25} />
        </a>
      </section>

      <footer className="mt-auto space-y-1.5 text-xs leading-relaxed text-[#15171a]/65 dusk:text-paper-dim">
        <p>
          {beforeEmail}
          <a href={CONTACT_URL} className={FOOTER_LINK}>
            {CONTACT_EMAIL}
          </a>
          {afterEmail}
        </p>
        <p>{t.home.credits}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1.5">
          <LegalLinks className={FOOTER_LINK} cookies />
        </p>
        {admin && (
          <p>
            <a href={ADMIN_PATH} className={FOOTER_LINK}>
              {t.admin.footerLink}
            </a>
          </p>
        )}
      </footer>

      {withApi && <WallColumns {...wallProps} />}

      {withApi && (
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

      {withApi && (
        <JoinSign
          open={join.open || (joinReturn.list !== null && returnShown)}
          list={join.list ?? joinReturn.list}
          notice={join.list === null ? joinReturn.notice : null}
          onOpenChange={(open) => {
            if (open) return;
            setJoin((j) => ({ ...j, open: false }));
            setReturnShown(false);
          }}
          onHelp={(city) => {
            // one sign at a time: the donate sign takes the join sign's place
            setJoin((j) => ({ ...j, open: false }));
            setReturnShown(false);
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
