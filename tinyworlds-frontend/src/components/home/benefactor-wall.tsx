"use client";

import { ArrowUpRight, Heart } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { BenefactorLinks, LinkIcon, LinkPicture } from "@/components/benefactors/benefactor-link";
import { Drift } from "@/components/home/drift";
import { useI18n } from "@/hooks/use-i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { WallLoad } from "@/hooks/use-wall";
import { formatUsd } from "@/lib/donate";
import { LINK_REL, hostOf } from "@/lib/links";
import { cn } from "@/lib/utils";
import { citiesShown, wallSides, type WallCity, type WallEntry } from "@/lib/wall";
import { HALL_URL, SITE_ID } from "@/site";

/**
 * From this width there is room beside the page for a column of benefactors on each side;
 * below it they are a strip in the page. The same number as the `min-[90rem]` classes here.
 */
const WIDE = "(min-width: 90rem)";

/** How fast the columns drift up and the strip drifts along, in CSS px a second. */
const COLUMN_SPEED = 16;
const STRIP_SPEED = 26;

interface WallProps {
  load: WallLoad;
  /** open a city's benefactors */
  onCity: (slug: string) => void;
  /** open the donate sign; absent where donations are not taken, and nothing invites */
  onDonate?: () => void;
}

/** Where someone gave: the first cities by name, each opening its benefactors, and how many more. */
function Where({ cities, onCity }: { cities: WallCity[]; onCity: (slug: string) => void }) {
  const { t } = useI18n();
  const { named, more } = citiesShown(cities);
  return (
    <>
      {named.map((city, i) => (
        <Fragment key={city.slug}>
          {i > 0 && ", "}
          <button
            type="button"
            onClick={() => onCity(city.slug)}
            aria-label={t.home.benefactorsOf.replace("{city}", city.name)}
            className="rounded-sm underline-offset-2 outline-none hover:text-paper hover:underline focus-visible:text-taxi focus-visible:underline"
          >
            {city.name}
          </button>
        </Fragment>
      ))}
      {more > 0 && (
        <span
          title={cities
            .slice(named.length)
            .map((city) => city.name)
            .join(", ")}
        >
          {" "}
          {t.benefactors.wall.moreCities.replace("{n}", String(more))}
        </span>
      )}
    </>
  );
}

/**
 * Who gave and what: a name (or "Anonymous"), the sum in the accent, and where. On `oneLine`
 * the sum and the cities keep to one line, cut short: the strip's plaques are one height.
 */
function Who({
  entry,
  onCity,
  oneLine = false,
}: {
  entry: WallEntry;
  onCity: (slug: string) => void;
  oneLine?: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <>
      <p
        className={cn(
          "truncate text-sm leading-tight font-semibold",
          entry.name === null ? "text-paper-dim" : "text-paper",
        )}
      >
        {entry.name ?? t.benefactors.wall.anonymous}
      </p>
      <p className={cn("pt-1 text-xs leading-snug text-paper-dim", oneLine && "truncate")}>
        <b className="font-semibold text-taxi tabular-nums">
          {formatUsd(entry.amountCents, locale)}
        </b>
        {" · "}
        <Where cities={entry.cities} onCity={onCity} />
      </p>
    </>
  );
}

