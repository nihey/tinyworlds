"use client";

import { ArrowUpRight, BadgeCheck, Heart } from "lucide-react";
import { useState } from "react";
import { TellMeButton } from "@/components/lists/tell-me-button";
import { PixelIcon } from "@/components/benefactors/pixel-badge";
import { PILL_DONATE, PILL_GHOST, PILL_SOLID } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import { donationsLabel, formatUsd, type CityMilestone } from "@/lib/donate";
import { waitingLine } from "@/lib/lists";
import { cityStones } from "@/lib/stones";
import { cn } from "@/lib/utils";
import { SITE_ID, worldCardUrl, worldUrl } from "@/site";
import { statusLabel } from "./milestone-bar";
import { StoneWall } from "./stone-wall";

const CARD =
  "flex h-full min-w-0 flex-col gap-2.5 rounded-lg bg-white/[0.035] px-3.5 pt-3.5 pb-3 shadow-[inset_0_0_0_1px_var(--sign-line)]";

/** a city that reached its goal: the accent runs round it */
const REACHED =
  "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--taxi)_9%,transparent),color-mix(in_srgb,var(--taxi)_2%,transparent))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--taxi)_40%,transparent)]";

const NAME = "min-w-0 flex-1 truncate text-[15px] leading-5 font-semibold text-paper";
const SUM = "shrink-0 text-xs text-paper-dim tabular-nums";
const LINE =
  "flex min-h-[18px] flex-wrap items-center gap-x-1.5 text-xs leading-[18px] text-paper-dim";

/** Which heading a city's name is: under a group's title on the front page, under a sign's on "Your cities". */
type NameLevel = "h3" | "h4";

interface CityFundCardProps {
  city: CityMilestone;
  /** its place among the cities still collecting; none for one that reached its goal */
  place?: number;
  onDonate: (city: string) => void;
  onBenefactors: (slug: string) => void;
  as?: NameLevel;
  /** the list "hear when it is built": without these (no API) there is no button */
  onTellMe?: (city: CityMilestone) => void;
  onLeave?: (city: CityMilestone) => void;
  listState?: "join" | "joined" | "donor";
}

/**
 * A city being funded: its place, what it has of what it needs, its foundation stone by stone,
 * and two buttons that say what they do. Benefactors is there once someone has given.
 */
