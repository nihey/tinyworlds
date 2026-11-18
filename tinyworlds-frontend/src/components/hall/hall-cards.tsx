"use client";

import { ArrowUpRight, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { BenefactorLinks } from "@/components/benefactors/benefactor-link";
import { BroughtByPlaque } from "@/components/benefactors/brought-by";
import { MovingPicture } from "@/components/home/moving-picture";
import { useI18n } from "@/hooks/use-i18n";
import type { BroughtBy } from "@/lib/brought-by";
import { formatAmount, formatUsd, progress } from "@/lib/donate";
import type { HallCity, HallTotals } from "@/lib/hall";
import type { BenefactorLink } from "@/lib/links";
import { cn } from "@/lib/utils";
import type { WallEntry } from "@/lib/wall";
import { hallCityUrl, worldCardUrl, worldLoopUrl, worldUrl } from "@/site";
import { AchievementBadges } from "./achievement-badges";

/** Ranked plaques read across each row in the same order as the list. */
export const LEADERBOARD = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3";

/** A name on a card: paper for one that is given, dimmed for "Anonymous". */
function Name({ name }: { name: string | null }) {
  const { t } = useI18n();
  return (
    <p
      className={cn(
        "min-w-0 text-[17px] leading-tight font-semibold break-words",
        name === null ? "text-paper-dim" : "text-paper",
      )}
    >
      {name ?? t.benefactors.wall.anonymous}
    </p>
  );
}

const LINK =
  "rounded-sm underline decoration-paper-dim/40 underline-offset-2 outline-none hover:text-paper hover:decoration-paper focus-visible:text-taxi";

/** Keep each achievement beside the city where it was earned. */
export function PersonCities({ cities }: { cities: WallEntry["cities"] }) {
  return (
    <ul
      role="list"
      className="flex flex-wrap items-start gap-x-4 gap-y-2 text-[13px] leading-snug text-paper-dim"
    >
      {cities.map((city) => (
        <li key={city.slug} className="flex min-w-0 flex-col items-start gap-1">
          <a href={hallCityUrl(city.slug)} className={cn(LINK, "break-words")}>
            {city.name}
          </a>
          {city.foundation && <AchievementBadges foundation={city.foundation} />}
        </li>
      ))}
    </ul>
  );
}

export function PersonCard({
  rank,
  name,
  amountCents,
  links,
  children,
}: {
  rank: number;
  name: string | null;
  amountCents: number;
  links: BenefactorLink[];
  children?: ReactNode;
}) {
  const { locale } = useI18n();
  const first = rank === 1;
  return (
    <li
      className={cn(
        "sign min-w-0 px-4 py-3.5",
        first && "bg-[linear-gradient(135deg,rgb(247_194_27/0.14),transparent_68%)]",
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5">
        <span
          className={cn(
            "grid min-w-7 place-items-center rounded-sm px-1 py-1 font-pixel text-[11px] leading-none tabular-nums",
            first ? "bg-taxi text-taxi-ink" : "bg-paper/8 text-paper-dim",
          )}
        >
          {String(rank).padStart(2, "0")}
        </span>
        <Name name={name} />
        <span className="text-[15px] leading-tight font-semibold whitespace-nowrap text-taxi tabular-nums">
          {formatAmount(amountCents, locale)}
        </span>
        {children && <div className="col-span-2 col-start-2 min-w-0 pt-1.5">{children}</div>}
      </div>
      <BenefactorLinks links={links} look="card" className="pt-3.5" />
    </li>
  );
}

/** A card that lifts under the pointer and is ringed in gold, as the front page's cards are. */
const LIFT =
  "transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_0_0_2px_var(--taxi),0_18px_36px_-14px_rgb(0_0_0/0.7)]";

/** The link that is the whole card: its name, stretched over everything but the other links. */
const WHOLE =
  "outline-none after:absolute after:inset-0 after:rounded-[10px] after:content-[''] focus-visible:after:shadow-[inset_0_0_0_3px_var(--taxi)]";

/** The first few named in a city's hall, and how many more gave: "Ana, Bo and 2 more". */
function NamesLine({ city }: { city: HallCity }) {
  const { t } = useI18n();
  if (city.names.length === 0) return null;
  const others = city.people - city.names.length;
  return (
    <p className="pt-2.5 text-[13px] leading-snug text-paper">
      {city.names.join(", ")}
      {others > 0 && (
        <span className="text-paper-dim"> {t.hall.more.replace("{n}", String(others))}</span>
      )}
    </p>
  );
}

/**
 * A city its benefactors brought to the map, in the hall's gallery: its picture, its name, their
 * plaque and the first few of their names. The card leads to the city's own hall; the way to
 * explore the city lies over it.
 */
export function BuiltCityCard({
  city,
  by,
  worldId,
}: {
  city: HallCity;
  by: BroughtBy;
  worldId: string;
}) {
  const { t } = useI18n();
  return (
    <li className="min-w-0">
      <div className={cn("group sign relative flex h-full flex-col overflow-hidden", LIFT)}>
        <div aria-hidden className="h-[3px] shrink-0 bg-taxi" />
        <MovingPicture
          still={worldCardUrl(worldId)}
          loop={worldLoopUrl(worldId)}
          alt=""
          className="aspect-[1200/630] w-full"
          fallback={<span className="text-2xl font-semibold text-paper">{city.name}</span>}
        />
        <div className="flex flex-1 flex-col px-4 pt-3.5 pb-2.5">
          <h3 className="text-lg leading-tight font-semibold text-paper">
            <a
              href={hallCityUrl(city.slug)}
              aria-label={t.hall.openCity.replace("{city}", city.name)}
              className={WHOLE}
            >
              {city.name}
            </a>
          </h3>
          <BroughtByPlaque by={by} className="mt-2.5" />
          <NamesLine city={city} />
          <div className="mt-auto pt-3">
            <div className="flex min-h-10 items-center justify-between gap-3 border-t border-sign-line pt-2.5">
              <span
                aria-hidden
                className="inline-flex items-center gap-0.5 text-[13px] font-semibold whitespace-nowrap text-paper transition-colors group-hover:text-taxi"
              >
                {t.hall.open}
                <ChevronRight className="size-4" strokeWidth={2.25} />
              </span>
              <a
                href={worldUrl(worldId)}
                aria-label={t.hall.explore.replace("{city}", city.name)}
                className="relative z-10 inline-flex h-7 items-center gap-1 rounded-full border border-paper/15 px-2.5 text-xs font-semibold whitespace-nowrap text-paper transition-colors outline-none hover:border-taxi hover:text-taxi focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
              >
                {t.home.exploreShort}
                <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={2.25} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Any other city with a hall: built before anyone gave, or still being funded. The whole tile
 * leads to the city's own hall; one still being funded shows how far it has come.
 */
export function CityTile({ city }: { city: HallCity }) {
  const { t, locale } = useI18n();
  const people = (city.people === 1 ? t.hall.people.one : t.hall.people.other).replace(
    "{n}",
    String(city.people),
  );
  const funding =
    city.status !== "BUILT" && city.raisedCents !== null && city.goalCents !== null
      ? { raisedCents: city.raisedCents, goalCents: city.goalCents }
      : null;
  const standing =
    city.status === "BUILT"
      ? t.hall.built
      : funding
        ? t.hall.funding
            .replace("{raised}", formatUsd(funding.raisedCents, locale))
            .replace("{goal}", formatUsd(funding.goalCents, locale))
        : null;
  return (
    <li className="min-w-0">
      <a
        href={hallCityUrl(city.slug)}
        aria-label={t.hall.openCity.replace("{city}", city.name)}
        className={cn(
          "group sign flex h-full flex-col px-4 py-4 outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)]",
          LIFT,
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-[17px] leading-tight font-semibold break-words text-paper">
            {city.name}
          </span>
          <ArrowUpRight
            aria-hidden
            className="size-4 shrink-0 text-paper-dim group-hover:text-taxi"
            strokeWidth={2.25}
          />
        </span>
        <span className="pt-1 text-[13px] leading-snug text-paper-dim tabular-nums">
          {[people, standing].filter(Boolean).join(" · ")}
        </span>
        {funding && (
          <span aria-hidden className="mt-3 block h-1.5 overflow-hidden rounded-full bg-paper/10">
            <span
              className="block h-full rounded-full bg-taxi"
              style={{ width: `${Math.round(progress(funding) * 100)}%` }}
            />
          </span>
        )}
        {city.names.length > 0 && (
          <span className="pt-2.5 text-[13px] leading-snug text-paper">
            {city.names.join(", ")}
          </span>
        )}
      </a>
    </li>
  );
}

/**
 * The hall of fame in three figures, on a sign with the gold bar: what was given, by how many,
 * and how many cities it put on the map.
 */
export function HallFigures({ totals }: { totals: HallTotals }) {
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(locale);
  const rules = new Intl.PluralRules(locale);
  const word = (n: number, form: { one: string; other: string }) =>
    rules.select(n) === "one" ? form.one : form.other;
  const words = t.hall.figures;
  const figures = [
    { key: "donated", figure: formatUsd(totals.cents, locale), label: words.donated },
    {
      key: "people",
      figure: number.format(totals.people),
      label: word(totals.people, words.people),
    },
    { key: "built", figure: number.format(totals.built), label: word(totals.built, words.built) },
  ];
  return (
    <div className="sign overflow-hidden">
      <div aria-hidden className="h-[3px] bg-taxi" />
      <dl className="grid grid-cols-3">
        {figures.map((item, i) => (
          <div
            key={item.key}
            className={cn(
              "flex min-h-[88px] flex-col-reverse justify-center border-sign-line px-4 py-3 sm:px-6",
              i > 0 && "border-l",
            )}
          >
            <dt className="pt-1.5 text-xs leading-tight font-semibold text-paper-dim">
              {item.label}
            </dt>
            <dd className="text-[26px] leading-none font-semibold tracking-[-0.01em] text-paper tabular-nums sm:text-[32px]">
              {item.figure}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
