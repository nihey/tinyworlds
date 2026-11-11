"use client";

import { SectionHead } from "@/components/home/section-head";
import { SmallWorldCard } from "@/components/home/world-card";
import { FOG_LINK } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import { useWorldVisits } from "@/hooks/use-world-visits";
import { byVisits } from "@/lib/visits";
import { CITIES_PATH } from "@/site";
import { WORLDS } from "@/worlds";

const WORLD_IDS = Object.keys(WORLDS);

/** How many worlds stand under a donor's page: two rows of four. */
const SHOWN = 8;

/**
 * The way back to the maps from "Your cities": the most visited worlds, cities and imagined
 * places together, as small cards, and a link to all of them on the front page.
 */
export function KeepExploring() {
  const { t } = useI18n();
  const visits = useWorldVisits(WORLD_IDS);
  const worlds = byVisits(Object.values(WORLDS), visits.ranked).slice(0, SHOWN);
  return (
    <section aria-labelledby="exploring" className="pt-4">
      <SectionHead id="exploring" title={t.me.exploring.title} line={t.me.exploring.body} />
      <ul className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {worlds.map((world) => (
          <li key={world.id} className="min-w-0">
            <SmallWorldCard world={world} count={visits.counts?.get(world.id)} />
          </li>
        ))}
      </ul>
      <p className="pt-4 text-sm">
        <a href={CITIES_PATH} className={FOG_LINK}>
          {t.me.exploring.all.replace("{n}", String(WORLD_IDS.length))}
        </a>
      </p>
    </section>
  );
}
