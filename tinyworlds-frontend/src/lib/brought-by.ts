import type { CityMilestone } from "./donate";

/**
 * Which cities are on the map because people paid for them, and who those people were: the
 * cities its benefactors brought, which the front page's cards and the hall of fame praise.
 */

/** Who brought a city to the map: how many people gave to it, and how much, in US cents. */
export interface BroughtBy {
  people: number;
  cents: number;
}

/**
 * Who brought this city to the map, or null when nobody did: a city counts once it is built
 * (on the map, with its world) and its gifts met its goal. One built by hand before anyone gave
 * is not theirs, however much it is given later short of its goal. How many people gave is
 * what the API counts (a donor once); an older API does not say, and the gifts are counted.
 */
export function broughtBy(
  city: Pick<
    CityMilestone,
    "status" | "worldId" | "raisedCents" | "goalCents" | "donations" | "benefactorCount"
  >,
): BroughtBy | null {
  if (city.status !== "BUILT" || !city.worldId) return null;
  if (!(city.raisedCents > 0) || city.raisedCents < city.goalCents) return null;
  return { people: city.benefactorCount ?? city.donations, cents: city.raisedCents };
}

/** A city its benefactors brought, by the world it is at. */
export interface BroughtWorld extends BroughtBy {
  slug: string;
  name: string;
}

/** For each world on the map that its benefactors brought: its city, and who brought it. */
export function broughtByWorld(cities: CityMilestone[]): Map<string, BroughtWorld> {
  const worlds = new Map<string, BroughtWorld>();
  for (const city of cities) {
    const by = broughtBy(city);
    if (by && city.worldId) worlds.set(city.worldId, { slug: city.slug, name: city.name, ...by });
  }
  return worlds;
}
