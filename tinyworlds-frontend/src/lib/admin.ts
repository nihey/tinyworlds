/**
 * The admin pages: who is signed in on this browser, and the arithmetic of the donation funnel
 * they show. Pure, apart from the two functions that read and write the browser's storage.
 *
 * Signing in has no password: an admin asks for a link by email, and opening it trades the
 * token it carries (in the address's hash) for a session, which is kept in local storage and
 * sent as `Authorization: Bearer …`. The worlds and the front page share one origin, so one
 * sign-in covers them all.
 */

import { parseLinks, type BenefactorLink } from "./links";

export const ADMIN_KEY = "tinyworlds.admin";
/** Where a donor's session is kept: the same shape, a different key, so the two never mix. */
export const DONOR_KEY = "tinyworlds.donor";

/** Who signs in: an admin (the funnel) or a donor (their own cities). */
export type Purpose = "admin" | "donor";

/** A signed-in admin or donor, as this browser remembers them. */
export interface AdminSession {
  accessToken: string;
  /** ISO 8601 */
  expiresAt: string;
  email: string;
}

/** Keeps a stored session only if it is whole and still has time left. */
export function parseSession(raw: string | null, now: number): AdminSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown> | null;
    if (!value || typeof value !== "object") return null;
    const { accessToken, expiresAt, email } = value;
    if (typeof accessToken !== "string" || accessToken === "") return null;
    if (typeof expiresAt !== "string" || typeof email !== "string") return null;
    const until = Date.parse(expiresAt);
    if (!Number.isFinite(until) || until <= now) return null;
    return { accessToken, expiresAt, email };
  } catch {
    return null;
  }
}

/**
 * What the API answers when a sign-in link or code is accepted → the session to keep, or null.
 * The answer names who signed in under `admin` or `donor`: the other kind is not a session.
 */
export function sessionOf(answer: unknown, purpose: Purpose = "admin"): AdminSession | null {
  if (!answer || typeof answer !== "object") return null;
  const record = answer as Record<string, unknown>;
  const { accessToken, expiresAt } = record;
  const email = (record[purpose] as { email?: unknown } | null | undefined)?.email;
  if (typeof accessToken !== "string" || accessToken === "") return null;
  if (typeof expiresAt !== "string" || typeof email !== "string") return null;
  return { accessToken, expiresAt, email };
}

export function readSession(key: string): AdminSession | null {
  try {
    return parseSession(window.localStorage.getItem(key), Date.now());
  } catch {
    return null; // private window, or storage blocked
  }
}

export function writeSession(key: string, session: AdminSession | null): void {
  try {
    if (session) window.localStorage.setItem(key, JSON.stringify(session));
    else window.localStorage.removeItem(key);
  } catch {
    // nowhere to keep it: the session lasts as long as the page
  }
}

/** Whether an admin is signed in on this browser: their own visits are not counted. */
export function hasAdminSession(): boolean {
  return typeof window !== "undefined" && readSession(ADMIN_KEY) !== null;
}

/**
 * The token a sign-in link carries: `…/admin/#token=…`. In the hash, so it is never sent to
 * the web server nor seen by the page analytics. Null when the address carries none.
 */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return token && /^[\w-]{20,200}$/.test(token) ? token : null;
}

/**
 * The six digits of a sign-in code, however they were typed or pasted ("482 913", "482-913",
 * " 482913 "): the API's rule. Null when what is left is not exactly six digits.
 */
