import { WORLDS, type World } from "@/worlds";
import { CITY_CATALOGUE, type CatalogueCity } from "./city-catalogue";
import { findMilestone, fold } from "./city-picker";
import type { CityMilestone } from "./donate";

/**
 * What an address that leads nowhere was probably after. A world's address is `/tiny<code>/`,
 * easy to guess for a city that is not built yet (`/tinyparis/`): someone who typed their own
 * city there wants it, and the page that answers says how to get it.
 */
export type AddressGuess =
  /** one of the site's maps: a page under it that does not exist, or its name spelt out (`/tinynewyork/`) */
  | { kind: "world"; world: World }
  /** a city that is not on the map: the one people are funding, if they are */
  | { kind: "city"; name: string; milestone: CityMilestone | null };

/** A name as an address would hold it: folded, without spaces ("São Paulo" → "saopaulo"). */
const squeeze = (text: string): string => fold(text).replaceAll(" ", "");

/**
 * The guess for an address's first folder: a world by its id or by any of its names, a city
 * people are funding by its name or slug, or a city of the catalogue by any of its spellings,
 * with or without "tiny" in front. Null when it names none of them.
 */
export function guessAddress(
  pathname: string,
  milestones: CityMilestone[],
  worlds: World[] = Object.values(WORLDS),
  catalogue: CatalogueCity[] = CITY_CATALOGUE,
): AddressGuess | null {
  let first = pathname.split("/").find((part) => part !== "") ?? "";
  try {
    first = decodeURIComponent(first);
  } catch {
    // a broken escape is read as it is
  }
  const whole = squeeze(first);
  if (whole === "") return null;
  const key = whole.startsWith("tiny") && whole.length > 4 ? whole.slice(4) : whole;
  const named = (names: string[]) => names.some((name) => squeeze(name) === key);

  const world = worlds.find(
    (w) => w.id === first.toLowerCase() || named(Object.values(w.copy).map((copy) => copy.city)),
  );
  if (world) return { kind: "world", world };

  const funded = milestones.find((city) => named([city.name, city.slug]));
  if (funded) {
    const built = funded.worldId ? worlds.find((w) => w.id === funded.worldId) : undefined;
    return built
      ? { kind: "world", world: built }
      : { kind: "city", name: funded.name, milestone: funded };
  }

  const known = catalogue.find((city) => named([city.name, ...(city.alt ?? [])]));
  if (known)
    return { kind: "city", name: known.name, milestone: findMilestone(milestones, known.name) };
  return null;
}