/** The card that invites: an empty lot among the plaques, which opens the donate sign. */
function Invite({ onDonate, className }: { onDonate: () => void; className?: string }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onDonate}
      data-rybbit-event="donate_open"
      data-rybbit-prop-world={SITE_ID}
      className={cn(
        "block w-full rounded-[10px] border border-dashed border-[#15171a]/35 px-3 py-3 text-left transition-colors outline-none hover:border-[#15171a]/75 focus-visible:shadow-[0_0_0_2px_var(--taxi)] dusk:border-paper/30 dusk:hover:border-paper/65",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-sm leading-tight font-semibold text-[#15171a] dusk:text-paper">
        <Heart aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
        {t.benefactors.wall.invite.title}
      </span>
      <span className="block pt-1 text-xs leading-snug text-[#15171a]/65 dusk:text-paper-dim">
        {t.benefactors.wall.invite.body}
      </span>
    </button>
  );
}

/** The words over the benefactors, on the fog: whose they are, in the page's ink. */
const TITLE = "font-semibold text-[#15171a] dusk:text-paper";

/** The way to the hall of fame, where everyone has a page: beside the title, or across from it. */
function HallLink({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <a
      href={HALL_URL}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm text-sm font-semibold text-[#15171a]/70 underline-offset-4 outline-none hover:text-[#15171a] hover:underline focus-visible:underline dusk:text-paper-dim dusk:hover:text-paper",
        className,
      )}
    >
      {t.hall.open}
      <ArrowUpRight aria-hidden className="size-3.5" strokeWidth={2.25} />
    </a>
  );
}

/**
 * One side's column: what it is, then its plaques one under the other, the invitation last.
 * The words stand level with the page's own links across the top and the plaques begin level
 * with the hero, so the columns read as part of the page. The left one says whose plaques
 * these are; the right one, across the page from it, leads to the hall of fame.
 */
