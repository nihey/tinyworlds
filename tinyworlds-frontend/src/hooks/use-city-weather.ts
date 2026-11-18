"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/donate";
import { documentPage, everyWhileShown } from "@/lib/visits";
import type { WeatherReport } from "@/lib/weather-api";
import type { WeatherPref } from "@/map/weather";
import { WORLD } from "@/worlds";
import { useHydrated } from "./use-hydrated";

/** One report for both orientations and the walk. Only the visible live map polls. */
export function useCityWeather(pref: WeatherPref) {
  const hydrated = useHydrated();
  const [report, setReport] = useState<WeatherReport | null | undefined>(undefined);
  useEffect(() => {
    if (pref !== "live" || !hydrated || !API_URL || WORLD.fictional) return;
    const abort = new AbortController();
    let next = 0;
    const read = async () => {
      if (Date.now() < next) return;
      next = Date.now() + 60_000;
      try {
        const { fetchWeather } = await import("@/lib/weather-api");
        if (abort.signal.aborted) return;
        const observation = await fetchWeather(WORLD.id, abort.signal);
        if (abort.signal.aborted) return;
        setReport(observation);
        if (observation) next = Date.now() + 10 * 60_000;
      } catch {
        if (!abort.signal.aborted) setReport(null);
      }
    };
    const stop = everyWhileShown(() => void read(), 60_000, documentPage(), { atOnce: true });
    return () => {
      stop();
      abort.abort();
    };
  }, [pref, hydrated]);
  const live = API_URL ? report : null;
  return { condition: pref === "live" ? (live?.condition ?? "clear") : pref, report: live };
}