export function normalizeCode(text: string): string | null {
  const digits = text.replace(/[\s\u00a0-]+/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * Where signing in happens, from where GraphQL is: the API serves both under one prefix
 * ("/api/graphql" → "/api/auth/verify"). Null when the build names no API.
 */
export function authUrl(apiUrl: string, route: "magic-link" | "verify"): string | null {
  const base = apiUrl.trim().replace(/\/graphql\/?$/, "");
  return apiUrl.trim() && base !== apiUrl.trim() ? `${base}/auth/${route}` : null;
}

// ---------------------------------------------------------------------------------------------
// periods
// ---------------------------------------------------------------------------------------------

/** The periods the report offers, in days counted back from today. */
export const RANGES = [7, 30, 90, 365] as const;
export type RangeDays = (typeof RANGES)[number];
export const DEFAULT_RANGE: RangeDays = 30;

/**
 * The last `days` days as the admin's clock has them, today included: from the first of those
 * midnights to the next one. Whole days, so the report's first and last day are complete.
 */
export function rangeOf(days: number, now: Date): { from: Date; to: Date } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from, to };
}

// ---------------------------------------------------------------------------------------------
// the funnel
// ---------------------------------------------------------------------------------------------

export interface FunnelCounts {
  visits: number;
  donateOpened: number;
  checkoutStarted: number;
  checkoutCancelled: number;
  donations: number;
  raisedCents: number;
}

export interface FunnelWorld extends FunnelCounts {
  /** a world's id, "home" for the front page, null for donations that name no world */
  world: string | null;
}

export interface FunnelDay extends FunnelCounts {
  /** "2026-11-10" */
  day: string;
}

export interface FunnelDonation {
  id: string;
  createdAt: string;
  amountCents: number;
  currency: string;
  city: string | null;
  world: string | null;
  locale: string | null;
}

export interface DonationFunnel {
  timeZone: string;
  totals: FunnelCounts;
  worlds: FunnelWorld[];
  days: FunnelDay[];
  recentDonations: FunnelDonation[];
}

const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

function countsOf(value: unknown): FunnelCounts {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    visits: count(v.visits),
    donateOpened: count(v.donateOpened),
    checkoutStarted: count(v.checkoutStarted),
    checkoutCancelled: count(v.checkoutCancelled),
    donations: count(v.donations),
    raisedCents: count(v.raisedCents),
  };
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? (value as unknown[]).filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
      )
    : [];

/** Keeps the well-formed parts of whatever the API answered. */
export function parseFunnel(value: unknown): DonationFunnel {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    timeZone: text(v.timeZone) ?? "UTC",
    totals: countsOf(v.totals),
    worlds: list(v.worlds).map((world) => ({ world: text(world.world), ...countsOf(world) })),
    days: list(v.days)
      .filter((day) => typeof day.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.day))
      .map((day) => ({ day: day.day as string, ...countsOf(day) })),
    recentDonations: list(v.recentDonations)
      .filter((d) => typeof d.createdAt === "string" && !Number.isNaN(Date.parse(d.createdAt)))
      .map((d) => ({
        id: String(d.id ?? d.createdAt),
        createdAt: d.createdAt as string,
        amountCents: count(d.amountCents),
        currency: (text(d.currency) ?? "usd").toLowerCase(),
        city: text(d.city),
        world: text(d.world),
        locale: text(d.locale),
      })),
  };
}

export type StepKey = "visits" | "donateOpened" | "checkoutStarted" | "donations";

export interface FunnelStepRow {
  key: StepKey;
  count: number;
  /** of the step before, 0 to 1; null for the first step, and when nobody reached the one before */
  ofPrevious: number | null;
  /** of all visits, 0 to 1; null when there were none */
  ofVisits: number | null;
}

/** Part of a whole as a share from 0 to 1: never more than all of it, null of nothing. */
export function share(part: number, whole: number): number | null {
  if (!(whole > 0)) return null;
  return Math.min(1, Math.max(0, part / whole));
}

/**
 * The four steps in order, each with how many of the step before went on to it. Donations can
 * outnumber the checkouts seen (a gift through the plain payment link starts no checkout
 * here): a share is then simply all of it.
 */