function Column({
  entries,
  onCity,
  onDonate,
  side,
  className,
}: Omit<WallProps, "load"> & { entries: WallEntry[]; side: "left" | "right"; className: string }) {
  const { t } = useI18n();
  if (entries.length === 0 && !onDonate) return null;
  return (
    <aside
      aria-label={t.benefactors.wall.label}
      className={cn(
        // beside the page's column (64rem wide, centred), a little into its own margin; as far
        // down as the page's links (2.25rem) and the gap under them, then the plaques
        "fixed inset-y-0 flex w-[clamp(10.5rem,calc(50%-32rem-0.75rem),15.5rem)] flex-col gap-4 py-6",
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center">
        {side === "left" ? (
          <h2 className={cn(TITLE, "text-[15px]")}>{t.benefactors.wall.label}</h2>
        ) : (
          <HallLink className="ml-auto" />
        )}
      </div>
      {/* room at the sides, so the plaques' edges and shadows are not cut by the window */}
      <Drift axis="y" speed={COLUMN_SPEED} className="-mx-3 min-h-0 flex-1 px-3">
        <ul className="flex flex-col gap-3 pb-3">
          {entries.map((entry, i) => (
            <li key={i} className="sign px-3 py-3">
              <Who entry={entry} onCity={onCity} />
              <BenefactorLinks links={entry.links} look="card" className="pt-2.5" />
            </li>
          ))}
          {onDonate && (
            <li>
              <Invite onDonate={onDonate} />
            </li>
          )}
        </ul>
      </Drift>
    </aside>
  );
}

/**
 * Everyone who gave to a city, down both sides of the front page, where the screen has room
 * beside it: a plaque each, the largest gifts first, dealt left and right in turn, drifting up
 * when there are more than fit. A named benefactor's plaque carries their links; an unnamed
 * gift is "Anonymous" with what it gave. On a narrower screen this draws nothing and
 * `WallStrip` shows the same people in the page.
 */
export function WallColumns({ load, onCity, onDonate }: WallProps) {
  const wide = useMediaQuery(WIDE);
  if (!wide || load.state !== "ready") return null;
  const [left, right] = wallSides(load.entries);
  return (
    <>
      <Column
        side="left"
        entries={left}
        onCity={onCity}
        onDonate={onDonate}
        className="right-[calc(50%+32rem-0.25rem)]"
      />
      <Column
        side="right"
        entries={right}
        onCity={onCity}
        onDonate={onDonate}
        className="left-[calc(50%+32rem-0.25rem)]"
      />
    </>
  );
}

/** As tall as a plaque with a name, a sum and a line of links: every one in the strip is. */
const STRIP_HEIGHT = "h-[84px]";

/** A plaque of the strip: one height, its first picture at its side, its links on one line. */
function StripPlaque({ entry, onCity }: { entry: WallEntry; onCity: (slug: string) => void }) {
  const { t } = useI18n();
  const pictured = entry.links.find((link) => link.image);
  let lead: ReactNode = null;
  if (pictured?.image)
    lead = (
      <a
        href={pictured.url}
        target="_blank"
        rel={LINK_REL}
        tabIndex={-1}
        aria-hidden
        className="shrink-0"
      >
        <LinkPicture src={pictured.image} className="h-[60px]" />
      </a>
    );
  return (
    <li className={cn("sign flex max-w-[21rem] shrink-0 items-center gap-3 px-3", STRIP_HEIGHT)}>
      {lead}
      <div className="min-w-0">
        <Who entry={entry} onCity={onCity} oneLine />
        {entry.links.length > 0 && (
          <p className="flex items-center gap-3 pt-1.5">
            {entry.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel={LINK_REL}
                aria-label={t.benefactors.linkLabel
                  .replace("{title}", link.title)
                  .replace("{host}", hostOf(link.url))}
                className="flex min-w-0 items-center gap-1.5 rounded-sm text-xs font-semibold text-paper outline-none hover:text-taxi focus-visible:text-taxi focus-visible:underline"
              >
                <LinkIcon src={link.icon} className="size-4 rounded-[4px]" />
                {/* one link has the line to itself; three share it as icons with a few letters */}
                <span className={cn("truncate", entry.links.length > 1 && "max-w-[6.5rem]")}>
                  {entry.links.length > 1 ? hostOf(link.url) : link.title}
                </span>
              </a>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * The same benefactors as a strip in the page, for screens with no room beside it: plaques of
 * one height in a row, drifting along when there are more than fit. Its room is there from the
 * first paint (empty plaques while the list is on its way), so the page below does not move,
 * and it is never empty: with nobody to show yet, the invitation stands alone.
 */
export function WallStrip({ load, onCity, onDonate }: WallProps) {
  const { t } = useI18n();
  const wide = useMediaQuery(WIDE);
  const waiting = load.state !== "ready";
  // nothing to show and nothing to invite to: no room is kept for it
  if (!waiting && load.entries.length === 0 && !onDonate) return null;
  return (
    <section aria-labelledby="our-benefactors" className="min-[90rem]:hidden">
      {/* there from the first paint, like the row's own room */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pb-2.5">
        <h2 id="our-benefactors" className={cn(TITLE, "text-[17px] leading-tight")}>
          {t.benefactors.wall.label}
        </h2>
        <p className="text-sm leading-snug text-[#15171a]/70 max-sm:hidden dusk:text-paper-dim">
          {t.benefactors.wall.line}
        </p>
        <HallLink className="ml-auto" />
      </div>
      {!wide && (
        // room around the row (taken back by the margins), so the plaques' edges and the
        // shadows under them are not cut by the window
        <Drift
          axis="x"
          speed={STRIP_SPEED}
          className={cn("-mx-2 -mt-2 -mb-8 box-content px-2 pt-2 pb-8", STRIP_HEIGHT)}
        >
          <ul className="flex h-full gap-3 pr-3">
            {waiting
              ? Array.from({ length: 4 }, (_, i) => (
                  <li
                    key={i}
                    aria-hidden
                    className={cn(
                      "w-48 shrink-0 rounded-[10px] bg-[#15171a]/[0.07] dusk:bg-white/[0.05]",
                      STRIP_HEIGHT,
                    )}
                  />
                ))
              : load.entries.map((entry, i) => (
                  <StripPlaque key={i} entry={entry} onCity={onCity} />
                ))}
            {!waiting && onDonate && (
              <li className="w-56 shrink-0">
                <Invite
                  onDonate={onDonate}
                  className={cn("flex flex-col justify-center", STRIP_HEIGHT)}
                />
              </li>
            )}
          </ul>
        </Drift>
      )}
    </section>
  );
}
