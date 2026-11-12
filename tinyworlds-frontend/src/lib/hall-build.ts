import type { CityBenefactors } from "./benefactors";
import {
  CITY_HALL_QUERY,
  HALL_QUERY,
  askHall,
  parseCityHall,
  parseHall,
  type HallData,
} from "./hall";

/**
 * The hall of fame as the build bakes it into its pages: who gave and the links they show are
 * then in the HTML itself, for anything that reads a page without running it (a link checker,
 * a search engine that does not wait for scripts). The page asks again once it is open, so what
 * a visitor sees is what is true now. Never imported by a component that runs in a browser.
 *
 * The build must never fail for it: no API to ask, or one that does not answer, is a page with
 * nothing baked in, which fills itself in once it is open.
 */

/** The slug of a city whose page is built by its name: plain letters, digits and "-". */
const PLAIN_SLUG = /^[a-z0-9-]+$/;

/**
 * Where the build asks: `NEXT_PUBLIC_API_URL` when it is a whole address, or, when it is a
 * path, that path on `NEXT_PUBLIC_SITE_URL`. Null when the build names no API, or names it by
 * a path with no site to hang it on.
 */
export function buildEndpoint(
  api = process.env.NEXT_PUBLIC_API_URL,
  site = process.env.NEXT_PUBLIC_SITE_URL,
): string | null {
  const url = (api ?? "").trim();
  if (!url) return null;
  try {
    return /^https?:\/\//.test(url) ? new URL(url).href : new URL(url, (site ?? "").trim()).href;
  } catch {
    return null;
  }
}

// one answer per build for each question, however many pages ask it
const asked = new Map<string, Promise<unknown>>();

function ask(query: string, variables?: Record<string, unknown>): Promise<unknown> | null {
  const endpoint = buildEndpoint();
  if (!endpoint) return null;
  const key = `${query}${JSON.stringify(variables ?? {})}`;
  let answer = asked.get(key);
  if (!answer) {
    // asked afresh by every build (nothing is kept from the last one: a page baked from an old
    // answer would show yesterday's links), and once within it
    answer = askHall(endpoint, query, variables);
    asked.set(key, answer);
  }
  return answer;
}

const originOf = (): string | null => {
  const endpoint = buildEndpoint();
  return endpoint ? new URL(endpoint).origin : null;
};

/** Everyone who gave and every city, as the API has them when the page is built; null without. */
export async function hallAtBuild(): Promise<HallData | null> {
  try {
    const answer = await ask(HALL_QUERY);
    return answer === null ? null : parseHall(answer, originOf());
  } catch {
    return null;
  }
}

/** A city's hall when its page is built; null without an answer, or for a city unknown then. */
export async function cityAtBuild(slug: string): Promise<CityBenefactors | null> {
  try {
    const answer = await ask(CITY_HALL_QUERY, { input: { slug } });
    return answer === null ? null : parseCityHall(answer, originOf());
  } catch {
    return null;
  }
}

/**
 * The cities a page is built for: every one the API lists whose slug is plain. Empty without an
 * answer.
 */
export async function slugsAtBuild(): Promise<string[]> {
  const hall = await hallAtBuild();
  return (hall?.cities ?? []).map((city) => city.slug).filter((slug) => PLAIN_SLUG.test(slug));
}
