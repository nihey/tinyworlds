import type { CityStatus } from "./donate";

/**
 * The lists a visitor can join to hear when a city is built: one per city still being funded,
 * and "new cities". Pure data here (the API's calls are in `lists-api.ts`, the shared state in
 * `hooks/use-lists.ts`).
 */

/** The list of every city built from now on, as the API names it. */
export const NEW_CITIES = "*";

export type ListKey = { kind: "new" } | { kind: "city"; slug: string; name: string };

/** What the API calls a list: "*" for new cities, else the city's slug. */
export function listParam(key: ListKey): string {
  return key.kind === "new" ? NEW_CITIES : key.slug;
}

export interface ListCity {
  slug: string;
  name: string;
  status: CityStatus;
  raisedCents: number;
  goalCents: number;
  waiting: number;
}

export interface MyLists {
  newCities: boolean;
  cities: ListCity[];
  /** slugs of the unbuilt cities the donor gave to: their donor mails cover them */
  donated: string[];
}

const STATUSES = ["PROPOSED", "FUNDED", "BUILDING", "BUILT"];

function parseListCity(value: unknown): ListCity | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.slug !== "string" || typeof c.name !== "string") return null;
  if (typeof c.status !== "string" || !STATUSES.includes(c.status)) return null;
  const { raisedCents, goalCents, waiting } = c;
  if (typeof raisedCents !== "number" || typeof goalCents !== "number") return null;
  return {
    slug: c.slug,
    name: c.name,
    status: c.status as CityStatus,
    raisedCents,
    goalCents,
    waiting: typeof waiting === "number" ? waiting : 0,
  };
}

/** The donor's lists as the API answered, or null when the answer is not the contract's. */
export function parseMyLists(raw: unknown): MyLists | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { newCities, cities, donated } = raw as Record<string, unknown>;
  if (typeof newCities !== "boolean" || !Array.isArray(cities) || !Array.isArray(donated))
    return null;
  if (!donated.every((slug) => typeof slug === "string")) return null;
  return {
    newCities,
    cities: cities.flatMap((c) => parseListCity(c) ?? []),
    donated: donated as string[],
  };
}

/**
 * What a city's button shows: "donor" (they gave, so the donor mail covers them: it wins),
 * "joined" (on the list), or "join" (also for anyone not signed in).
 */
export function cityListState(slug: string, lists: MyLists | null): "join" | "joined" | "donor" {
  if (!lists) return "join";
  if (lists.donated.includes(slug)) return "donor";
  return lists.cities.some((c) => c.slug === slug) ? "joined" : "join";
}

// ---------------------------------------------------------------------------------------------
// a join waiting for a sign-in link to be opened
// ---------------------------------------------------------------------------------------------

export const PENDING_JOIN_KEY = "tinyworlds.join";
const PENDING_MAX_AGE = 60 * 60 * 1000;

/** Remembers which list "Tell me" was pressed for, for when the sign-in link brings the visitor back. */
export function savePendingJoin(key: ListKey): void {
  try {
    window.localStorage.setItem(PENDING_JOIN_KEY, JSON.stringify({ at: Date.now(), key }));
  } catch {
    // storage blocked: the join still happens, on the link, server side
  }
}

/** The remembered list, once, if it is under an hour old; null otherwise (or without storage). */
export function takePendingJoin(now: number = Date.now()): ListKey | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PENDING_JOIN_KEY);
    if (raw !== null) window.localStorage.removeItem(PENDING_JOIN_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const { at, key } = JSON.parse(raw) as { at?: unknown; key?: Record<string, unknown> };
    if (typeof at !== "number" || now - at > PENDING_MAX_AGE || !key) return null;
    if (key.kind === "new") return { kind: "new" };
    if (key.kind === "city" && typeof key.slug === "string" && typeof key.name === "string")
      return { kind: "city", slug: key.slug, name: key.name };
  } catch {
    // garbage
  }
  return null;
}
