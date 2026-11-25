import { type CityMilestone } from "./donate";
import { ask, originOf } from "./hall-build";
import { heroOrder } from "./home";
import { MILESTONES_QUERY, parseMilestonesAnswer } from "./milestones";
import { bakedCounts, bakedVisits, parseWorldVisits, visitsRequest } from "./visits";
import { parseWall, wallRequest, type WallEntry } from "./wall";
import previews from "./hero-previews.json";
import { worldHero } from "@/site";
import { WORLDS } from "@/worlds";

/**
 * The front page as the build bakes it, as the hall of fame is baked (`hall-build.ts`): what the
 * API says when the page is built goes into its HTML, so the page opens whole. The worlds come
 * in their final order (the hero's first city, the catalogue's cards: nothing changes places
 * when the counts arrive), the figures and the cities being funded are there from the first
 * paint, and the benefactors' names and links are in the HTML for anything that reads it
 * without running it. Once open, the page asks again and shows what is true now. Never
 * imported by a component that runs in a browser.
 *
 * The build never fails for it: no API, or one that does not answer, leaves that part unbaked,
 * and the page fills it in once it is open, as it always did.
 */
export interface HomeAtBuild {
  /** every world's visits ([world, visits]); never who was exploring then */
  visits: [string, number][] | null;
  /** the cities being funded */
  cities: CityMilestone[] | null;
  /** everyone who gave to a city */
  wall: WallEntry[] | null;
  /**
   * The hero's first picture in a few hundred bytes (a data: URL), shown blurred under it
   * while it loads, so the hero never opens on an empty frame. `npm run stills` makes them.
   */
  preview: string | null;
}

const PREVIEWS: Record<string, string> = previews;

/** Whatever `ask` answers, parsed; null when there is nothing to ask or the answer is no good. */
async function baked<T>(question: Promise<unknown> | null, parse: (body: unknown) => T) {
  if (!question) return null;
  try {
    return parse(await question);
  } catch {
    return null;
  }
}

/** The first picture's preview, by its still's name ("hero", "hero-tinyrao"). */
export function heroPreview(world: string, previews: Record<string, string> = PREVIEWS) {
  const name = worldHero(world, "")
    .still.replace(/^\//, "")
    .replace(/\.jpg$/, "");
  return previews[name] ?? null;
}

export async function homeAtBuild(): Promise<HomeAtBuild> {
  const ids = Object.keys(WORLDS);
  const [counts, cities, wall] = await Promise.all([
    baked(ask(visitsRequest(ids).query, visitsRequest(ids).variables), parseWorldVisits),
    baked(ask(MILESTONES_QUERY), parseMilestonesAnswer),
    baked(ask(wallRequest().query), (body) => parseWall(body, originOf())),
  ]);
  const visits = counts ? bakedVisits(counts) : null;
  const [first] = heroOrder(visits ? bakedCounts(visits) : null);
  return { visits, cities, wall, preview: first ? heroPreview(first) : null };
}
