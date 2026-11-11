import { API_URL } from "./donate";
import { apiOrigin, parseLinks, type BenefactorLink } from "./links";

/**
 * The wall: everyone who gave to a city, for the front page's sides. A named donor is there
 * once, with everything they are named for and their links; an unnamed gift is there as it
 * was given. Asked with a plain `fetch`, like the visits: the front page does not download
 * Apollo to show it.
 */

/** A city someone on the wall gave to. */
export interface WallCity {
  slug: string;
  name: string;
  worldId: string | null;
}

export interface WallEntry {
  /** null: an unnamed gift, shown as anonymous */
  name: string | null;
  amountCents: number;
  /** where they gave, the city they gave most to first */
  cities: WallCity[];
  links: BenefactorLink[];
}

/** How long the wall is waited for. */
export const WALL_TIMEOUT_MS = 5000;

const WALL = `query BenefactorWall { benefactorWall { name amountCents
  cities { slug name worldId } links { url title description icon image } } }`;

/** The GraphQL request that asks for the wall. */
export function wallRequest() {
  return { query: WALL };
}

/** The API's answer as the wall's entries, in its order; throws when there is no list in it. */
export function parseWall(body: unknown, origin: string | null): WallEntry[] {
  const rows = (body as { data?: { benefactorWall?: unknown } } | null)?.data?.benefactorWall;
  if (!Array.isArray(rows)) throw new Error("No wall in the answer");
  return rows.flatMap((row: unknown): WallEntry[] => {
    if (typeof row !== "object" || row === null) return [];
    const { name, amountCents, cities, links } = row as Record<string, unknown>;
    if (name !== null && (typeof name !== "string" || name.trim() === "")) return [];
    if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0)
      return [];
    const where = (Array.isArray(cities) ? cities : []).flatMap((city: unknown): WallCity[] => {
      if (typeof city !== "object" || city === null) return [];
      const { slug, name: cityName, worldId } = city as Record<string, unknown>;
      if (typeof slug !== "string" || !slug || typeof cityName !== "string" || !cityName) return [];
      return [{ slug, name: cityName, worldId: typeof worldId === "string" ? worldId : null }];
    });
    if (where.length === 0) return [];
    return [
      {
        name,
        amountCents,
        cities: where,
        // links go with a name: an unnamed gift shows none, whatever the answer says
        links: name === null ? [] : parseLinks(links, origin),
      },
    ];
  });
}

/** The wall as the API has it now. Rejects on any failure, or after five seconds. */
export async function fetchWall(): Promise<WallEntry[]> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(wallRequest()),
    signal: AbortSignal.timeout(WALL_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The API answered ${res.status}`);
  return parseWall(await res.json(), apiOrigin());
}

/**
 * The wall dealt out to the page's two sides, in turn: the largest gift on the left, the next
 * on the right, so both sides have their share of the top and are about as long.
 */
export function wallSides<T>(entries: T[]): [T[], T[]] {
  const left: T[] = [];
  const right: T[] = [];
  entries.forEach((entry, i) => (i % 2 === 0 ? left : right).push(entry));
  return [left, right];
}

/**
 * The cities under a name, in few words: the first `shown` by name, and how many more there
 * are. "São Paulo, Lisbon" and 2 more.
 */
export function citiesShown(cities: WallCity[], shown = 2): { named: WallCity[]; more: number } {
  return { named: cities.slice(0, shown), more: Math.max(cities.length - shown, 0) };
}
