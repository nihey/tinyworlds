"use client";

import { Bell } from "lucide-react";
import { NewCitiesButton } from "@/components/lists/new-cities-button";
import { useI18n } from "@/hooks/use-i18n";
import { formatUsd } from "@/lib/donate";
import type { ListCity, ListKey, MyLists } from "@/lib/lists";

const LEAVE =
  "shrink-0 rounded-sm text-[13px] font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi disabled:pointer-events-none disabled:opacity-60";

/**
 * "Your lists": the cities the donor waits to hear about, and "new cities", each with the way
 * off the list; with none, how to get on one. Nothing is shown until the lists are known, so a
 * slow or failed load never says they are empty.
 */
export function YourLists({
  lists,
  busy,
  onJoin,
  onLeave,
}: {
  /** null while loading, and after a load that failed */
  lists: MyLists | null;
  busy: boolean;
  onJoin: (key: ListKey) => void;
  onLeave: (key: ListKey) => void;
}) {
  const { t, locale } = useI18n();
  if (!lists) return null;
  const words = t.lists.me;
  const empty = !lists.newCities && lists.cities.length === 0;

  const status = (city: ListCity): string => {
    if (city.status === "FUNDED") return t.donate.status.funded;
    if (city.status === "BUILDING") return t.donate.status.building;
    if (city.status === "BUILT") return t.donate.status.built;
    return t.donate.progress
      .replace("{raised}", formatUsd(city.raisedCents, locale))
      .replace("{goal}", formatUsd(city.goalCents, locale));
  };

  return (
    <section aria-labelledby="your-lists" className="sign px-5 py-5 sm:px-6">
      <h2
        id="your-lists"
        className="flex items-center gap-2 text-lg leading-tight font-semibold text-paper"
      >
        <Bell aria-hidden className="size-4 shrink-0 text-taxi" strokeWidth={2.5} />
        {words.title}
      </h2>
      {empty ? (
        <div className="grid justify-items-start gap-3 pt-3">
          <p className="text-sm leading-relaxed text-paper-dim">{words.empty}</p>
          <NewCitiesButton
            on={false}
            onJoin={() => onJoin({ kind: "new" })}
            onLeave={() => onLeave({ kind: "new" })}
          />
          <p className="text-sm leading-relaxed text-paper-dim">{words.pressTellMe}</p>
        </div>
      ) : (
        <ul className="grid gap-2 pt-3">
          {lists.cities.map((city) => (
            <li key={city.slug} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-sm">
                <b className="font-semibold text-paper">{city.name}</b>
                <span className="text-paper-dim"> · {status(city)}</span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onLeave({ kind: "city", slug: city.slug, name: city.name })}
                aria-label={words.leaveLabel.replace("{city}", city.name)}
                className={LEAVE}
              >
                {words.leave}
              </button>
            </li>
          ))}
          {lists.newCities && (
            <li className="flex items-baseline justify-between gap-3">
              <b className="min-w-0 text-sm font-semibold text-paper">{words.newCities}</b>
              <button
                type="button"
                disabled={busy}
                onClick={() => onLeave({ kind: "new" })}
                aria-label={words.leaveLabel.replace("{city}", words.newCities)}
                className={LEAVE}
              >
                {words.leave}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
