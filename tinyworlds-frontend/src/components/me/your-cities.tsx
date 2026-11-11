"use client";

import { Heart, Loader2 } from "lucide-react";
import { useState } from "react";
import { PixelBadge } from "@/components/benefactors/pixel-badge";
import { StoneWall } from "@/components/donate/stone-wall";
import { PILL_DONATE } from "@/components/styles";
import { Switch } from "@/components/ui/switch";
import type { GivingLoad } from "@/hooks/use-giving";
import { useI18n } from "@/hooks/use-i18n";
import type { AdminSession } from "@/lib/admin";
import { givingSummary, stoneRanges, type MyCity, type MyGiving } from "@/lib/benefactors";
import { formatUsd } from "@/lib/donate";
import { cityStones } from "@/lib/stones";
import { cn } from "@/lib/utils";
import { SITE_ID, worldCardUrl, worldUrl } from "@/site";
import { BadgesToEarn } from "./badges";
import { NameEditor } from "./name-editor";

const QUIET =
  "rounded-sm text-xs font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi";

const unauthorized = (error: unknown): boolean =>
  (error as { kind?: string } | null)?.kind === "unauthorized";

/** A built city's share card, small, beside its name; gone if it is not where the page looks for it. */
function Thumbnail({ world }: { world: string }) {
  const [there, setThere] = useState(true);
  if (!there) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a plain file, no optimizer in a static export
    <img
      src={worldCardUrl(world)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setThere(false)}
      className="aspect-[1200/630] w-24 shrink-0 rounded-md object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.6)] sm:w-28"
    />
  );
}

/**
 * What the donor gave and laid in one city: its badges, its foundation with their own stones
 * lit among the others', where it stands, and whether they are named there.
 */
function CityCard({
  city,
  name,
  busy,
  onListing,
  onEdit,
  onGive,
}: {
  city: MyCity;
  name: string | null;
  busy: boolean;
  onListing: (listed: boolean) => void;
  onEdit: () => void;
  onGive: () => void;
}) {
  const { t, locale } = useI18n();
  const collecting = city.status === "PROPOSED";
  const built = city.status === "BUILT";
  const status =
    city.status === "FUNDED"
      ? t.me.status.funded
      : city.status === "BUILDING"
        ? t.me.status.building
        : t.me.status.built;
  const [listedBefore, listedAfter] = t.me.listedAs.split("{name}");
  const meta = [
    t.me.given.replace("{amount}", formatUsd(city.givenCents, locale)),
    city.stones.length > 0
      ? t.me.stonesRange.replace("{ranges}", stoneRanges(city.stones).join(", "))
      : null,
    collecting
      ? t.me.toGo.replace(
          "{left}",
          formatUsd(Math.max(city.goalCents - city.raisedCents, 0), locale),
        )
      : status,
  ].filter((part): part is string => part !== null);
  const stones = cityStones(city.raisedCents, city.goalCents);
  const sum = t.donate.progress
    .replace("{raised}", formatUsd(city.raisedCents, locale))
    .replace("{goal}", formatUsd(city.goalCents, locale));
  // a donor who gave once the city was funded laid no stone there: no wall to light
  const laidSome = city.stones.length > 0;
  const othersToo = city.stones.filter((n) => n >= 1 && n <= stones.laid).length < stones.laid;

  return (
    <li className="border-t border-paper/12 py-4">
      <div className="flex items-start gap-3.5">
        {built && city.worldId && <Thumbnail world={city.worldId} />}
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] leading-tight font-semibold text-paper">{city.name}</h2>
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
            {city.firstStone && <PixelBadge art="firstStone" label={t.me.firstStone} />}
            {city.keystone && <PixelBadge art="keystone" label={t.me.keystone} />}
            {city.founderNumber !== null ? (
              <PixelBadge
                art="founding"
                label={t.me.founderNo.replace("{n}", String(city.founderNumber))}
              />
            ) : (
              <span className="inline-flex h-[18px] items-center rounded-sm border border-paper/25 px-1.5 text-[11px] font-semibold text-paper-dim">
                {t.me.benefactor}
              </span>
            )}
          </div>
          <p className="pt-1.5 text-[13px] leading-snug text-paper-dim">{meta.join(" · ")}</p>
        </div>
        {!built && (
          <button
            type="button"
            onClick={onGive}
            data-rybbit-event="donate_open"
            data-rybbit-prop-world={SITE_ID}
            data-rybbit-prop-city={city.name}
            className={cn(PILL_DONATE, "shrink-0")}
          >
            <Heart aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
            {t.me.giveAgain}
          </button>
        )}
      </div>
      {laidSome && (
        <>
          <StoneWall
            stones={stones}
            mine={city.stones}
            label={city.name}
            valueText={sum}
            className="mt-3"
          />
          {othersToo && (
            <p className="flex flex-wrap gap-x-3.5 pt-1.5 text-xs text-paper-dim">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-[9px] rounded-[2px] bg-taxi" />
                {t.me.legendYours}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-[9px] rounded-[2px] bg-[#7a5d0c]" />
                {t.me.legendOthers}
              </span>
            </p>
          )}
        </>
      )}
      <div className="flex items-center justify-between gap-3 pt-3 text-[13px]">
        <span className={city.listed && name ? "text-paper" : "text-paper-dim"}>
          {city.listed && name ? (
            <>
              {listedBefore}
              <b className="font-semibold">{name}</b>
              {listedAfter}
              {" · "}
              <button type="button" onClick={onEdit} className={QUIET}>
                {t.me.edit}
              </button>
            </>
          ) : (
            t.me.notListed
          )}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {city.worldId && (
            <a href={worldUrl(city.worldId)} className={QUIET}>
              {t.me.explore.replace("{city}", city.name)}
            </a>
          )}
          <Switch
            checked={city.listed}
            disabled={busy}
            aria-label={t.me.listLabel.replace("{city}", city.name)}
            onCheckedChange={onListing}
          />
        </span>
      </div>
    </li>
  );
}

