"use client";

import { Loader2, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { PixelBadge } from "@/components/benefactors/pixel-badge";
import { MilestoneBar } from "@/components/donate/milestone-bar";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/use-i18n";
import type { AdminSession } from "@/lib/admin";
import {
  givingSummary,
  stoneRanges,
  summaryLine,
  type MyCity,
  type MyGiving,
} from "@/lib/benefactors";
import { formatUsd, type CityMilestone } from "@/lib/donate";
import { worldUrl } from "@/site";
import { NameEditor } from "./name-editor";

const QUIET =
  "rounded-sm text-xs font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi";

type Load = { state: "loading" } | { state: "failed" } | { state: "ready"; giving: MyGiving };

const unauthorized = (error: unknown): boolean =>
  (error as { kind?: string } | null)?.kind === "unauthorized";

function milestoneOf(city: MyCity): CityMilestone {
  return {
    id: city.slug,
    slug: city.slug,
    name: city.name,
    raisedCents: city.raisedCents,
    goalCents: city.goalCents,
    donations: 0,
    status: city.status,
    worldId: city.worldId,
  };
}

/** What the donor gave and laid in one city, where it stands, and whether they are named there. */
function CityCard({
  city,
  name,
  busy,
  onListing,
  onEdit,
}: {
  city: MyCity;
  name: string | null;
  busy: boolean;
  onListing: (listed: boolean) => void;
  onEdit: () => void;
}) {
  const { t, locale } = useI18n();
  const collecting = city.status === "PROPOSED";
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

  return (
    <li className="border-t border-paper/15 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h3 className="text-base font-semibold text-paper">{city.name}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
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
      </div>
      <p className="pt-1 text-[13px] text-paper-dim">{meta.join(" · ")}</p>
      {collecting && (
        <MilestoneBar city={milestoneOf(city)} locale={locale} t={t} name="" className="pt-1" />
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

/** "Your cities" for a signed-in donor: what they gave, city by city, and how they are listed. */
export function YourCities({
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
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  // the city whose switch is being saved
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);
  // the name editor: for a plain edit, or opened by turning a listing on with no name yet
  const [editing, setEditing] = useState<{ listing: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    import("@/lib/benefactors-api")
      .then((api) => api.fetchGiving(session))
      .then(
        (giving) => {
          if (live) setLoad({ state: "ready", giving });
        },
        (error: unknown) => {
          if (!live) return;
          if (unauthorized(error)) onEnded();
          else setLoad({ state: "failed" });
        },
      );
    return () => {
      live = false;
    };
  }, [session, attempt, onEnded]);

  const patch = (change: (giving: MyGiving) => MyGiving) =>
    setLoad((current) =>
      current.state === "ready" ? { state: "ready", giving: change(current.giving) } : current,
    );

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
  const summary = giving ? givingSummary(giving) : null;

  return (
    <div className="sign overflow-hidden">
      <div aria-hidden className="h-[3px] bg-taxi" />
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-paper">{t.me.signIn.heading}</h1>
          <span className="flex min-w-0 items-center gap-3 text-xs text-paper-dim">
            <span className="truncate">{t.me.signedInAs.replace("{email}", session.email)}</span>
            <button
              type="button"
              onClick={onSignOut}
              className={`${QUIET} inline-flex shrink-0 items-center gap-1`}
            >
              <LogOut aria-hidden className="size-3.5" strokeWidth={2.25} />
              {t.me.signOut}
            </button>
          </span>
        </div>

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
              onClick={() => {
                setLoad({ state: "loading" });
                setAttempt(attempt + 1);
              }}
              className="rounded-sm text-sm font-semibold text-taxi underline underline-offset-2 outline-none focus-visible:decoration-2"
            >
              {t.me.retry}
            </button>
          </div>
        )}

        {giving && summary && (
          <>
            <p className="pt-1.5 text-sm text-paper-dim">
              {summaryLine(
                summary,
                {
                  cities: t.me.summaryCities,
                  stones: t.me.summaryStones,
                  given: t.me.summaryGiven,
                },
                formatUsd(summary.givenCents, locale),
              )}
            </p>

            {giving.cities.length === 0 && giving.projectCents === 0 && (
              <p className="pt-4 text-[15px] text-paper">{t.me.empty}</p>
            )}

            {editing && (
              <div className="pt-2">
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

            <ul className="pt-2">
              {giving.cities.map((city) => (
                <CityCard
                  key={city.slug}
                  city={city}
                  name={giving.displayName}
                  busy={busy === city.slug}
                  onEdit={() => setEditing({ listing: null })}
                  onListing={(listed) => {
                    // a name comes first: the editor opens, and the listing follows its save
                    if (listed && !giving.displayName) setEditing({ listing: city.slug });
                    else list(city.slug, listed);
                  }}
                />
              ))}
            </ul>

            {problem && (
              <p role="alert" className="pt-1 text-xs text-taxi">
                {t.me.failed}
              </p>
            )}

            {giving.projectCents > 0 && (
              <p className="border-t border-paper/15 pt-3 text-[13px] text-paper-dim">
                {t.me.project.replace("{amount}", formatUsd(giving.projectCents, locale))}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
