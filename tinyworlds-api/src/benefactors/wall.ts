/** A city as the wall names it. */
export interface WallCity {
  slug: string;
  name: string;
  worldId: string | null;
}

/** A paid gift to a city that is shown, as the wall reads it. */
export interface WallGift {
  donorId: string | null;
  amountCents: number;
  at: Date;
  /** The public name when this gift is listed and its donor's name is set and not hidden; else null. */
  name: string | null;
  city: WallCity;
}

/** One entry of the wall: a named donor with everything they are named for, or one unnamed gift. */
export interface WallRow {
  /** Whose links go with the name; null on an unnamed gift, which shows none. */
  donorId: string | null;
  name: string | null;
  amountCents: number;
  /** Where they gave, the city they gave most to first. */
  cities: WallCity[];
  lastGiftAt: Date;
}

/** The most entries the wall answers. */
export const WALL_MAX = 200;

/**
 * Everyone who gave to a city, as one list: a named donor once, with their named gifts added
 * up over every city they are named in; every unnamed gift on its own, as "anonymous" with
 * what it gave and where (as on a city's own list, an unnamed gift never joins another). The
 * largest first, then the latest; at most WALL_MAX.
 */
export function benefactorWall(gifts: WallGift[]): WallRow[] {
  const named = new Map<
    string,
    { row: WallRow; byCity: Map<string, { city: WallCity; cents: number }> }
  >();
  const rows: WallRow[] = [];
  for (const gift of gifts) {
    if (gift.name === null || gift.donorId === null) {
      rows.push({
        donorId: null,
        name: null,
        amountCents: gift.amountCents,
        cities: [gift.city],
        lastGiftAt: gift.at,
      });
      continue;
    }
    let entry = named.get(gift.donorId);
    if (!entry) {
      entry = {
        row: {
          donorId: gift.donorId,
          name: gift.name,
          amountCents: 0,
          cities: [],
          lastGiftAt: gift.at,
        },
        byCity: new Map(),
      };
      named.set(gift.donorId, entry);
      rows.push(entry.row);
    }
    entry.row.amountCents += gift.amountCents;
    if (gift.at > entry.row.lastGiftAt) entry.row.lastGiftAt = gift.at;
    const there = entry.byCity.get(gift.city.slug);
    if (there) there.cents += gift.amountCents;
    else
      entry.byCity.set(gift.city.slug, {
        city: gift.city,
        cents: gift.amountCents,
      });
  }
  for (const { row, byCity } of named.values())
    row.cities = [...byCity.values()]
      .sort((a, b) => b.cents - a.cents || (a.city.slug < b.city.slug ? -1 : 1))
      .map((c) => c.city);
  return rows
    .sort(
      (a, b) =>
        b.amountCents - a.amountCents ||
        b.lastGiftAt.getTime() - a.lastGiftAt.getTime() ||
        (a.name ?? '').localeCompare(b.name ?? '') ||
        (a.cities[0].slug < b.cities[0].slug ? -1 : 1),
    )
    .slice(0, WALL_MAX);
}