/** The donor's giving in three figures: how many cities, how many stones, how much. */
function Figures({ giving }: { giving: MyGiving }) {
  const { t, locale } = useI18n();
  const summary = givingSummary(giving);
  const rules = new Intl.PluralRules(locale);
  const word = (n: number, form: { one: string; other: string }) =>
    rules.select(n) === "one" ? form.one : form.other;
  const number = new Intl.NumberFormat(locale);
  const figures = [
    { figure: number.format(summary.cities), label: word(summary.cities, t.me.tiles.cities) },
    { figure: number.format(summary.stones), label: word(summary.stones, t.me.tiles.stones) },
    { figure: formatUsd(summary.givenCents, locale), label: t.me.tiles.given },
  ];
  return (
    <dl className="grid grid-cols-3 gap-2 pt-3.5 pb-4">
      {figures.map((item) => (
        <div
          key={item.label}
          className="flex flex-col-reverse rounded-lg bg-white/[0.04] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--sign-line)]"
        >
          <dt className="pt-1.5 text-xs leading-tight font-semibold text-paper-dim">
            {item.label}
          </dt>
          <dd className="text-2xl leading-none font-semibold tracking-[-0.01em] text-taxi tabular-nums">
            {item.figure}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * "Your cities" for a signed-in donor: what they gave, city by city, and how they are listed.
 * Someone who has not given yet is told what will stand here, and shown the badges there are to
 * earn. The giving itself is the page's (`useGiving`): the cities to fund beside this sign
 * depend on it too.
 */
export function YourCities({
  session,
  load,
  retry,
  patch,
  onEnded,
  onGive,
}: {
  session: AdminSession;
  load: GivingLoad;
  retry: () => void;
  patch: (change: (giving: MyGiving) => MyGiving) => void;
  /** the API no longer accepts the session */
  onEnded: () => void;
  /** open the donate sign for that city */
  onGive: (city: string) => void;
}) {
  const { t, locale } = useI18n();
  // the city whose switch is being saved
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);
  // the name editor: for a plain edit, or opened by turning a listing on with no name yet
  const [editing, setEditing] = useState<{ listing: string | null } | null>(null);

  const list = (slug: string, listed: boolean) => {
    setBusy(slug);
    setProblem(false);
    import("@/lib/benefactors-api")
      .then((api) => api.setListing(session, slug, listed))
      .then(
        () =>
          patch((g) => ({
            ...g,
            cities: g.cities.map((c) => (c.slug === slug ? { ...c, listed } : c)),
          })),
        (error: unknown) => {
          if (unauthorized(error)) onEnded();
          else setProblem(true);
        },
      )
      .finally(() => setBusy(null));
  };

  const giving = load.state === "ready" ? load.giving : null;
  const project = giving && giving.projectCents > 0 && (
    <p className="border-t border-paper/12 pt-3.5 text-[13px] text-paper-dim">
      {t.me.project.replace("{amount}", formatUsd(giving.projectCents, locale))}
    </p>
  );

  return (
    <section aria-labelledby="your-cities" className="sign overflow-hidden">
      <div aria-hidden className="h-[3px] bg-taxi" />
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <h1 id="your-cities" className="text-2xl leading-tight font-semibold text-paper">
          {t.me.signIn.heading}
        </h1>

        {load.state === "loading" && (
          <p role="status" className="flex items-center gap-2 pt-4 text-[15px] text-paper">
            <Loader2 aria-hidden className="size-4 animate-spin text-taxi" strokeWidth={2.5} />
            {t.me.loading}
          </p>
        )}

        {load.state === "failed" && (
          <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
            <p className="text-[15px] text-paper">{t.me.failed}</p>
            <button
              type="button"
              onClick={retry}
              className="rounded-sm text-sm font-semibold text-taxi underline underline-offset-2 outline-none focus-visible:decoration-2"
            >
              {t.me.retry}
            </button>
          </div>
        )}

        {giving && giving.cities.length === 0 && (
          <>
            <p className="pt-3.5 text-[17px] leading-snug font-semibold text-paper">
              {t.me.noStones}
            </p>
            <p className="pt-1 text-sm leading-relaxed text-paper-dim">{t.me.noStonesBody}</p>
            <BadgesToEarn />
            {project}
          </>
        )}

        {giving && giving.cities.length > 0 && (
          <>
            <Figures giving={giving} />

            {editing && (
              <div className="pb-2">
                <NameEditor
                  session={session}
                  initial={giving.displayName ?? ""}
                  first={editing.listing !== null && !giving.displayName}
                  onCancel={() => setEditing(null)}
                  onEnded={onEnded}
                  onSaved={(name) => {
                    const slug = editing.listing;
                    patch((g) => ({ ...g, displayName: name }));
                    setEditing(null);
                    if (slug) list(slug, true);
                  }}
                />
              </div>
            )}

            <ul>
              {giving.cities.map((city) => (
                <CityCard
                  key={city.slug}
                  city={city}
                  name={giving.displayName}
                  busy={busy === city.slug}
                  onEdit={() => setEditing({ listing: null })}
                  onGive={() => onGive(city.name)}
                  onListing={(listed) => {
                    // a name comes first: the editor opens, and the listing follows its save
                    if (listed && !giving.displayName) setEditing({ listing: city.slug });
                    else list(city.slug, listed);
                  }}
                />
              ))}
            </ul>

            {problem && (
              <p role="alert" className="pb-2 text-xs text-taxi">
                {t.me.failed}
              </p>
            )}

            {project}
          </>
        )}
      </div>
    </section>
  );
}
