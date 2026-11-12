import type { Locale } from "@/i18n/locale";

/**
 * Donations. Two ways in, both optional and both named by the build environment:
 *
 * - payment links: hosted checkouts (Stripe payment links), one per language, where the donor
 *   sets the amount and may name a city in a text field;
 * - the API (GraphQL): lists the cities people are funding and opens a checkout for one of them.
 *
 * With the API the donor picks a city here and sees how far each is from being built; the links
 * are then the fallback, because donating must never depend on the API being up. With neither,
 * nothing about donating is shown.
 */

type Links = Record<Locale, string>;

// the references must stay literal for Next to inline them
export const DONATE_LINKS: Links = {
  "en-US": (process.env.NEXT_PUBLIC_DONATE_URL ?? "").trim(),
  "pt-BR": (process.env.NEXT_PUBLIC_DONATE_URL_PT ?? "").trim(),
  "es-ES": (process.env.NEXT_PUBLIC_DONATE_URL_ES ?? "").trim(),
};

/** The GraphQL endpoint: a full URL or a same-origin path. Empty when the build has no API. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();

/** What the hosted checkout calls each of our languages. */
export const CHECKOUT_LOCALE: Record<Locale, string> = {
  "en-US": "en",
  "pt-BR": "pt-BR",
  "es-ES": "es",
};

/**
 * A payment link addressed to one world: the link plus the two things the checkout reads from
 * its query string, which world sent the donor (`client_reference_id`) and which language to
 * speak (`locale`). Whatever the link already carries is kept. Null when there is no usable link.
 */
export function donateUrl(
  base: string | undefined,
  worldId: string,
  locale: Locale,
): string | null {
  const trimmed = (base ?? "").trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  url.searchParams.set("client_reference_id", worldId);
  url.searchParams.set("locale", CHECKOUT_LOCALE[locale]);
  return url.toString();
}

/** The payment link for a language: its own, or else the default (English) one. */
export function paymentLinkFor(
  locale: Locale,
  worldId: string,
  links: Links = DONATE_LINKS,
): string | null {
  return donateUrl(links[locale] || links["en-US"], worldId, locale);
}

// ---------------------------------------------------------------------------------------------
// the cities people are funding
// ---------------------------------------------------------------------------------------------

export type CityStatus = "PROPOSED" | "FUNDED" | "BUILDING" | "BUILT";

export interface CityMilestone {
  id: string;
  slug: string;
  name: string;
  raisedCents: number;
  goalCents: number;
  donations: number;
  /** how many people gave to it (a donor once, however many gifts); absent from an older API */
  benefactorCount?: number;
  status: CityStatus;
  /** the world a built city lives at: "/<worldId>/" */
  worldId: string | null;
  /** people waiting to hear when it is built */
  waiting: number;
}

/** Keeps the well-formed entries of whatever the API answered. */
export function parseMilestones(value: unknown): CityMilestone[] {
  if (!Array.isArray(value)) return [];
  const out: CityMilestone[] = [];
  for (const item of value as Record<string, unknown>[]) {
    if (!item || typeof item.name !== "string" || item.name.trim() === "") continue;
    const status = item.status;
    out.push({
      id: String(item.id ?? item.slug ?? item.name),
      slug: typeof item.slug === "string" ? item.slug : "",
      name: item.name.trim(),
      raisedCents: Math.max(0, Number(item.raisedCents) || 0),
      goalCents: Math.max(0, Number(item.goalCents) || 0),
      donations: Math.max(0, Number(item.donations) || 0),
      ...(typeof item.benefactorCount === "number"
        ? { benefactorCount: Math.max(0, Math.floor(item.benefactorCount) || 0) }
        : {}),
      status:
        status === "FUNDED" || status === "BUILDING" || status === "BUILT" ? status : "PROPOSED",
      worldId:
        typeof item.worldId === "string" && /^[a-z0-9-]+$/.test(item.worldId) ? item.worldId : null,
      waiting: Math.max(0, Number(item.waiting) || 0),
    });
  }
  return out;
}

/** How full a city's bar is, 0 to 1: it never overflows, and a city with no goal is only full once given to. */
export function progress(city: Pick<CityMilestone, "raisedCents" | "goalCents">): number {
  if (!(city.goalCents > 0)) return city.raisedCents > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, city.raisedCents / city.goalCents));
}

/** Whole dollars, the way the visitor's language writes them. */
export function formatUsd(cents: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** "3 donations", "1 donation", "No donations yet", in the visitor's language. `{n}` is the count. */
export function donationsLabel(
  count: number,
  locale: Locale,
  words: { none: string; one: string; other: string },
): string {
  if (!(count > 0)) return words.none;
  const form = new Intl.PluralRules(locale).select(count) === "one" ? words.one : words.other;
  return form.replace("{n}", new Intl.NumberFormat(locale).format(count));
}

/** How the visitor's language writes the dollar sign: "$", "US$". */
export function usdSymbol(locale: Locale): string {
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).formatToParts(
    0,
  );
  return parts.find((part) => part.type === "currency")?.value ?? "$";
}

