"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { Wordmark } from "@/components/map/wordmark";
import type { Locale, Strings } from "@/i18n";
import {
  dayDate,
  formatShare,
  funnelSteps,
  niceMax,
  rankWorlds,
  share,
  type DonationFunnel,
  type FunnelCounts,
  type FunnelDay,
  type FunnelDonation,
  type FunnelWorld,
} from "@/lib/admin";
import { formatUsd } from "@/lib/donate";
import { cn } from "@/lib/utils";
import { WORLDS } from "@/worlds";

/**
 * The donation funnel as an admin reads it: the steps and how many went on at each, the maps
 * by visits, the days, and the latest donations. One colour does all the marking (the site's
 * "on" yellow, on thin bars); every number a bar stands for is written beside it or in a table.
 */

const HEADING =
  "pb-3 text-[11px] font-semibold tracking-[0.16em] uppercase text-[#15171a]/70 dusk:text-paper-dim";

const NOTE = "max-w-2xl text-sm leading-relaxed text-paper-dim";

const TH = "px-2 py-1.5 text-left text-[11px] font-semibold text-paper-dim first:pl-0 last:pr-0";
const TD = "px-2 py-1.5 text-sm text-paper first:pl-0 last:pr-0";
const NUM = "text-right tabular-nums";

interface Words {
  locale: Locale;
  t: Strings;
}

const whole = (value: number, locale: Locale): string =>
  new Intl.NumberFormat(locale).format(value);

/** A bar's width for a share of 0 to 1: nothing for nothing, and never too thin to see. */
const barWidth = (value: number | null): string =>
  value === null || value <= 0 ? "0" : `max(3px, ${value * 100}%)`;

/** A thin bar on its track: the step's or the city's share, drawn. The figures are beside it. */
function Bar({ value }: { value: number | null }) {
  return (
    <div aria-hidden className="h-2 overflow-hidden rounded-[2px] bg-white/12">
      <div className="h-full rounded-r-[4px] bg-taxi" style={{ width: barWidth(value) }} />
    </div>
  );
}

/** A label and its figure, small: what a row says beyond its bar. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-paper-dim">{label}</dt>
      <dd className="font-semibold text-paper tabular-nums">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// the steps
// ---------------------------------------------------------------------------------------------

function Steps({ totals, locale, t }: Words & { totals: FunnelCounts }) {
  const steps = funnelSteps(totals);
  const nothing = steps.every((step) => step.count === 0);
  return (
    <section aria-labelledby="admin-funnel">
      <h2 id="admin-funnel" className={HEADING}>
        {t.admin.funnel.heading}
      </h2>
      <div className="sign px-5 py-5 sm:px-6">
        {nothing ? (
          <p className="text-[15px] text-paper">{t.admin.funnel.empty}</p>
        ) : (
          <>
            <p className={NOTE}>{t.admin.funnel.note}</p>
            <ol className="grid gap-5 pt-5">
              {steps.map((step, i) => (
                <li key={step.key}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0 text-[15px] leading-snug font-semibold text-paper">
                      {t.admin.funnel.steps[step.key]}
                    </span>
                    <span className="shrink-0 text-2xl leading-none font-semibold text-paper">
                      {whole(step.count, locale)}
                    </span>
                  </div>
                  <div className="pt-2">
                    <Bar value={i === 0 ? 1 : step.ofPrevious} />
                  </div>
                  {i > 0 && (
                    <p className="flex flex-wrap gap-x-4 pt-1.5 text-xs leading-snug text-paper-dim">
                      <span>
                        {t.admin.funnel.ofPrevious.replace(
                          "{share}",
                          formatShare(step.ofPrevious, locale),
                        )}
                      </span>
                      {i > 1 && (
                        <span>
                          {t.admin.funnel.ofVisits.replace(
                            "{share}",
                            formatShare(step.ofVisits, locale),
                          )}
                        </span>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ol>
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-1 border-t border-sign-line pt-4 text-sm">
              <Figure label={t.admin.funnel.raised} value={formatUsd(totals.raisedCents, locale)} />
              <Figure
                label={t.admin.funnel.cancelled}
                value={whole(totals.checkoutCancelled, locale)}
              />
            </dl>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// the cities
// ---------------------------------------------------------------------------------------------

/** What a row of the ranking is called: the city, with its map's name beside it. */
function WorldName({ entry, locale, t }: Words & { entry: FunnelWorld }) {
  if (entry.world === "home") return <>{t.admin.frontPage}</>;
  if (entry.world === null) return <>{t.admin.cities.noWorld}</>;
  const world = WORLDS[entry.world];
  // a map this build does not know (one made since, or taken down): its id says what it is
  if (!world) return <>{entry.world}</>;
  return (
    <>
      {world.copy[locale].city}
      <Wordmark
        suffix={world.wordmark}
        accent={world.accent.color}
        className="ml-2 text-[15px] font-normal text-paper-dim"
      />
    </>
  );
}

