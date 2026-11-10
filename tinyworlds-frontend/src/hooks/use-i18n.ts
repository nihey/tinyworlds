"use client";

import { useSyncExternalStore } from "react";
import { DICTIONARIES, localeStore, type Locale, type Strings } from "@/i18n";
import { WORLD, type WorldCopy } from "@/worlds";

/** The visitor's language. The world's home language while prerendering and hydrating. */
export function useLocale(): Locale {
  return useSyncExternalStore(
    localeStore.subscribe,
    localeStore.getSnapshot,
    localeStore.getServerSnapshot,
  );
}

export interface I18n {
  locale: Locale;
  /** the interface's words */
  t: Strings;
  /** this world's own words: its name, its About text */
  copy: WorldCopy;
}

/** Everything a component says, in the visitor's language. Components never hard-code text. */
export function useI18n(): I18n {
  const locale = useLocale();
  return { locale, t: DICTIONARIES[locale], copy: WORLD.copy[locale] };
}
