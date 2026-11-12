"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BenefactorsSign } from "@/components/benefactors/benefactors-sign";
import type { CityRef } from "@/components/benefactors/benefactors-panel";
import { BuildNextShort } from "@/components/donate/build-next";
import { DonateDialog } from "@/components/donate/donate-dialog";
import { LegalLinks } from "@/components/legal/legal-links";
import { Wordmark } from "@/components/map/wordmark";
import { FOG_LINK, QUIET } from "@/components/styles";
import { useGiving } from "@/hooks/use-giving";
import { useI18n } from "@/hooks/use-i18n";
import { useLists } from "@/hooks/use-lists";
import { useMilestones } from "@/hooks/use-milestones";
import { useDonationReturn } from "@/hooks/use-site-effects";
import type { AdminSession } from "@/lib/admin";
import { defaultGoal, rankCities, withGoal } from "@/lib/city-picker";
import type { CityMilestone } from "@/lib/donate";
import type { ListKey } from "@/lib/lists";
import { cn } from "@/lib/utils";
import { HOME_URL, RANKING_PATH } from "@/site";
import { YourBadges } from "./badges";
import { KeepExploring } from "./keep-exploring";
import { YourLists } from "./your-lists";
import { YourCities } from "./your-cities";
import { YourLinks } from "./your-links";

/**
 * "Your cities", signed in: the donor's giving, and always somewhere to go from it. Beside the
 * giving, the cities nearest to being built, each with its Donate button (and, for a donor,
 * the badges they have and have not); under both, the worlds to explore. Someone who has not
 * given sees more cities to fund, since they have none of their own to look at.
 */
export function MePage({
  session,
  onEnded,
  onSignOut,
}: {
  session: AdminSession;
  /** the API no longer accepts the session */
  onEnded: () => void;
  onSignOut: () => void;
}) {
  const { t, locale } = useI18n();
  // a checkout started here comes back here
  useDonationReturn();
  const { load, retry, patch } = useGiving(session, onEnded);
  // the lists "hear when a city is built": a recount of who waits whenever one is joined or left
  const [listsVersion, setListsVersion] = useState(0);
  const milestones = useMilestones(listsVersion);
  const { lists, busy, join: joinList, leave: leaveList } = useLists();
  const tellMe = (key: ListKey) => {
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
  // null: closed; otherwise open, with the city it was opened for (or none)
  const [donate, setDonate] = useState<{ city: string | null } | null>(null);
  // `by` stays what it was when the sign closes, so the fading sign does not change or refetch
  const [benefactors, setBenefactors] = useState<{ open: boolean; by: CityRef }>({
    open: false,
    by: { slug: "" },
  });

  const giving = load.state === "ready" ? load.giving : null;
  const cities = giving?.cities ?? [];
  const donor = cities.length > 0;
  const listed = milestones.state === "ready";
  const ranking = rankCities(milestones.cities);
  const open = ranking.funded.length + ranking.ranked.length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <a
          href={HOME_URL}
          aria-label={t.admin.frontPage}
          className="rounded-sm text-[#15171a] outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)] dusk:text-paper"
        >
          <Wordmark plain className="text-4xl" />
        </a>
        <span className="flex min-w-0 items-center gap-3 text-[13px] text-[#15171a]/70 dusk:text-paper-dim">
          <span className="truncate">{t.me.signedInAs.replace("{email}", session.email)}</span>
          <button
            type="button"
            onClick={onSignOut}
            className={cn(FOG_LINK, "inline-flex shrink-0 items-center gap-1")}
          >
            <LogOut aria-hidden className="size-3.5" strokeWidth={2.25} />
            {t.me.signOut}
          </button>
        </span>
      </div>

      <div
        className={cn(
          "grid items-start gap-6",
          donor ? "lg:grid-cols-[7fr_5fr]" : "lg:grid-cols-[5fr_7fr]",
        )}
      >
        {/* one column that may shrink: a long title in it is cut short, never the page widened */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <YourCities
            session={session}
            load={load}
            retry={retry}
            patch={patch}
            onEnded={onEnded}
            onGive={(city) => setDonate({ city })}
          />
          <YourLists lists={lists} busy={busy} onJoin={tellMe} onLeave={stopTelling} />
          {/* links go beside a name on a city's list: for those who gave to one */}
          {donor && giving?.links && (
            <YourLinks
              session={session}
              giving={giving}
              links={giving.links}
              patch={patch}
              onEnded={onEnded}
            />
          )}
        </div>

        <div className="grid min-w-0 gap-6">
          <section aria-labelledby="build-next" className="sign px-5 py-5 sm:px-6">
            <h2 id="build-next" className="text-lg leading-tight font-semibold text-paper">
              {t.home.ranking}
            </h2>
            {listed && (
              <p className="pt-1 text-sm leading-relaxed text-paper-dim">
                {withGoal(t.me.buildBody, defaultGoal(milestones.cities), locale)}
              </p>
            )}
            <div className="pt-3.5">
              <BuildNextShort
                milestones={milestones}
                count={donor ? 2 : 4}
                columns={donor ? 1 : 2}
                onDonate={(city) => setDonate({ city })}
                onBenefactors={(slug) => setBenefactors({ open: true, by: { slug } })}
                lists={{
                  mine: lists,
                  onTellMe: (city) => tellMe(cityKey(city)),
                  onLeave: (city) => stopTelling(cityKey(city)),
                }}
              />
            </div>
            {listed && open > 0 && (
              <p className="pt-3.5">
                <a href={RANKING_PATH} className={QUIET}>
                  {t.me.buildAll.replace("{n}", String(open))}
                </a>
              </p>
            )}
          </section>

          {donor && <YourBadges cities={cities} />}
        </div>
      </div>

      <KeepExploring />

      <footer className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 text-xs leading-relaxed">
        <LegalLinks className={FOG_LINK} cookies />
      </footer>

      <BenefactorsSign
        open={benefactors.open}
        onOpenChange={(isOpen) => !isOpen && setBenefactors((b) => ({ ...b, open: false }))}
        by={benefactors.by}
        onBecome={(city) => {
          // one sign at a time: the donate sign takes the benefactors' place
          setBenefactors((b) => ({ ...b, open: false }));
          setDonate({ city });
        }}
      />

      <DonateDialog
        open={donate !== null}
        onOpenChange={(isOpen) => !isOpen && setDonate(null)}
        city={donate?.city ?? null}
      />
    </main>
  );
}
