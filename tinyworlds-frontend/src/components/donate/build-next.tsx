"use client";

import { BadgeCheck, Heart } from "lucide-react";
import { useState } from "react";
import { PixelIcon, type PixelArtName } from "@/components/benefactors/pixel-badge";
import { ACTION, QUIET } from "@/components/styles";
import type { Milestones } from "@/hooks/use-milestones";
import { useI18n } from "@/hooks/use-i18n";
import {
  BUILT_LIMIT,
  defaultGoal,
  leading,
  RANKING_LIMIT,
  rankCities,
  withGoal,
} from "@/lib/city-picker";
import { API_URL, formatUsd, type CityMilestone } from "@/lib/donate";
import { cityListState, type MyLists } from "@/lib/lists";
import { cn } from "@/lib/utils";
import { SITE_ID } from "@/site";
import { BuiltCityCard, CityFundCard, OtherCityCard } from "./city-fund-card";

const GROUP =
  "flex items-center gap-1.5 pt-5 pb-2 text-[10.5px] font-semibold tracking-[0.14em] text-paper-dim uppercase";

const GRID = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

interface Handlers {
  /** open the donate sign: with that city chosen, or with none */
  onDonate: (city: string | null) => void;
  /** open that city's benefactors */
  onBenefactors: (slug: string) => void;
  /** "Tell me" and leaving the list; without them (no API) the cards have no such button */
  lists?: {
    mine: MyLists | null;
    onTellMe: (city: CityMilestone) => void;
    onLeave: (city: CityMilestone) => void;
  };
}

/** The props that give a card its "Tell me". */
function listProps(lists: Handlers["lists"], slug: string) {
  return lists
    ? {
        onTellMe: lists.onTellMe,
        onLeave: lists.onLeave,
        listState: cityListState(slug, lists.mine),
      }
    : {};
}

/** Whether there is a list of cities to show: an API, and an answer that did not fail. */
const listed = (milestones: Milestones): boolean => API_URL !== "" && milestones.state !== "failed";

/** With no list of cities: why donate, and the way to. Never a dead end. */
function Pitch({ onDonate }: Pick<Handlers, "onDonate">) {
  const { t } = useI18n();
  return (
    <>
      <p className="max-w-2xl text-[15px] leading-relaxed text-paper">{t.home.nextPitch}</p>
      <button
        type="button"
        onClick={() => onDonate(null)}
        data-rybbit-event="donate_open"
        data-rybbit-prop-world={SITE_ID}
        className={cn(ACTION, "mt-5")}
      >
        <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
        {t.donate.action}
      </button>
    </>
  );
}