function WorldRow({
  entry,
  place,
  most,
  locale,
  t,
}: Words & { entry: FunnelWorld; place?: number; most: number }) {
  const columns = t.admin.cities.columns;
  // a row with nothing beyond its visits says so by saying nothing: nine lines of zeros bury the ranking
  const further =
    entry.donateOpened > 0 ||
    entry.checkoutStarted > 0 ||
    entry.donations > 0 ||
    entry.raisedCents > 0;
  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <span className="min-w-0 truncate text-[15px] font-semibold text-paper">
          {place !== undefined && (
            <span className="mr-2 inline-block w-5 text-right font-medium text-paper-dim tabular-nums">
              {place}
            </span>
          )}
          <WorldName entry={entry} locale={locale} t={t} />
        </span>
        <span className="shrink-0 text-[15px] font-semibold text-paper tabular-nums">
          {whole(entry.visits, locale)}
        </span>
      </div>
      <div className={cn("pt-1.5", place !== undefined && "pl-7")}>
        <Bar value={share(entry.visits, most)} />
        {further && (
          <dl className="flex flex-wrap gap-x-5 gap-y-0.5 pt-1.5 text-xs">
            <Figure label={columns.donateOpened} value={whole(entry.donateOpened, locale)} />
            <Figure label={columns.checkoutStarted} value={whole(entry.checkoutStarted, locale)} />
            <Figure label={columns.donations} value={whole(entry.donations, locale)} />
            {entry.raisedCents > 0 && (
              <Figure label={columns.raised} value={formatUsd(entry.raisedCents, locale)} />
            )}
          </dl>
        )}
      </div>
    </>
  );
}

