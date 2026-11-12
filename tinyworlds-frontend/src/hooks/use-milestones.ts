"use client";

import { useEffect, useState } from "react";
import { API_URL, type CityMilestone, type ListState } from "@/lib/donate";

export interface Milestones {
  state: ListState;
  cities: CityMilestone[];
}

/**
 * The cities people are funding, fetched once when the component appears. "idle" for good when
 * the build has no API; "failed" on any error or after five seconds, and the caller carries on
 * without the list. Apollo is only downloaded here, when something actually asks. A new
 * `version` fetches again (the counts of who waits change when someone joins), keeping what is
 * shown until the answer comes.
 */
export function useMilestones(version = 0): Milestones {
  const [milestones, setMilestones] = useState<Milestones>({
    state: API_URL ? "loading" : "idle",
    cities: [],
  });
  useEffect(() => {
    if (!API_URL) return;
    let live = true;
    import("@/lib/donate-api")
      .then((api) => api.fetchMilestones())
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
