"use client";

import { useEffect, useState } from "react";
import { API_URL, type CityMilestone, type ListState } from "@/lib/donate";
import { fetchMilestones } from "@/lib/milestones";

export interface Milestones {
  state: ListState;
  cities: CityMilestone[];
}

/**
 * The cities people are funding, fetched once when the component appears (a plain `fetch`: no
 * Apollo). "idle" for good when the build has no API; "failed" on any error or after five
 * seconds, and the caller carries on without the list. A new `version` fetches again (the
 * counts of who waits change when someone joins), keeping what is shown until the answer comes.
 *
 * `baked` is the list as the build found it (the front page bakes it into its HTML): shown from
 * the first paint and asked again at once, and kept if that fails.
 */
export function useMilestones(version = 0, baked: CityMilestone[] | null = null): Milestones {
  const [milestones, setMilestones] = useState<Milestones>(() =>
    baked && API_URL
      ? { state: "ready", cities: baked }
      : { state: API_URL ? "loading" : "idle", cities: [] },
  );
  useEffect(() => {
    if (!API_URL) return;
    let live = true;
    fetchMilestones()
      .then((cities) => {
        if (live) setMilestones({ state: "ready", cities });
      })
      .catch(() => {
        // a later reading that fails leaves the earlier answer standing
        if (live)
          setMilestones((old) => (old.state === "ready" ? old : { state: "failed", cities: [] }));
      });
    return () => {
      live = false;
    };
  }, [version]);
  return milestones;
}