/** How a city gets built, in three steps, each under one of the badges it can earn. */
function Steps({ goalCents }: { goalCents: number }) {
  const { t, locale } = useI18n();
  const { pick, give, build } = t.donate.build.steps;
  const steps: { art: PixelArtName; scale: number; title: string; body: string }[] = [
    { art: "founding", scale: 3, title: pick.title, body: pick.body },
    {
      art: "firstStone",
      scale: 2,
      title: give.title.replace("{amount}", formatUsd(100, locale)),
      body: give.body,
    },
    {
      art: "keystone",
      scale: 2,
      title: withGoal(build.title, goalCents, locale),
      body: build.body,
    },
  ];
  return (
    <ol className="grid rounded-lg shadow-[inset_0_0_0_1px_var(--sign-line)] sm:grid-cols-3">
      {steps.map((step, i) => (
        <li
          key={step.art}
          className="flex items-center gap-3.5 border-sign-line px-4 py-3.5 max-sm:not-first:border-t sm:not-first:border-l"
        >
          <span aria-hidden className="flex w-10 shrink-0 justify-center">
            <PixelIcon art={step.art} scale={step.scale} />
          </span>
          <span className="min-w-0">
            <b className="block text-sm font-semibold text-paper">
              {i + 1} · {step.title}
            </b>
            <span className="block text-[13px] leading-snug text-paper-dim">{step.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * "Build the next city", whole: how it works, then every city in three groups. The ones built
 * with their goal reached stay, lit, at the top; then the ones that reached it and wait; then
 * the ones still collecting, numbered, with an empty lot for a city nobody has named. Without a
 * list of cities it is a sentence and a Donate button.
 */
export function BuildNext({
  milestones,
  onDonate,
  onBenefactors,
  lists,
}: { milestones: Milestones } & Handlers) {
  const { t } = useI18n();
  const [allBuilt, setAllBuilt] = useState(false);
  const [allRanked, setAllRanked] = useState(false);

  if (!listed(milestones))
    return (
      <div className="sign px-5 py-5 sm:px-6">
        <Pitch onDonate={onDonate} />
      </div>
    );

  const { built, funded, ranked, anyRaised } = rankCities(milestones.cities);
  const shownBuilt = allBuilt ? built : built.slice(0, BUILT_LIMIT);
  const shownRanked = allRanked ? ranked : ranked.slice(0, RANKING_LIMIT);
  const more = (open: boolean, toggle: () => void) => (
    <button type="button" onClick={toggle} aria-expanded={open} className={cn(QUIET, "mt-3")}>
      {open ? t.donate.showFewer : t.donate.showAll}
    </button>
  );

  return (
    <div className="sign px-4 py-4 sm:px-6 sm:py-5">
      <Steps goalCents={defaultGoal(milestones.cities)} />

      {milestones.state === "loading" && (
        <p role="status" className="pt-4 text-sm text-paper-dim">
          {t.donate.loading}
        </p>
      )}

      {built.length > 0 && (
        <>
          <h3 className={GROUP}>
            <PixelIcon art="keystone" />
            {t.donate.build.groupBuilt}
          </h3>
          <ul className={GRID}>
            {shownBuilt.map((city) => (
              <li key={city.id} className="min-w-0">
                <BuiltCityCard city={city} onBenefactors={onBenefactors} />
              </li>
            ))}
          </ul>
          {built.length > BUILT_LIMIT && more(allBuilt, () => setAllBuilt(!allBuilt))}
        </>
      )}

      {funded.length > 0 && (
        <>
          <h3 className={GROUP}>
            <BadgeCheck aria-hidden className="size-3.5 text-taxi" strokeWidth={2.5} />
            {t.home.funded}
          </h3>
          <ul className={GRID}>
            {funded.map((city) => (
              <li key={city.id} className="min-w-0">
                <CityFundCard
                  city={city}
                  onDonate={onDonate}
                  onBenefactors={onBenefactors}
                  {...listProps(lists, city.slug)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {milestones.state === "ready" && (
        <>
          {built.length > 0 || funded.length > 0 ? (
            <h3 className={GROUP}>{t.donate.groupFunding}</h3>
          ) : (
            <div className="pt-5" />
          )}
          {!anyRaised && ranked.length > 0 && (
            <p className="pb-2 text-sm leading-relaxed text-taxi">{t.home.rankingEmpty}</p>
          )}
          <ol className={GRID}>
            {shownRanked.map((city, i) => (
              <li key={city.id} className="min-w-0">
                <CityFundCard
                  city={city}
                  place={i + 1}
                  onDonate={onDonate}
                  onBenefactors={onBenefactors}
                  {...listProps(lists, city.slug)}
                />
              </li>
            ))}
            <li className="min-w-0">
              <OtherCityCard onDonate={() => onDonate(null)} />
            </li>
          </ol>
          {ranked.length > RANKING_LIMIT && more(allRanked, () => setAllRanked(!allRanked))}
        </>
      )}
    </div>
  );
}

/**
 * The cities nearest to being built, as cards and nothing else: for a page that has its own
 * title over them ("Your cities"). The funded ones first, then the best funded; with none to
 * show, the empty lot; with no list, the sentence and the Donate button.
 */
export function BuildNextShort({
  milestones,
  count,
  columns,
  onDonate,
  onBenefactors,
  lists,
}: { milestones: Milestones; count: number; columns: 1 | 2 } & Handlers) {
  const { t } = useI18n();
  if (!listed(milestones)) return <Pitch onDonate={onDonate} />;
  if (milestones.state === "loading")
    return (
      <p role="status" className="text-sm text-paper-dim">
        {t.donate.loading}
      </p>
    );
  const ranking = rankCities(milestones.cities);
  const cities = leading(ranking, count);
  return (
    <ul className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2")}>
      {cities.map((city) => {
        const place = ranking.ranked.indexOf(city);
        return (
          <li key={city.id} className="min-w-0">
            <CityFundCard
              city={city}
              place={place < 0 ? undefined : place + 1}
              onDonate={onDonate}
              onBenefactors={onBenefactors}
              {...listProps(lists, city.slug)}
              as="h3"
            />
          </li>
        );
      })}
      {cities.length === 0 && (
        <li className="min-w-0">
          <OtherCityCard onDonate={() => onDonate(null)} as="h3" />
        </li>
      )}
    </ul>
  );
}
