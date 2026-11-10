"use client";

import { useEffect } from "react";
import type { ThemePref } from "@/lib/prefs";
import { useHydrated } from "./use-hydrated";
import { useMediaQuery } from "./use-media-query";

/** Resolves the theme setting against the system and puts it on <html> as the `dusk` class. */
export function useTheme(pref: ThemePref): "light" | "dark" {
  const hydrated = useHydrated();
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = pref === "system" ? (systemDark ? "dark" : "light") : pref;
  useEffect(() => {
    // until hydration the stored setting isn't known here; the script in layout.tsx has it right
    if (hydrated) document.documentElement.classList.toggle("dusk", theme === "dark");
  }, [hydrated, theme]);
  return theme;
}
