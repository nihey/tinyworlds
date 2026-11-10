/**
 * The languages the interface speaks. Which one a visitor gets is decided in their browser, at
 * run time: their own choice in the settings if they made one, otherwise the first language
 * their browser asks for that we have.
 */
export const LOCALES = ["en-US", "pt-BR", "es-ES"] as const;
export type Locale = (typeof LOCALES)[number];

/** The setting: a language, or "follow the browser". */
export type LocalePref = "auto" | Locale;

export const DEFAULT_LOCALE: Locale = "en-US";

/** Each language under its own name, for the list where one is chosen. */
export const LOCALE_NAMES: Record<Locale, string> = {
  "en-US": "English",
  "pt-BR": "Português",
  "es-ES": "Español",
};

/** Any variety of a language gets the one variety we have: pt-PT reads pt-BR, es-MX reads es-ES. */
const BY_LANGUAGE: Record<string, Locale> = { en: "en-US", pt: "pt-BR", es: "es-ES" };

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (LOCALES as readonly string[]).includes(value);

/**
 * The first of the browser's languages (`navigator.languages`, most wanted first) that we speak,
 * matched on the primary subtag; English when none is.
 */
export function resolveLocale(languages: readonly string[] | null | undefined): Locale {
  for (const tag of languages ?? []) {
    if (typeof tag !== "string") continue;
    const match = BY_LANGUAGE[tag.trim().toLowerCase().split(/[-_]/)[0]];
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/** "pt-BR" as Open Graph writes it: "pt_BR". */
export const ogLocale = (locale: Locale): string => locale.replace("-", "_");
