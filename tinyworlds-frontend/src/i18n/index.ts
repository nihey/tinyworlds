import { prefsStore } from "@/lib/prefs";
import { SITE_HOME_LOCALE } from "@/site";
import { en } from "./en";
import { esES } from "./es-ES";
import { resolveLocale, type Locale } from "./locale";
import { ptBR } from "./pt-BR";
import type { Strings } from "./types";

export {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_NAMES,
  LOCALES,
  ogLocale,
  resolveLocale,
  type Locale,
  type LocalePref,
} from "./locale";
export type { Strings } from "./types";

export const DICTIONARIES: Record<Locale, Strings> = { "en-US": en, "pt-BR": ptBR, "es-ES": esES };

/**
 * The visitor's language, as an external store for React. The page is prerendered in the site's
 * home language, which is also what hydration sees; once running, the browser's own answer takes
 * over: the language chosen in the settings, or else the first of the browser's that we speak.
 */
export const localeStore = {
  subscribe(listener: () => void): () => void {
    const off = prefsStore.subscribe(listener);
    window.addEventListener("languagechange", listener);
    return () => {
      off();
      window.removeEventListener("languagechange", listener);
    };
  },
  getSnapshot(): Locale {
    const chosen = prefsStore.getSnapshot().lang;
    return chosen === "auto" ? resolveLocale(navigator.languages) : chosen;
  },
  getServerSnapshot(): Locale {
    return SITE_HOME_LOCALE;
  },
};

/** The language right now, for code that is not a component (errors thrown while loading). */
export function activeLocale(): Locale {
  return typeof window === "undefined"
    ? localeStore.getServerSnapshot()
    : localeStore.getSnapshot();
}

/** The interface's words right now, for code that is not a component. Components use `useI18n()`. */
export function activeStrings(): Strings {
  return DICTIONARIES[activeLocale()];
}
