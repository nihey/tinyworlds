"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/donate";
import {
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
   * The first counts that came: what the cards are ordered by. Later answers change the numbers
   * on the cards, never their order, so nothing moves under the pointer.
   */
  ranked: WorldCounts | null;
}

/**
 * The worlds' visits for the front page's cards: asked at once, then every half minute while
 * the page is in view. A failed answer keeps the last counts on the cards.
 */
export function useWorldVisits(worlds: string[]): WorldVisitsState {
  const [state, setState] = useState<WorldVisitsState>({ counts: null, ranked: null });
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
