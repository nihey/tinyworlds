"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/donate";
import { fetchWall, type WallEntry } from "@/lib/wall";

/** The wall as the front page has it: on its way, or there (empty when the API is away). */
export type WallLoad = { state: "loading" } | { state: "ready"; entries: WallEntry[] };

/**
 * Everyone who gave to a city, for the front page's sides: asked once, when the page opens.
 * Without an API there is nothing to ask; a failed answer is an empty wall, which still has
 * its invitation. `baked` is the wall as the build found it: shown from the first paint, asked
 * again at once, and kept if that fails.
 */
export function useWall(baked: WallEntry[] | null = null): WallLoad {
  const [load, setLoad] = useState<WallLoad>(() =>
    baked ? { state: "ready", entries: baked } : { state: "loading" },
  );
  useEffect(() => {
    if (!API_URL) return;
    let live = true;
    fetchWall().then(
      (entries) => {
        if (live) setLoad({ state: "ready", entries });
      },
      () => {
        if (live) setLoad((was) => (was.state === "ready" ? was : { state: "ready", entries: [] }));
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return load;
}
