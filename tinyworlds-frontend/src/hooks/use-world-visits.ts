"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/donate";
import {
  bakedCounts,
  documentPage,
  everyWhileShown,
  fetchWorldVisits,
  VISITS_EVERY_MS,
  type WorldCounts,
} from "@/lib/visits";

export interface WorldVisitsState {
  /** the latest counts; null until the first answer, and for good without an API */
  counts: WorldCounts | null;
  /**
   * The counts the page's visit ranking comes from: those baked into the page when it was built,
   * or else the first answer. Later replies refresh the displayed counts while preserving
   * navigation and card order.
   */
  ranked: WorldCounts | null;
}

/**
 * The worlds' visits for the front page's cards: asked at once, then every half minute while
 * the page is in view. A failed answer keeps the last counts on the cards. `baked` is every
 * world's visits as the build found them ([world, visits]): the page is ranked by them from
 * the first paint, and shows them until the first answer (with nobody exploring: who was there
 * when the page was built is no one's business now).
 */
export function useWorldVisits(
  worlds: string[],
  baked: [string, number][] | null = null,
): WorldVisitsState {
  const [state, setState] = useState<WorldVisitsState>(() => {
    const counts = API_URL && baked ? bakedCounts(baked) : null;
    return { counts, ranked: counts };
  });
  const key = worlds.join(",");
  useEffect(() => {
    if (!API_URL || !key) return;
    let live = true;
    const ask = () => {
      fetchWorldVisits(key.split(","))
        .then((counts) => {
          if (live) setState((was) => ({ counts, ranked: was.ranked ?? counts }));
        })
        .catch(() => {
          // the API is away: the cards keep what they last said (or say nothing)
        });
    };
    const stop = everyWhileShown(ask, VISITS_EVERY_MS, documentPage(), { atOnce: true });
    return () => {
      live = false;
      stop();
    };
  }, [key]);
  return state;
}