export function CityFundCard({
  city,
  place,
  onDonate,
  onBenefactors,
  as: Name = "h4",
  onTellMe,
  onLeave,
  listState = "join",
}: CityFundCardProps) {
  const { t, locale } = useI18n();
  const stones = cityStones(city.raisedCents, city.goalCents);
  const sum = t.donate.progress
    .replace("{raised}", formatUsd(city.raisedCents, locale))
    .replace("{goal}", formatUsd(city.goalCents, locale));
  const status = statusLabel(city, t);
  const donations = donationsLabel(city.donations, locale, t.donate.donations);
  const waiting = waitingLine(city.waiting, locale, t);
  return (
    <article className={cn(CARD, status && REACHED)}>
      <div className="flex items-start gap-2">
        {place === undefined ? (
          <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-taxi" strokeWidth={2.5} />
        ) : (
          <span
            aria-hidden
            className={cn(
              "shrink-0 text-sm leading-5 font-bold tabular-nums",
              place <= 3 && city.raisedCents > 0 ? "text-taxi" : "text-paper-dim",
            )}
          >
            {place}
          </span>
        )}
        <Name className={NAME}>{city.name}</Name>
        <span className={cn(SUM, "leading-5")}>{sum}</span>
      </div>
      <StoneWall stones={stones} label={city.name} valueText={sum} />
      <p className={LINE}>
        {status ? (
          <>
            <span className="font-semibold text-taxi">{status}</span>
            <span>· {donations}</span>
          </>
        ) : city.raisedCents > 0 ? (
          <span>
            {t.donate.build.stonesLaid
              .replace("{laid}", String(stones.laid))
              .replace("{total}", String(stones.total))}
            {" · "}
            {donations}
          </span>
        ) : (
          <>
            <span className="-my-0.5 flex">
              <PixelIcon art="firstStone" />
            </span>
            <span>{t.donate.build.firstUnclaimed}</span>
          </>
        )}
        {waiting && <span>· {waiting}</span>}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        {onTellMe && onLeave && (
          <TellMeButton
            city={city}
            state={listState}
            onJoin={() => onTellMe(city)}
            onLeave={() => onLeave(city)}
          />
        )}
        {city.donations > 0 && (
          <button
            type="button"
            onClick={() => onBenefactors(city.slug)}
            aria-label={t.home.benefactorsOf.replace("{city}", city.name)}
            className={cn(PILL_GHOST, "flex-1")}
          >
            <PixelIcon art="founding" />
            <span className="truncate">{t.benefactors.benefactors}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onDonate(city.name)}
          aria-label={t.home.donateTo.replace("{city}", city.name)}
          data-rybbit-event="donate_open"
          data-rybbit-prop-world={SITE_ID}
          data-rybbit-prop-city={city.name}
          className={cn(PILL_DONATE, "flex-1")}
        >
          <Heart aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
          <span className="truncate">{t.donate.action}</span>
        </button>
      </div>
    </article>
  );
}

/**
 * A city that was funded in full and is built: it stays in the ranking, lit. Its picture, its
 * whole foundation, and where to go from here: its benefactors, and the city itself. Giving to
 * it goes through the benefactors' sign, as everywhere.
 */
export function BuiltCityCard({
  city,
  onBenefactors,
  as: Name = "h4",
}: {
  city: CityMilestone;
  onBenefactors: (slug: string) => void;
  as?: NameLevel;
}) {
  const { t, locale } = useI18n();
  // a city whose share card is not where the front page looks for it goes without its picture
  const [pictured, setPictured] = useState(city.worldId !== null);
  const stones = cityStones(city.raisedCents, city.goalCents);
  const raised = t.donate.build.raised.replace("{amount}", formatUsd(city.raisedCents, locale));
  const mark = (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-taxi pr-2.5 pl-1.5 text-[11px] font-bold tracking-[0.08em] text-taxi-ink uppercase">
      <PixelIcon art="keystone" />
      {t.donate.status.built}
    </span>
  );
  return (
    <article
      className={cn(
        CARD,
        "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--taxi)_14%,transparent),color-mix(in_srgb,var(--taxi)_3%,transparent))] shadow-[inset_0_0_0_1.5px_var(--taxi)]",
      )}
    >
      {pictured && city.worldId ? (
        <div className="relative -mx-3.5 -mt-3.5 mb-0.5 aspect-[3/1] overflow-hidden rounded-t-lg bg-sign-raised">
          {/* eslint-disable-next-line @next/next/no-img-element -- a plain file, no optimizer in a static export */}
          <img
            src={worldCardUrl(city.worldId)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setPictured(false)}
            className="size-full object-cover object-[center_30%]"
          />
          <span className="absolute top-2.5 left-2.5 flex shadow-[0_2px_6px_rgb(0_0_0/0.4)]">
            {mark}
          </span>
        </div>
      ) : (
        <div className="flex">{mark}</div>
      )}
      <div className="flex items-start gap-2">
        <Name className={NAME}>{city.name}</Name>
        <span className={cn(SUM, "leading-5")}>{raised}</span>
      </div>
      <StoneWall stones={stones} label={city.name} valueText={raised} />
      <p className={LINE}>
        <span className="font-semibold text-taxi">{t.donate.build.fundedInFull}</span>
        <span>· {donationsLabel(city.donations, locale, t.donate.donations)}</span>
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onBenefactors(city.slug)}
          aria-label={t.home.benefactorsOf.replace("{city}", city.name)}
          className={cn(PILL_GHOST, "flex-1")}
        >
          <PixelIcon art="founding" />
          <span className="truncate">{t.benefactors.benefactors}</span>
        </button>
        {city.worldId && (
          <a
            href={worldUrl(city.worldId)}
            aria-label={t.home.explore.replace("{city}", city.name)}
            className={cn(PILL_SOLID, "flex-1")}
          >
            <span className="truncate">{t.home.exploreShort}</span>
            <ArrowUpRight aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
          </a>
        )}
      </div>
    </article>
  );
}

/** The empty lot at the end of the ranking: a city nobody has named yet. */
export function OtherCityCard({
  onDonate,
  as: Name = "h4",
}: {
  onDonate: () => void;
  as?: NameLevel;
}) {
  const { t } = useI18n();
  return (
    <article className="flex h-full min-w-0 flex-col gap-1.5 rounded-lg border-[1.5px] border-dashed border-paper/25 px-3.5 pt-3.5 pb-3">
      <Name className="text-[15px] leading-5 font-semibold text-paper">
        {t.donate.build.other.title}
      </Name>
      <p className="pb-2 text-[13px] leading-snug text-paper-dim">{t.donate.build.other.body}</p>
      <button
        type="button"
        onClick={onDonate}
        data-rybbit-event="donate_open"
        data-rybbit-prop-world={SITE_ID}
        className={cn(PILL_DONATE, "mt-auto w-full")}
      >
        <Heart aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
        <span className="truncate">{t.donate.build.other.action}</span>
      </button>
    </article>
  );
}
