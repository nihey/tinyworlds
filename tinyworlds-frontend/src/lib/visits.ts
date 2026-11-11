import type { Locale } from "@/i18n/locale";
import { API_URL } from "./donate";
import { currentVisit } from "./funnel";

/**
 * How many visits each world has had, and how many are there now: what the front page's cards
 * say, and the order they come in. A visit is the funnel's (`lib/funnel.ts`): one tab's stay,
 * counted once per world. While a map is open and in view it tells the API so every half
 * minute (`trackPresence`), and a visit heard from in the last 75 s is one exploring now.
 */

/** How often an open map says it is still there, and how often the front page asks again. */
export const PRESENCE_EVERY_MS = 30_000;
export const VISITS_EVERY_MS = 30_000;

/** Who is exploring a world is only said once there are more than this many. */
export const LIVE_SHOWN_ABOVE = 10;

/** A world's count: every visit it has had, and those exploring now. */
export interface WorldCount {
  visits: number;
  live: number;
}

/** The counts by world id; a world missing from it has none. */
export type WorldCounts = Map<string, WorldCount>;

const PRESENCE = `mutation TrackPresence($input: TrackPresenceInput!) { trackPresence(input: $input) }`;
const VISITS = `query WorldVisits($input: WorldVisitsInput!) { worldVisits(input: $input) { world visits live } }`;

/** The GraphQL request that says a visit's map is still open. */
export function presenceRequest(visit: string, world: string, locale: Locale) {
  return { query: PRESENCE, variables: { input: { visitId: visit, world, locale } } };
}

/** The GraphQL request that asks for the worlds' visits. */
export function visitsRequest(worlds: string[]) {
  return { query: VISITS, variables: { input: { worlds } } };
}

const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

/** The API's answer, by world; throws on anything else. */
export function parseWorldVisits(body: unknown): WorldCounts {
  const rows = (body as { data?: { worldVisits?: unknown } } | null)?.data?.worldVisits;
  if (!Array.isArray(rows)) throw new Error("No visits in the answer");
  const counts: WorldCounts = new Map();
  for (const row of rows as Record<string, unknown>[]) {
    const { world, visits, live } = row ?? {};
    if (typeof world !== "string" || !isCount(visits) || !isCount(live))
      throw new Error("A world's visits are not counts");
    counts.set(world, { visits, live });
  }
  return counts;
}

/**
 * The worlds, most visited first; a tie, or a world with no count, keeps the list's own order.
 * Until the counts are there the list is as it was given.
 */
export function byVisits<T extends { id: string }>(worlds: T[], counts: WorldCounts | null): T[] {
  if (!counts) return worlds;
  const visits = (world: T) => counts.get(world.id)?.visits ?? 0;
  // Array.prototype.sort is stable: equals keep their order
  return [...worlds].sort((a, b) => visits(b) - visits(a));
}

/**
 * Every world's visits together, and everyone exploring now: the front page's own figures.
 * Null until the counts are there.
 */
export function siteTotals(counts: WorldCounts | null): { visits: number; live: number } | null {
  if (!counts) return null;
  let visits = 0;
  let live = 0;
  for (const count of counts.values()) {
    visits += count.visits;
    live += count.live;
  }
  return { visits, live };
}

/** What a card says: "41,203 visits", and "23 exploring now" above the threshold; null for none. */
export function visitsLine(
  count: WorldCount | undefined,
  locale: Locale,
  words: { visits: { one: string; other: string }; exploringNow: string },
): { visits: string | null; live: string | null } {
  if (!count || !(count.visits > 0)) return { visits: null, live: null };
  const number = new Intl.NumberFormat(locale);
  const form =
    new Intl.PluralRules(locale).select(count.visits) === "one"
      ? words.visits.one
      : words.visits.other;
  return {
    visits: form.replace("{n}", number.format(count.visits)),
    live:
      count.live > LIVE_SHOWN_ABOVE
        ? words.exploringNow.replace("{n}", number.format(count.live))
        : null,
  };
}

/** A page that can be out of view (a tab behind another, a window minimised). */
export interface ShownPage {
  isHidden(): boolean;
  /** calls `fn` whenever the page goes out of view or comes back; answers how to stop */
  listen(fn: () => void): () => void;
}

/** The document, as a page that can be out of view. */
export function documentPage(): ShownPage {
  return {
    isHidden: () => document.visibilityState === "hidden",
    listen: (fn) => {
      document.addEventListener("visibilitychange", fn);
      return () => document.removeEventListener("visibilitychange", fn);
    },
  };
}

/**
 * Tells `fn` whether the page is out of view: at once (a tab may be opened behind another),
 * and whenever that changes. Answers how to stop.
 */
export function watchHidden(page: ShownPage, fn: (hidden: boolean) => void): () => void {
  fn(page.isHidden());
  return page.listen(() => fn(page.isHidden()));
}

/**
 * Calls `fn` every `every` ms while the page is in view, never while it is not, and once on
 * coming back if it has not been called for that long; `atOnce` calls it right away too (or as
 * soon as the page comes into view, for one opened out of view). Answers how to stop.
 */
export function everyWhileShown(
  fn: () => void,
  every: number,
  page: ShownPage,
  { atOnce = false }: { atOnce?: boolean } = {},
): () => void {
  let last = atOnce ? -Infinity : Date.now();
  const call = () => {
    last = Date.now();
    fn();
  };
  if (atOnce && !page.isHidden()) call();
  const timer = setInterval(() => {
    if (!page.isHidden()) call();
  }, every);
  const unlisten = page.listen(() => {
    if (!page.isHidden() && Date.now() - last >= every) call();
  });
  return () => {
    clearInterval(timer);
    unlisten();
  };
}

/**
 * Says this visit's map is still open. Never waits and never fails, like the funnel's steps,
 * and counts nobody the funnel does not count (an admin, a browser driven by a program).
 */
export function trackPresence(world: string, locale: Locale): void {
  const visit = currentVisit();
  if (!visit) return;
  try {
    void fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(presenceRequest(visit, world, locale)),
    }).catch(() => {});
  } catch {
    // no fetch, or an address it cannot use: nothing to say it to
  }
}

/** How long the front page waits for the counts before it gives up on this round. */
const VISITS_TIMEOUT_MS = 5_000;

/** The worlds' counts from the API (plain `fetch`: the front page's cards need no Apollo). */
export async function fetchWorldVisits(worlds: string[]): Promise<WorldCounts> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(visitsRequest(worlds)),
    signal: AbortSignal.timeout(VISITS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The API answered ${res.status}`);
  return parseWorldVisits(await res.json());
}
