"use client";

import { useEffect, useState } from "react";
import type { Strings } from "@/i18n";
import type { AdminSession, ListCounts as Counts } from "@/lib/admin";

/**
 * How many people wait to hear of each city, and of new cities: counts only, never an address.
 * Loads on its own, so a failure here leaves the rest of the page standing, and says so instead
 * of showing a table that claims nobody waits.
 */

const HEADING =
  "pb-3 text-[11px] font-semibold tracking-[0.16em] uppercase text-[#15171a]/70 dusk:text-paper-dim";

const ACTION =
  "rounded-sm text-sm font-semibold text-taxi underline underline-offset-2 outline-none focus-visible:decoration-2";

interface Props {
  session: AdminSession;
  t: Strings;
  /** the API no longer knows the session */
  onEnded: () => void;
}

type State = { status: "loading" } | { status: "failed" } | { status: "ready"; counts: Counts };

export function ListCounts({ session, t, onEnded }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const words = t.lists.admin;

  useEffect(() => {
    let live = true;
    import("@/lib/admin-api")
      .then((api) => api.fetchListCounts(session))
      .then(
        (counts) => {
          if (live) setState({ status: "ready", counts });
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

  const number = new Intl.NumberFormat();
  const cell = "py-2 text-[15px] text-paper";

  return (
    <section aria-labelledby="admin-lists">
      <h2 id="admin-lists" className={HEADING}>
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
        {state.status === "ready" && (
          <table className="w-full max-w-xl border-collapse text-left">
            <thead>
              <tr className="border-b border-sign-line/60 text-xs text-paper-dim">
                <th scope="col" className="py-2 font-semibold">
                  {words.city}
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  {words.waiting}
                </th>
              </tr>
            </thead>
            <tbody>
              {state.counts.cities.length === 0 && (
                <tr className="border-b border-sign-line/60">
                  <td colSpan={2} className={`${cell} text-paper-dim`}>
                    {words.empty}
                  </td>
                </tr>
              )}
              {state.counts.cities.map((row) => (
                <tr key={row.slug} className="border-b border-sign-line/60">
                  <th scope="row" className={`${cell} font-normal`}>
                    {row.name}
                  </th>
                  <td className={`${cell} text-right tabular-nums`}>
                    {number.format(row.waiting)}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row" className={`${cell} font-semibold`}>
                  {words.newCities}
                </th>
                <td className={`${cell} text-right font-semibold tabular-nums`}>
                  {number.format(state.counts.newCities)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
