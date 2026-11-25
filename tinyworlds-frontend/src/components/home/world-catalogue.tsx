"use client";

import { Search } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { WorldCard } from "@/components/home/world-card";
import { useI18n } from "@/hooks/use-i18n";
import type { BroughtWorld } from "@/lib/brought-by";
import { filterWorlds, type WorldFilter } from "@/lib/home";
import { cn } from "@/lib/utils";
import type { WorldCounts } from "@/lib/visits";
import type { World } from "@/worlds";

const FILTERS = ["all", "real", "imagined"] as const;

function subscribeHashChange(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function WorldCatalogue({
  worlds,
  visits,
  benefactorWorlds,
  brought,
  onBenefactors,
}: {
  worlds: World[];
  visits: WorldCounts | null | undefined;
  benefactorWorlds: ReadonlySet<string>;
  brought: ReadonlyMap<string, BroughtWorld>;
  onBenefactors: (world: string) => void;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<{ filter: WorldFilter; anchor: WorldFilter }>();
  const anchor = useSyncExternalStore<WorldFilter>(
    subscribeHashChange,
    () => (window.location.hash === "#imagined" ? "imagined" : "all"),
    () => "all",
  );
  const filter = selection?.anchor === anchor ? selection.filter : anchor;
  const results = filterWorlds(worlds, filter, query);

  return (
    <section id="cities" aria-labelledby="world-catalogue-heading" className="relative scroll-mt-6">
      <span id="imagined" className="absolute top-0 scroll-mt-6" />
      <div className="rounded-sm bg-[#1c2a24] p-4 text-paper sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2
              id="world-catalogue-heading"
              className="text-3xl leading-none font-extrabold tracking-[-0.055em] sm:text-5xl"
            >
              {t.home.catalogue.title}
            </h2>
            {visits && <p className="mt-2 text-sm text-[#c0c9bd]">{t.home.catalogue.ranked}</p>}
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-sm bg-[#f9f3e4] px-3 text-[#242e25] focus-within:ring-2 focus-within:ring-taxi md:w-72 lg:w-80">
            <Search aria-hidden className="size-4 shrink-0" />
            <input
              type="search"
              aria-label={t.home.catalogue.search}
              placeholder={t.home.catalogue.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-[#536354]"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/15 py-2.5">
          <div role="group" aria-label={t.home.catalogue.filters} className="flex flex-wrap gap-1">
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setSelection({ filter: option, anchor })}
                className={cn(
                  "min-h-9 rounded-sm px-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-taxi focus-visible:ring-offset-2 focus-visible:ring-offset-[#1c2a24] sm:px-3 sm:text-sm",
                  filter === option ? "bg-taxi text-taxi-ink" : "text-paper hover:bg-white/10",
                )}
              >
                {t.home.catalogue[option]}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="text-xs text-[#c0c9bd] tabular-nums sm:text-sm">
            {t.home.catalogue.count[
              new Intl.PluralRules(locale).select(results.length) === "one" ? "one" : "other"
            ].replace("{n}", new Intl.NumberFormat(locale).format(results.length))}
          </p>
        </div>
        {results.length ? (
          <ul className="grid gap-3 min-[28rem]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {results.map((world) => (
              <li key={world.id} className="min-w-0">
                <WorldCard
                  world={world}
                  count={visits?.get(world.id)}
                  showVisits={visits !== undefined}
                  onBenefactors={
                    benefactorWorlds.has(world.id) ? () => onBenefactors(world.id) : undefined
                  }
                  brought={brought.get(world.id)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-sm text-[#c0c9bd]">{t.home.catalogue.empty}</p>
        )}
      </div>
    </section>
  );
}