/** A built city is done: there is nothing left to fund. */
export const selectable = (city: CityMilestone): boolean => city.status !== "BUILT";

// ---------------------------------------------------------------------------------------------
// the donor's choice → a checkout
// ---------------------------------------------------------------------------------------------

/** What the donor is giving towards: a city from the list, one they typed, or none in particular. */
export type Choice =
  { kind: "none" } | { kind: "city"; name: string } | { kind: "other"; text: string };

export const CITY_MAX = 60;

// ---------------------------------------------------------------------------------------------
// amounts
// ---------------------------------------------------------------------------------------------

/** Whole US dollars: what the chips offer, and the limits of what may be typed. */
export const AMOUNT_PRESETS = [5, 10, 25, 50, 100] as const;
export const AMOUNT_MIN = 1;
export const AMOUNT_MAX = 10000;
export const AMOUNT_DEFAULT = 10;

export function clampAmount(dollars: number): number {
  if (!Number.isFinite(dollars)) return AMOUNT_MIN;
  return Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, Math.round(dollars)));
}

/**
 * What someone typed as an amount → whole dollars within the limits, or null when there is no
 * number in it. "25", "$25" and "25.00" are all twenty-five: only the whole part is read.
 */
export function parseAmount(text: string): number | null {
  const whole = /\d+/.exec(text)?.[0];
  if (!whole) return null;
  return clampAmount(Number(whole));
}

export interface CheckoutInput {
  city: string | null;
  /** US cents; null leaves the amount to the checkout page. */
  amountCents: number | null;
  world: string;
  locale: Locale;
  returnUrl: string;
  /** this tab's visit (lib/funnel.ts), so the donation can be told apart in the funnel; null when visits are not counted */
  visitId: string | null;
  /** the name to list among the city's benefactors (already cleaned); null to give anonymously */
  benefactorName: string | null;
}

/** The name of the chosen city as it is sent: tidied, at most 60 characters, null for none. */
export function chosenCity(choice: Choice): string | null {
  const raw = choice.kind === "city" ? choice.name : choice.kind === "other" ? choice.text : "";
  const tidy = raw.replace(/\s+/g, " ").trim().slice(0, CITY_MAX).trim();
  // a "name" with no letter or digit in it is no city
  return /[\p{L}\p{N}]/u.test(tidy) ? tidy : null;
}

export function checkoutInput(
  choice: Choice,
  amountDollars: number | null,
  world: string,
  locale: Locale,
  returnUrl: string,
  visitId: string | null = null,
  benefactorName: string | null = null,
): CheckoutInput {
  return {
    city: chosenCity(choice),
    amountCents: amountDollars === null ? null : clampAmount(amountDollars) * 100,
    world,
    locale,
    returnUrl,
    visitId,
    benefactorName,
  };
}

/** Where the checkout sends the donor back to: this page, without its query or hash. */
export const returnUrlOf = (location: { origin: string; pathname: string }): string =>
  location.origin + location.pathname;

/** A checkout address is only followed if it is a web address. */
export function isCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export type ListState = "idle" | "loading" | "ready" | "failed";

/**
 * Which way the sign takes donations right now.
 *
 * - "none": this build takes none;
 * - "api": pick a city here, then the API opens the checkout;
 * - "link": the payment link, because there is no API, or it failed (its list or its checkout)
 *   and there is a link to fall back on.
 */
export function donateMode(state: {
  api: boolean;
  link: boolean;
  list: ListState;
  checkoutFailed: boolean;
}): "none" | "api" | "link" {
  if (!state.api) return state.link ? "link" : "none";
  if (state.link && (state.checkoutFailed || state.list === "failed")) return "link";
  return "api";
}

/** Gives up on a promise that takes too long: the API must never keep a donor waiting. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export const API_TIMEOUT = 5000;

// ---------------------------------------------------------------------------------------------
// coming back from the checkout
// ---------------------------------------------------------------------------------------------

/**
 * The checkout returns the donor to the page with `?donated=1` (paid) or `?donated=0` (gave up).
 * Reads that from a query string and hands back the query without it, so the address can be
 * tidied; `donated` is null when the page was not arrived at from a checkout.
 */
export function readDonated(search: string): { donated: boolean | null; search: string } {
  const params = new URLSearchParams(search);
  const value = params.get("donated");
  if (value === null) return { donated: null, search };
  params.delete("donated");
  const rest = params.toString();
  return { donated: value === "1", search: rest ? `?${rest}` : "" };
}