function Cities({ worlds, locale, t }: Words & { worlds: FunnelWorld[] }) {
  const { ranked, frontPage, unnamed } = rankWorlds(worlds);
  // every bar is measured against the most visited row, the front page included
  const most = Math.max(1, ...worlds.map((entry) => entry.visits));
  const apart = [frontPage, unnamed].filter((entry): entry is FunnelWorld => entry !== null);
  return (
    <section aria-labelledby="admin-cities">
      <h2 id="admin-cities" className={HEADING}>
        {t.admin.cities.heading}
      </h2>
      <div className="sign px-5 py-5 sm:px-6">
        <p className={NOTE}>{t.admin.cities.note}</p>
        {ranked.length === 0 ? (
          <p className="pt-4 text-[15px] text-paper">{t.admin.cities.empty}</p>
        ) : (
          <ol className="grid gap-4 pt-5">
            {ranked.map((entry, i) => (
              <li key={entry.world}>
                <WorldRow entry={entry} place={i + 1} most={most} locale={locale} t={t} />
              </li>
            ))}
          </ol>
        )}
        {apart.length > 0 && (
          <ul className="mt-5 grid gap-4 border-t border-sign-line pt-4">
            {apart.map((entry) => (
              <li key={entry.world ?? "unnamed"}>
                <WorldRow entry={entry} most={most} locale={locale} t={t} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// the days
// ---------------------------------------------------------------------------------------------

const dayName = (day: string, locale: Locale, long = false): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    ...(long ? { weekday: "long" as const } : {}),
    day: "numeric",
    month: long ? "long" : "short",
  }).format(dayDate(day));

/** The four steps of one day (or of any row), as figures in a row. */
function StepFigures({ counts, locale, t }: Words & { counts: FunnelCounts }) {
  const steps = t.admin.funnel.steps;
  const columns = t.admin.cities.columns;
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-0.5 text-xs">
      <Figure label={steps.visits} value={whole(counts.visits, locale)} />
      <Figure label={columns.donateOpened} value={whole(counts.donateOpened, locale)} />
      <Figure label={columns.checkoutStarted} value={whole(counts.checkoutStarted, locale)} />
      <Figure label={columns.donations} value={whole(counts.donations, locale)} />
    </dl>
  );
}

function Days({ days, timeZone, locale, t }: Words & { days: FunnelDay[]; timeZone: string }) {
  // the day whose numbers are read out: the one pointed at, or else the latest
  const [pointed, setPointed] = useState<string | null>(null);
  if (days.length === 0) return null;
  const found = days.findIndex((day) => day.day === pointed);
  const at = found === -1 ? days.length - 1 : found;
  const top = niceMax(Math.max(...days.map((day) => day.visits)));
  // the columns thin out as the period grows: a gap between them only while there is room
  const gap = days.length <= 31 ? "gap-[2px]" : days.length <= 92 ? "gap-px" : "gap-0";

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const i = Math.floor(((event.clientX - box.left) / box.width) * days.length);
    setPointed(days[Math.min(days.length - 1, Math.max(0, i))].day);
  };
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    const to =
      event.key === "ArrowLeft"
        ? at - 1
        : event.key === "ArrowRight"
          ? at + 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? days.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    setPointed(days[Math.min(days.length - 1, Math.max(0, to))].day);
  };

  return (
    <section aria-labelledby="admin-days">
      <h2 id="admin-days" className={HEADING}>
        {t.admin.days.heading}
      </h2>
      <div className="sign px-5 py-5 sm:px-6">
        <p className={NOTE}>{t.admin.days.note.replace("{zone}", timeZone)}</p>

        <div aria-live="polite" className="pt-4">
          <p className="pb-1 text-sm font-semibold text-paper first-letter:uppercase">
            {dayName(days[at].day, locale, true)}
          </p>
          <StepFigures counts={days[at]} locale={locale} t={t} />
        </div>

        <div className="pt-4">
          <p aria-hidden className="pb-1 text-[11px] text-paper-dim tabular-nums">
            {whole(top, locale)}
          </p>
          <div
            role="group"
            tabIndex={0}
            aria-label={t.admin.days.heading}
            onPointerMove={point}
            onPointerDown={point}
            onKeyDown={step}
            className={cn(
              "flex h-32 cursor-crosshair touch-pan-y items-end border-t border-b border-sign-line outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)]",
              gap,
            )}
          >
            {days.map((day, i) => (
              <div
                key={day.day}
                aria-hidden
                className={cn(
                  "min-w-0 flex-1 rounded-t-[2px]",
                  i === at ? "bg-taxi" : "bg-paper/40",
                )}
                style={{
                  height: day.visits > 0 ? `max(2px, ${(day.visits / top) * 100}%)` : 0,
                }}
              />
            ))}
          </div>
          <p aria-hidden className="flex justify-between pt-1 text-[11px] text-paper-dim">
            <span>{dayName(days[0].day, locale)}</span>
            <span>{dayName(days[days.length - 1].day, locale)}</span>
          </p>
        </div>

        <details className="group pt-3">
          <summary className="w-fit cursor-pointer rounded-sm text-xs font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi">
            {t.admin.days.table}
          </summary>
          <div className="mt-3 max-h-72 overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-sign-line">
                  <th scope="col" className={TH}>
                    {t.admin.days.day}
                  </th>
                  <th scope="col" className={cn(TH, "text-right")}>
                    {t.admin.cities.columns.visits}
                  </th>
                  <th scope="col" className={cn(TH, "text-right")}>
                    {t.admin.cities.columns.donateOpened}
                  </th>
                  <th scope="col" className={cn(TH, "text-right")}>
                    {t.admin.cities.columns.checkoutStarted}
                  </th>
                  <th scope="col" className={cn(TH, "text-right")}>
                    {t.admin.cities.columns.donations}
                  </th>
                  <th scope="col" className={cn(TH, "text-right")}>
                    {t.admin.cities.columns.raised}
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((day) => (
                  <tr key={day.day} className="border-b border-sign-line/60 last:border-0">
                    <th scope="row" className={cn(TD, "text-left font-normal whitespace-nowrap")}>
                      {dayName(day.day, locale)}
                    </th>
                    <td className={cn(TD, NUM)}>{whole(day.visits, locale)}</td>
                    <td className={cn(TD, NUM)}>{whole(day.donateOpened, locale)}</td>
                    <td className={cn(TD, NUM)}>{whole(day.checkoutStarted, locale)}</td>
                    <td className={cn(TD, NUM)}>{whole(day.donations, locale)}</td>
                    <td className={cn(TD, NUM)}>{formatUsd(day.raisedCents, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// the donations
// ---------------------------------------------------------------------------------------------

/** What was paid, in the currency it was paid in. */
function paid(donation: FunnelDonation, locale: Locale): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: donation.currency.toUpperCase(),
    }).format(donation.amountCents / 100);
  } catch {
    // a currency code this browser does not know
    return `${whole(donation.amountCents / 100, locale)} ${donation.currency.toUpperCase()}`;
  }
}

function Donations({ donations, locale, t }: Words & { donations: FunnelDonation[] }) {
  const columns = t.admin.donations.columns;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section aria-labelledby="admin-donations">
      <h2 id="admin-donations" className={HEADING}>
        {t.admin.donations.heading}
      </h2>
      <div className="sign px-5 py-5 sm:px-6">
        {donations.length === 0 ? (
          <p className="text-[15px] text-paper">{t.admin.donations.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-sign-line">
                  <th scope="col" className={TH}>
                    {columns.when}
                  </th>
                  <th scope="col" className={cn(TH, "text-right")}>
                    {columns.amount}
                  </th>
                  <th scope="col" className={TH}>
                    {columns.city}
                  </th>
                  <th scope="col" className={TH}>
                    {columns.from}
                  </th>
                </tr>
              </thead>
              <tbody>
                {donations.map((donation) => (
                  <tr key={donation.id} className="border-b border-sign-line/60 last:border-0">
                    <td className={cn(TD, "whitespace-nowrap text-paper-dim")}>
                      {when.format(new Date(donation.createdAt))}
                    </td>
                    <td className={cn(TD, NUM, "font-semibold whitespace-nowrap")}>
                      {paid(donation, locale)}
                    </td>
                    <td className={TD}>{donation.city ?? t.admin.donations.noCity}</td>
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <WorldName
                        entry={{ world: donation.world } as FunnelWorld}
                        locale={locale}
                        t={t}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/** The whole report for one period. */
export function FunnelReport({ funnel, locale, t }: Words & { funnel: DonationFunnel }) {
  return (
    <>
      <Steps totals={funnel.totals} locale={locale} t={t} />
      <Cities worlds={funnel.worlds} locale={locale} t={t} />
      <Days days={funnel.days} timeZone={funnel.timeZone} locale={locale} t={t} />
      <Donations donations={funnel.recentDonations} locale={locale} t={t} />
    </>
  );
}
