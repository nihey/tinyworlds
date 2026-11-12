"use client";

import { Heart } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/use-i18n";
import type { Strings } from "@/i18n";
import {
  collapseFounders,
  moreLine,
  type CityBenefactors,
  type FounderRow,
} from "@/lib/benefactors";
import { API_URL, formatUsd } from "@/lib/donate";
import { cn } from "@/lib/utils";
import { hallCityUrl } from "@/site";
import { statusLabel } from "../donate/milestone-bar";
import { QUIET } from "../styles";
import { BenefactorLinks } from "./benefactor-link";
import { PixelBadge, PixelIcon } from "./pixel-badge";
import { StoneGrid } from "./stone-grid";

export type CityRef = { slug: string } | { world: string };

type Load =
  { state: "loading" } | { state: "failed" } | { state: "ready"; city: CityBenefactors | null };

const LABEL =
  "block pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-paper-dim uppercase";
/** a line of the founders' list, and the columns inside it: badge, name, sum */
const LINE = "border-t border-white/10 py-2 text-sm";
const COLUMNS = "grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-2.5";
const STAR =
  "-mx-2 rounded-lg bg-[linear-gradient(90deg,rgb(247_194_27/0.09),transparent_75%)] px-2";

function stonesText(t: Strings, n: number): string {
  return (n === 1 ? t.benefactors.stones.one : t.benefactors.stones.other).replace(
    "{n}",
    String(n),
  );
}

/** What the stones' looks mean: an unnamed founder's, the first stone, the last. */
export function StoneLegend({ t }: { t: Strings }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-paper-dim">
      <span className="inline-flex items-center gap-1.5">
        <svg aria-hidden width="9" height="9" className="shrink-0">
          <rect width="9" height="9" rx="2" fill="#5a5d61" />
        </svg>
        {t.benefactors.legendAnon}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <PixelIcon art="firstStone" />
        {t.benefactors.legendFirst}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <PixelIcon art="keystone" />
        {t.benefactors.legendKey}
      </span>
    </div>
  );
}

function nameOf(name: string | null, t: Strings): ReactNode {
  return name ?? <span className="text-paper-dim">{t.benefactors.anonymous}</span>;
}

function FounderLine({
  f,
  t,
  locale,
}: {
  f: FounderRow;
  t: Strings;
  locale: Parameters<typeof formatUsd>[1];
}) {
  const star = f.firstStone || f.keystone;
  return (
    <div className={cn(LINE, star && STAR)}>
      <div className={COLUMNS}>
        <span>
          <PixelBadge
            art="founding"
            label={String(f.number).padStart(2, "0")}
            title={t.benefactors.foundingTitle.replace("{n}", String(f.number))}
          />
        </span>
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <span className="min-w-0 truncate">{nameOf(f.name, t)}</span>
          {f.firstStone && <PixelBadge art="firstStone" label={t.benefactors.firstStone} />}
          {f.keystone && <PixelBadge art="keystone" label={t.benefactors.keystone} />}
        </div>
        <div className="text-right leading-[1.3]">
          <b className="block text-sm font-semibold">{formatUsd(f.amountCents, locale)}</b>
          <span className="text-xs text-paper-dim">{stonesText(t, f.stones)}</span>
        </div>
      </div>
      {/* under the name, in its column */}
      <BenefactorLinks links={f.links} look="row" className="pt-2 pb-0.5 pl-[58px]" />
    </div>
  );
}