export function funnelSteps(totals: FunnelCounts): FunnelStepRow[] {
  const keys: StepKey[] = ["visits", "donateOpened", "checkoutStarted", "donations"];
  return keys.map((key, i) => ({
    key,
    count: totals[key],
    ofPrevious: i === 0 ? null : share(totals[key], totals[keys[i - 1]]),
    ofVisits: i === 0 ? null : share(totals[key], totals.visits),
  }));
}

/** A share the way the visitor's language writes it: "1.5%", "1,5 %". Small ones keep a decimal. */
export function formatShare(value: number | null, locale: string): string {
  if (value === null) return "–";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: value > 0 && value < 0.1 ? 1 : 0,
  }).format(value);
}

/**
 * The maps by visits, the most visited first, with the front page and the donations that name
 * no map set apart: they are not cities, and do not belong in a ranking of them.
 */
export function rankWorlds(worlds: FunnelWorld[]): {
  ranked: FunnelWorld[];
  frontPage: FunnelWorld | null;
  unnamed: FunnelWorld | null;
} {
  return {
    ranked: worlds
      .filter((entry) => entry.world !== null && entry.world !== "home")
      .sort((a, b) => b.visits - a.visits || b.donations - a.donations),
    frontPage: worlds.find((entry) => entry.world === "home") ?? null,
    unnamed: worlds.find((entry) => entry.world === null) ?? null,
  };
}

/** "2026-11-10" as a date at noon UTC: safe to format in UTC, whatever the reader's zone. */
export const dayDate = (day: string): Date => new Date(`${day}T12:00:00Z`);

// ---------------------------------------------------------------------------------------------
// the names
// ---------------------------------------------------------------------------------------------

/** A name donors chose to show, as an admin sees it: hidden ones are listed too. */
export interface BenefactorName {
  donorId: string;
  name: string;
  hidden: boolean;
  /** the names of the cities the donor gave to */
  cities: string[];
  /** ISO 8601 */
  lastGiftAt: string;
  /** the donor's links, each with its picture, hidden or not: what there is to review */
  links: BenefactorLink[];
  /** the links are kept off the lists (the name may still show) */
  linksHidden: boolean;
}

/**
 * Keeps the well-formed rows of whatever the API answered, in its order. `origin` is where the
 * API serves the links' pictures from.
 */
export function parseNames(value: unknown, origin: string | null = null): BenefactorName[] {
  return list(value).flatMap((row) => {
    const { donorId, name, hidden, lastGiftAt } = row;
    if (typeof donorId !== "string" || donorId === "") return [];
    if (typeof name !== "string" || name.trim() === "") return [];
    if (typeof hidden !== "boolean") return [];
    if (typeof lastGiftAt !== "string" || Number.isNaN(Date.parse(lastGiftAt))) return [];
    const cities = Array.isArray(row.cities)
      ? (row.cities as unknown[]).filter((c): c is string => typeof c === "string" && c !== "")
      : [];
    return [
      {
        donorId,
        name,
        hidden,
        cities,
        lastGiftAt,
        links: parseLinks(row.links, origin),
        linksHidden: row.linksHidden === true,
      },
    ];
  });
}

/** How many people wait on each list: counts only, never an address. */
export interface ListCounts {
  /** a city per row, most waited for first, as the API gave them */
  cities: { name: string; slug: string; waiting: number }[];
  /** on "new cities" */
  newCities: number;
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * Reads the API's `listCounts`. Null when it is not counts at all, so the page says it failed
 * rather than showing a table that claims nobody waits; malformed city rows are left out.
 */
export function parseListCounts(value: unknown): ListCounts | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.cities) || !isCount(raw.newCities)) return null;
  const cities = list(raw.cities).flatMap(({ name, slug, waiting }) =>
    typeof name === "string" &&
    name !== "" &&
    typeof slug === "string" &&
    slug !== "" &&
    isCount(waiting)
      ? [{ name, slug, waiting }]
      : [],
  );
  return { cities, newCities: raw.newCities };
}

/** A round number at or above the largest value: where a chart's scale tops out. */
export function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}
