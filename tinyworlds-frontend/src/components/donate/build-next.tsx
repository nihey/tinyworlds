"use client";

import { BadgeCheck, Heart, Plus, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { PixelIcon, type PixelArtName } from "@/components/benefactors/pixel-badge";
import { ACTION, PILL_GHOST } from "@/components/styles";
import type { Milestones } from "@/hooks/use-milestones";
import { useI18n } from "@/hooks/use-i18n";
import { CITY_CATALOGUE } from "@/lib/city-catalogue";
import { defaultGoal, fold, leading, rankCities, searchRanking, withGoal } from "@/lib/city-picker";
import { API_URL, formatUsd, type CityMilestone } from "@/lib/donate";
import { cityListState, type MyLists } from "@/lib/lists";
import { cn } from "@/lib/utils";
import { SITE_ID } from "@/site";
import { CityCarousel } from "./city-carousel";
import { BuiltCityCard, CityFundCard, OtherCityCard } from "./city-fund-card";

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
 * the ones still collecting, numbered. Visitors can search all three rows or name a city. Without a
 * list of cities it is a sentence and a Donate button.
 */
export function BuildNext({
  milestones,
  onDonate,
  onBenefactors,
  lists,
}: { milestones: Milestones } & Handlers) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const search = fold(query);
  const ranking = useMemo(() => rankCities(milestones.cities), [milestones.cities]);
  const { built, funded, ranked } = useMemo(
    () => searchRanking(ranking, CITY_CATALOGUE, search),
    [ranking, search],
  );
  const total = built.length + funded.length + ranked.length;
  const hasCities = ranking.built.length + ranking.funded.length + ranking.ranked.length > 0;

  if (!listed(milestones))
    return (
      <div className="sign px-5 py-5 sm:px-6">
        <Pitch onDonate={onDonate} />
      </div>
    );

  return (
    <div className="sign px-4 py-4 sm:px-6 sm:py-5">
      <Steps goalCents={defaultGoal(milestones.cities)} />

      {milestones.state === "loading" && (
        <p role="status" className="pt-4 text-sm text-paper-dim">
          {t.donate.loading}
        </p>
      )}

      {milestones.state === "ready" && hasCities && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex h-11 min-w-0 flex-[1_1_12rem] items-center gap-2.5 rounded-lg border border-sign-line bg-white/[0.04] pl-3.5 focus-within:border-taxi">
              <Search aria-hidden className="size-4 shrink-0 text-paper-dim" />
              <input
                ref={searchInput}
                type="search"
                aria-label={t.donate.pickerPlaceholder}
                placeholder={t.donate.pickerPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent pr-2 text-base text-paper outline-none placeholder:text-paper-dim sm:text-sm [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query && (
                <button
                  type="button"
                  aria-label={t.search.clear}
                  onClick={() => {
                    setQuery("");
                    searchInput.current?.focus();
                  }}
                  className="mr-1 inline-flex size-9 items-center justify-center rounded-md text-paper-dim hover:text-paper focus-visible:outline-2 focus-visible:outline-taxi"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDonate(null)}
              data-rybbit-event="donate_open"
              data-rybbit-prop-world={SITE_ID}
              className={cn(PILL_GHOST, "h-11 px-3.5")}
            >
              <Plus aria-hidden className="size-4 text-taxi" />
              {t.donate.otherPlaceholder}
            </button>
          </div>
          <p role="status" className={search ? "pt-3 text-sm text-paper-dim" : "sr-only"}>
            {search &&
              (total === 0
                ? t.donate.noMatch
                : t.donate.build.matches[total === 1 ? "one" : "other"].replace(
                    "{n}",
                    String(total),
                  ))}
          </p>
        </>
      )}

      {built.length > 0 && (
        <CityCarousel
          title={t.donate.build.groupBuilt}
          icon={<PixelIcon art="keystone" />}
          query={search}
        >
          {built.map((city) => (
            <li key={city.id}>
              <BuiltCityCard city={city} onBenefactors={onBenefactors} />
            </li>
          ))}
        </CityCarousel>
      )}

      {funded.length > 0 && (
        <CityCarousel
          title={t.home.funded}
          icon={<BadgeCheck aria-hidden className="size-3.5 text-taxi" strokeWidth={2.5} />}
          query={search}
        >
          {funded.map((city) => (
            <li key={city.id}>
              <CityFundCard
                city={city}
                onDonate={onDonate}
                onBenefactors={onBenefactors}
                {...listProps(lists, city.slug)}
              />
            </li>
          ))}
        </CityCarousel>
      )}

      {ranked.length > 0 && (
        <CityCarousel
          title={t.donate.groupFunding}
          query={search}
          note={
            !ranking.anyRaised && !search
              ? ranking.ranked.some((city) => city.waiting > 0)
                ? t.home.rankingEmptyWaiting
                : t.home.rankingEmpty
              : undefined
          }
        >
          {ranked.map(({ city, place }) => (
            <li key={city.id} value={place}>
              <CityFundCard
                city={city}
                place={place}
                onDonate={onDonate}
                onBenefactors={onBenefactors}
                {...listProps(lists, city.slug)}
              />
            </li>
          ))}
        </CityCarousel>
      )}

      {milestones.state === "ready" && !hasCities && (
        <div className="mt-5 sm:max-w-sm">
          <OtherCityCard onDonate={() => onDonate(null)} />
        </div>
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