function Body({ city, onBecome }: { city: CityBenefactors; onBecome: (cityName: string) => void }) {
  const { t, locale } = useI18n();
  const { shown, hidden } = collapseFounders(city.founders);
  const shownNumbers = new Set(shown.map((f) => f.number));
  const hiddenStones = city.founders
    .filter((f) => !shownNumbers.has(f.number))
    .reduce((sum, f) => sum + f.stones, 0);
  const status = statusLabel(
    {
      id: city.slug,
      slug: city.slug,
      name: city.name,
      raisedCents: city.raisedCents,
      goalCents: city.goalCents,
      donations: 0,
      waiting: 0,
      status: city.status,
      worldId: city.worldId,
    },
    t,
  );
  const summary = t.donate.progress
    .replace("{raised}", formatUsd(city.raisedCents, locale))
    .replace("{goal}", formatUsd(city.goalCents, locale));
  return (
    <>
      <div className="flex items-center gap-2 pr-7">
        <h3 className="min-w-0 flex-1 text-lg leading-tight font-semibold">
          {t.benefactors.heading.replace("{city}", city.name)}
        </h3>
        {status && (
          <span className="shrink-0 rounded-full bg-taxi px-[7px] py-[3px] text-[11px] font-bold tracking-[0.08em] text-taxi-ink uppercase">
            {status}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-paper-dim tabular-nums">{summary}</p>

      <StoneGrid stones={city.stones} founders={city.founders} t={t} />
      <StoneLegend t={t} />
      {/* the same people on a page of their own, with room for what they point to */}
      <p className="pt-3">
        <a href={hallCityUrl(city.slug)} className={QUIET}>
          {t.hall.openCity.replace("{city}", city.name)}
        </a>
      </p>

      {city.founders.length > 0 && (
        <>
          <span className={LABEL}>{t.benefactors.founders}</span>
          <div>
            {shown.map((f) => (
              <div key={f.number} className="contents">
                <FounderLine f={f} t={t} locale={locale} />
                {hidden && hidden.after === f.number && (
                  <div className={cn(LINE, COLUMNS)}>
                    <span className="font-pixel text-xs text-paper-dim">··</span>
                    <span className="text-paper-dim">
                      {moreLine(hidden.count, hidden.anonymous, {
                        more: t.benefactors.more,
                        anonymous: t.benefactors.moreAnonymous,
                      })}
                    </span>
                    <div className="text-right leading-[1.3]">
                      <b className="block text-sm font-semibold">
                        {formatUsd(hidden.amountCents, locale)}
                      </b>
                      <span className="text-xs text-paper-dim">{stonesText(t, hiddenStones)}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {city.benefactors.length > 0 && (
        <>
          <span className={LABEL}>
            {t.benefactors.benefactors}{" "}
            <span className="font-medium tracking-normal normal-case">
              · {t.benefactors.keepingRunning}
            </span>
          </span>
          <ul>
            {city.benefactors.map((b) => (
              <li key={b.rank} className="border-t border-white/10 py-[7px] text-sm">
                <div title={t.benefactors.benefactorTitle} className="flex items-baseline gap-2.5">
                  <span className="w-[26px] shrink-0 font-pixel text-xs text-paper-dim">
                    {b.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{nameOf(b.name, t)}</span>
                  <span className="text-[13px] whitespace-nowrap text-paper-dim">
                    {formatUsd(b.amountCents, locale)}
                  </span>
                </div>
                <BenefactorLinks links={b.links} look="row" className="pt-2 pb-0.5 pl-9" />
              </li>
            ))}
          </ul>
        </>
      )}

      <button
        type="button"
        onClick={() => onBecome(city.name)}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-taxi px-5 text-sm font-semibold text-taxi-ink transition-[filter,transform] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] active:scale-[0.98]"
      >
        <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
        {t.benefactors.become.replace("{city}", city.name)}
      </button>
    </>
  );
}

/**
 * A city's stones, its founding benefactors and the benefactors who keep it running. Fetched when
 * it mounts. Draws nothing while the API is unconfigured or when the city is unknown or hidden.
 */
export function BenefactorsPanel({
  by,
  onBecome,
}: {
  by: CityRef;
  onBecome: (cityName: string) => void;
}) {
  const { t } = useI18n();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const key = JSON.stringify(by);

  useEffect(() => {
    if (API_URL === "") return;
    let live = true;
    import("@/lib/benefactors-api")
      .then((api) => api.fetchCityBenefactors(JSON.parse(key) as CityRef))
      .then((city) => live && setLoad({ state: "ready", city }))
      .catch(() => live && setLoad({ state: "failed" }));
    return () => {
      live = false;
    };
  }, [key]);

  if (API_URL === "" || load.state === "loading") return null;
  if (load.state === "failed")
    return (
      <p role="status" className="text-center text-[13px] leading-relaxed text-paper-dim">
        {t.benefactors.failed}
      </p>
    );
  if (load.city === null) return null;
  return <Body city={load.city} onBecome={onBecome} />;
}
