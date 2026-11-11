"use client";

import { useEffect, useState } from "react";
import { BenefactorLinks } from "@/components/benefactors/benefactor-link";
import type { Locale, Strings } from "@/i18n";
import type { AdminSession, BenefactorName } from "@/lib/admin";
import { cn } from "@/lib/utils";

/**
 * The names donors chose to show on benefactors' pages, and the links they put beside them,
 * newest gift first. An admin hides a name that should not be there (its links go with it),
 * or only the links, and shows them again: it is reversible, so it acts at once, with no
 * confirmation. Loads on its own, so a failure here leaves the funnel above it standing.
 */

const HEADING =
  "pb-3 text-[11px] font-semibold tracking-[0.16em] uppercase text-[#15171a]/70 dusk:text-paper-dim";

const ACTION =
  "rounded-sm text-sm font-semibold text-taxi underline underline-offset-2 outline-none focus-visible:decoration-2 disabled:opacity-50";

interface Props {
  session: AdminSession;
  locale: Locale;
  t: Strings;
  /** the API no longer knows the session */
  onEnded: () => void;
}

type State =
  { status: "loading" } | { status: "failed" } | { status: "ready"; rows: BenefactorName[] };

export function Names({ session, locale, t, onEnded }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // donors whose switch is in flight, and one whose switch failed
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [failedId, setFailedId] = useState<string | null>(null);
  const words = t.admin.names;

  useEffect(() => {
    let live = true;
    import("@/lib/admin-api")
      .then((api) => api.fetchNames(session))
      .then(
        (rows) => {
          if (live) setState({ status: "ready", rows });
        },
        (error: unknown) => {
          if (!live) return;
          if ((error as { kind?: string } | null)?.kind === "unauthorized") onEnded();
          else setState({ status: "failed" });
        },
      );
    return () => {
      live = false;
    };
  }, [session, attempt, onEnded]);

  /** Flips one of a donor's two switches: the name's, or the links'. */
  const toggle = (row: BenefactorName, what: "hidden" | "linksHidden") => {
    setFailedId(null);
    setBusy((now) => new Set(now).add(row.donorId));
    import("@/lib/admin-api")
      .then((api) =>
        what === "hidden"
          ? api.setNameHidden(session, row.donorId, !row.hidden)
          : api.setLinksHidden(session, row.donorId, !row.linksHidden),
      )
      .then(
        () =>
          setState((now) =>
            now.status === "ready"
              ? {
                  status: "ready",
                  rows: now.rows.map((r) =>
                    r.donorId === row.donorId ? { ...r, [what]: !row[what] } : r,
                  ),
                }
              : now,
          ),
        (error: unknown) => {
          if ((error as { kind?: string } | null)?.kind === "unauthorized") onEnded();
          else setFailedId(row.donorId);
        },
      )
      .finally(() =>
        setBusy((now) => {
          const next = new Set(now);
          next.delete(row.donorId);
          return next;
        }),
      );
  };

  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <section aria-labelledby="admin-names">
      <h2 id="admin-names" className={HEADING}>
        {words.heading}
      </h2>
      <div className="sign px-5 py-5 sm:px-6">
        <p className="max-w-2xl pb-3 text-sm leading-relaxed text-paper-dim">{words.note}</p>
        {state.status === "loading" && (
          <p role="status" className="text-[15px] text-paper">
            {t.admin.loading}
          </p>
        )}
        {state.status === "failed" && (
          <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[15px] text-paper">{t.admin.loadFailed}</p>
            <button
              type="button"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt(attempt + 1);
              }}
              className={ACTION}
            >
              {t.admin.retry}
            </button>
          </div>
        )}
        {state.status === "ready" &&
          (state.rows.length === 0 ? (
            <p className="text-[15px] text-paper">{words.empty}</p>
          ) : (
            <ul>
              {state.rows.map((row) => (
                <li
                  key={row.donorId}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-sign-line/60 py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-[15px] font-semibold break-words text-paper",
                        row.hidden && "opacity-60",
                      )}
                    >
                      {row.name}
                      {row.hidden && (
                        <span className="ml-2 text-xs font-semibold text-paper-dim">
                          {words.hidden}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-paper-dim">
                      {row.cities.length > 0 &&
                        `${words.cities.replace("{cities}", row.cities.join(", "))} · `}
                      {when.format(new Date(row.lastGiftAt))}
                    </p>
                    {row.links.length > 0 && (
                      <div className={cn("pt-2", (row.hidden || row.linksHidden) && "opacity-60")}>
                        {row.linksHidden && (
                          <p className="pb-1.5 text-xs font-semibold text-paper-dim">
                            {words.linksHidden}
                          </p>
                        )}
                        <BenefactorLinks links={row.links} look="row" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {failedId === row.donorId && (
                      <span role="alert" className="text-xs text-paper-dim">
                        {t.admin.loadFailed}
                      </span>
                    )}
                    {row.links.length > 0 && (
                      <button
                        type="button"
                        disabled={busy.has(row.donorId)}
                        onClick={() => toggle(row, "linksHidden")}
                        className={ACTION}
                      >
                        {row.linksHidden ? words.showLinks : words.hideLinks}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy.has(row.donorId)}
                      onClick={() => toggle(row, "hidden")}
                      className={ACTION}
                    >
                      {row.hidden ? words.unhide : words.hide}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </section>
  );
}
