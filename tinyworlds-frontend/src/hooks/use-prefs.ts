"use client";

import { useSyncExternalStore } from "react";
import { prefsStore, type Prefs } from "@/lib/prefs";

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const prefs = useSyncExternalStore(
    prefsStore.subscribe,
    prefsStore.getSnapshot,
    prefsStore.getServerSnapshot,
  );
  return [prefs, prefsStore.set];
}
