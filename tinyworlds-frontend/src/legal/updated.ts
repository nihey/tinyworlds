import type { Locale } from "@/i18n/locale";

/**
 * When the texts last changed (a day, UTC): the date at the top of both pages. Move it with any
 * change to what they say, and tell donors by email of a change that matters to them (the texts
 * promise both). A module of its own, so the page's script does not take the texts with it.
 */
export const LEGAL_UPDATED = "2026-11-12";

/** The date, as the visitor's language writes one: "November 11, 2026", "11 de novembro de 2026". */
export function updatedOn(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}
