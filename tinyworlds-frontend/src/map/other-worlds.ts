import { WORLDS, type World } from "@/worlds";
import { normalize, type MatchTier } from "./search";

/** Another map of the site that a search names: "Winterfell" on the map of Westeros. */
export interface WorldHit {
  world: World;
  /** how well its name matches, as a place's would (see `MatchTier`) */
  tier: MatchTier;
}

/** At most this many other maps in one list. */
const MAX_WORLDS = 2;

/**
 * The site's other maps whose name a query gives, best first: the place's name in any of the
 * interface's languages ("Invernalia", "Porto Real"), typed whole, from its start, or word by
 * word; spaces and apostrophes may be left out ("kingslanding"). A query shorter than three
 * letters names no map. `here` (this map) is never one of them.
 */
export function findWorlds(
  query: string,
  here: string,
  worlds: World[] = Object.values(WORLDS),
): WorldHit[] {
  const typed = normalize(query);
  const compact = typed.replaceAll(" ", "");
  if (compact.length < 3) return [];
  const typedWords = typed.split(" ");
  const hits: WorldHit[] = [];
  for (const world of worlds) {
    if (world.id === here) continue;
    let best = 0;
    for (const copy of Object.values(world.copy)) {
      const name = normalize(copy.city);
      const whole = name.replaceAll(" ", "");
      const words = name.split(" ");
      const tier =
        name === typed || whole === compact
          ? 6
          : name.startsWith(typed) || whole.startsWith(compact)
            ? 5
            : typedWords.every((word) => words.some((w) => w.startsWith(word)))
              ? 4
              : 0;
      best = Math.max(best, tier);
    }
    if (best > 0) hits.push({ world, tier: best as MatchTier });
  }
  return hits.sort((a, b) => b.tier - a.tier).slice(0, MAX_WORLDS);
}
