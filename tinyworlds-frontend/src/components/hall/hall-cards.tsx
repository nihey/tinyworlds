"use client";

import { ArrowUpRight } from "lucide-react";
import { Fragment } from "react";
import { BenefactorLinks } from "@/components/benefactors/benefactor-link";
import { PixelBadge } from "@/components/benefactors/pixel-badge";
import { useI18n } from "@/hooks/use-i18n";
import type { BenefactorRow, FounderRow } from "@/lib/benefactors";
import { formatUsd } from "@/lib/donate";
import type { HallCity } from "@/lib/hall";
import { cn } from "@/lib/utils";
import type { WallEntry } from "@/lib/wall";
import { hallCityUrl } from "@/site";

/**
 * A card of the hall: a plaque with room for a name, what was given, and the links. Cards are
 * as tall as what they hold, so they are set in columns (`CARDS`), each card whole in one.
 */
const CARD = "sign min-w-0 break-inside-avoid px-4 py-4";

/**
 * The list the cards stand in: one column on a phone, two, then three, each filled from the
 * top, so a card with pictures leaves no hole beside a short one.
 */
export const CARDS = "gap-4 sm:columns-2 lg:columns-3 [&>li]:mb-4";

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

const SUM = "text-[15px] font-semibold whitespace-nowrap text-taxi tabular-nums";
const LINK =
  "rounded-sm underline decoration-paper-dim/40 underline-offset-2 outline-none hover:text-paper hover:decoration-paper focus-visible:text-taxi";

/**
 * Someone on the overall hall of fame: a named benefactor with everything they are named for,
 * the cities they gave to (each leads to that city's hall) and their links; or an unnamed gift.
 */
export function PersonCard({ entry }: { entry: WallEntry }) {
  const { locale } = useI18n();
  return (
    <li className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <Name name={entry.name} />
        <span className={SUM}>{formatUsd(entry.amountCents, locale)}</span>
      </div>
      <p className="pt-1 text-[13px] leading-snug text-paper-dim">
        {entry.cities.map((city, i) => (
          <Fragment key={city.slug}>
            {i > 0 && ", "}
            <a href={hallCityUrl(city.slug)} className={LINK}>
              {city.name}
            </a>
          </Fragment>
        ))}
      </p>
      <BenefactorLinks links={entry.links} look="card" className="pt-3.5" />
    </li>
  );
}

/** A founder in a city's hall: the founding number, the stones laid, the badges, the links. */
export function FounderCard({ founder }: { founder: FounderRow }) {
  const { t, locale } = useI18n();
  const stones = (
    founder.stones === 1 ? t.benefactors.stones.one : t.benefactors.stones.other
  ).replace("{n}", String(founder.stones));
  return (
    <li
      className={cn(
        CARD,
        // the first stone and the keystone are lit
        (founder.firstStone || founder.keystone) &&
          "bg-[linear-gradient(135deg,rgb(247_194_27/0.10),transparent_60%)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 pb-2.5">
        <PixelBadge
          art="founding"
          label={String(founder.number).padStart(2, "0")}
          title={t.benefactors.foundingTitle.replace("{n}", String(founder.number))}
        />
        {founder.firstStone && <PixelBadge art="firstStone" label={t.benefactors.firstStone} />}
        {founder.keystone && <PixelBadge art="keystone" label={t.benefactors.keystone} />}
      </div>
      <div className="flex items-start justify-between gap-3">
        <Name name={founder.name} />
        <span className={SUM}>{formatUsd(founder.amountCents, locale)}</span>
      </div>
      <p className="pt-1 text-[13px] leading-snug text-paper-dim">{stones}</p>
      <BenefactorLinks links={founder.links} look="card" className="pt-3.5" />
    </li>
  );
}

/** A benefactor in a city's hall (one who gave once it had its goal): the rank, the sum, the links. */
export function BenefactorCard({ benefactor }: { benefactor: BenefactorRow }) {
  const { locale } = useI18n();
  return (
    <li className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="shrink-0 font-pixel text-xs text-paper-dim">{benefactor.rank}</span>
          <Name name={benefactor.name} />
        </div>
        <span className={SUM}>{formatUsd(benefactor.amountCents, locale)}</span>
      </div>
      <BenefactorLinks links={benefactor.links} look="card" className="pt-3.5" />
    </li>
  );
}

/** A city on the overall hall of fame: the whole tile leads to that city's own hall. */
export function CityTile({ city }: { city: HallCity }) {
  const { t, locale } = useI18n();
  const people = (city.people === 1 ? t.hall.people.one : t.hall.people.other).replace(
    "{n}",
    String(city.people),
  );
  const standing =
    city.status === "BUILT"
      ? t.hall.built
      : city.raisedCents !== null && city.goalCents !== null
        ? t.hall.funding
            .replace("{raised}", formatUsd(city.raisedCents, locale))
            .replace("{goal}", formatUsd(city.goalCents, locale))
        : null;
  return (
    <li className="min-w-0">
      <a
        href={hallCityUrl(city.slug)}
        aria-label={t.hall.openCity.replace("{city}", city.name)}
        className="group sign flex h-full flex-col px-4 py-4 transition-[transform,box-shadow] duration-150 outline-none hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_0_0_2px_var(--taxi),0_18px_36px_-14px_rgb(0_0_0/0.7)] focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
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
        <span className="pt-1 text-[13px] leading-snug text-paper-dim">
          {[people, standing].filter(Boolean).join(" · ")}
        </span>
        {city.names.length > 0 && (
          <span className="pt-2.5 text-[13px] leading-snug text-paper">
            {city.names.join(", ")}
          </span>
        )}
      </a>
    </li>
  );
}
