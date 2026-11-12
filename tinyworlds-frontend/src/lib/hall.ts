import {
  parseCityBenefactors,
  type CityBenefactors,
  type FounderRow,
  type BenefactorRow,
} from "./benefactors";
import { API_URL, parseMilestones, type CityMilestone } from "./donate";
import { apiOrigin } from "./links";
import { parseWall, type WallEntry } from "./wall";

/**
 * The hall of fame's data, without its pages: what is asked of the API (by the build, to bake
 * the benefactors and their links into the page, and by the page itself, to show what is true
 * now), and what its answer makes. Plain `fetch`: the pages download no Apollo for it.
 */

/** Everyone who gave, and every city: what the overall page shows. */
export interface HallData {
  wall: WallEntry[];
  cities: CityMilestone[];
}

const LINK = "url title description icon image";

export const HALL_QUERY = `query HallOfFame {
  benefactorWall { name amountCents cities { slug name worldId } links { ${LINK} } }
  cityMilestones { id slug name raisedCents goalCents donations status worldId }
}`;

export const CITY_HALL_QUERY = `query CityHall($input: CityBenefactorsInput!) {
  cityBenefactors(input: $input) {
    slug name status worldId goalCents raisedCents stones
    founders { number name amountCents stones firstStone keystone links { ${LINK} } }
    benefactors { rank name amountCents links { ${LINK} } }
  }
}`;

/** How long the API is waited for, by a page or by the build. */
export const HALL_TIMEOUT_MS = 8000;

/** The API's answer to `HALL_QUERY`; throws when there is no wall in it. */
export function parseHall(body: unknown, origin: string | null): HallData {
  const data = (body as { data?: { cityMilestones?: unknown } } | null)?.data;
  return { wall: parseWall(body, origin), cities: parseMilestones(data?.cityMilestones) };
}

/**
 * The API's answer to `CITY_HALL_QUERY`: the city, or null for one it does not know (or keeps
 * hidden). Throws on an answer that is not the contract's.
 */
export function parseCityHall(body: unknown, origin: string | null): CityBenefactors | null {
  const data = (body as { data?: { cityBenefactors?: unknown } } | null)?.data;
  if (!data || !("cityBenefactors" in data)) throw new Error("No city in the answer");
  if (data.cityBenefactors === null) return null;
  const city = parseCityBenefactors(data.cityBenefactors, origin);
  if (!city) throw new Error("The city is not what the contract says");
  return city;
}

/** Asks the API at `url`; rejects on any failure, or after `HALL_TIMEOUT_MS`. */
export async function askHall(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(HALL_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`The API answered ${res.status}`);
  return res.json();
}

/** The hall of fame as the API has it now, asked from the page. */
export async function fetchHall(): Promise<HallData> {
  return parseHall(await askHall(API_URL, HALL_QUERY), apiOrigin());
}

/** A city's hall as the API has it now, asked from the page; null for a city it does not know. */
export async function fetchCityHall(slug: string): Promise<CityBenefactors | null> {
  return parseCityHall(await askHall(API_URL, CITY_HALL_QUERY, { input: { slug } }), apiOrigin());
}

/** A city on the overall page: where it stands, and who is in its hall. */
export interface HallCity {
  slug: string;
  name: string;
  worldId: string | null;
  status: CityMilestone["status"] | null;
  raisedCents: number | null;
  goalCents: number | null;
  /** how many of the wall's entries gave to it: a named donor once, each unnamed gift once */
  people: number;
  /** the first few who are named there, the largest givers first */
  names: string[];
}

/** How many names a city's tile shows. */
export const TILE_NAMES = 3;

/**
 * The cities that have a hall to show: those someone on the wall gave to, with where each
 * stands when the list of cities says. The most raised first, then the most people, then by name.
 */
export function hallCities(data: HallData): HallCity[] {
  const bySlug = new Map<string, HallCity>();
  const listed = new Map(data.cities.map((city) => [city.slug, city]));
  for (const entry of data.wall) {
    for (const where of entry.cities) {
      let city = bySlug.get(where.slug);
      if (!city) {
        const known = listed.get(where.slug);
        city = {
          slug: where.slug,
          name: where.name,
          worldId: where.worldId,
          status: known?.status ?? null,
          raisedCents: known?.raisedCents ?? null,
          goalCents: known?.goalCents ?? null,
          people: 0,
          names: [],
        };
        bySlug.set(where.slug, city);
      }
      city.people += 1;
      if (entry.name !== null && city.names.length < TILE_NAMES) city.names.push(entry.name);
    }
  }
  return [...bySlug.values()].sort(
    (a, b) =>
      (b.raisedCents ?? 0) - (a.raisedCents ?? 0) ||
      b.people - a.people ||
      a.name.localeCompare(b.name),
  );
}

/** The city a hall of fame's address asks for with `?city=`, or null. */
export function cityAsked(search: string): string | null {
  const slug = new URLSearchParams(search).get("city")?.trim();
  return slug ? slug : null;
}

/** Whether a city's hall has anyone in it. */
export function hasPeople(city: Pick<CityBenefactors, "founders" | "benefactors">): boolean {
  return city.founders.length + city.benefactors.length > 0;
}

/** A row of either list, for what both kinds of card share. */
export type HallRow = FounderRow | BenefactorRow;
