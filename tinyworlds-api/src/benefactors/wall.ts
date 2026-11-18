import { cityStanding, type Gift, type GiftPlace } from './standing.js';

type WallFoundation = Pick<GiftPlace, 'firstStone' | 'keystone'> & {
  number: number;
};

/** A city as the wall names it. */
export interface WallCity {
  slug: string;
  name: string;
  worldId: string | null;
  foundation?: WallFoundation;
}

/** A paid gift to a city that is shown, as the wall reads it. */
export interface WallGift extends Gift {
  city: Omit<WallCity, 'foundation'> & { goalCents: number };
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

/** Read badges from the same gift placements used on the city and donor pages. */
function foundationsByGift(gifts: WallGift[]): Map<string, WallFoundation> {
  const byCity = new Map<string, WallGift[]>();
  for (const gift of gifts) {
    const cityGifts = byCity.get(gift.city.slug);
    if (cityGifts) cityGifts.push(gift);
    else byCity.set(gift.city.slug, [gift]);
  }
  const foundations = new Map<string, WallFoundation>();
  for (const cityGifts of byCity.values()) {
    const { places } = cityStanding(cityGifts, cityGifts[0].city.goalCents);
    for (const [id, { number, firstStone, keystone }] of places) {
      if (number !== null)
        foundations.set(id, { number, firstStone, keystone });
    }
  }
  return foundations;
}

/**
 * Everyone who gave to a city, as one list: a named donor once, with their named gifts added
 * up over every city they are named in; every unnamed gift on its own, as "anonymous" with
 * what it gave and where (as on a city's own list, an unnamed gift never joins another). The
 * largest first, then the latest; at most WALL_MAX.
 */
export function benefactorWall(gifts: WallGift[]): WallRow[] {
  const foundations = foundationsByGift(gifts);
  const named = new Map<
    string,
    { row: WallRow; byCity: Map<string, { city: WallCity; cents: number }> }
  >();
  const rows: WallRow[] = [];
  for (const gift of gifts) {
    const { slug, name, worldId } = gift.city;
    const foundation = foundations.get(gift.id);
    const city: WallCity = {
      slug,
      name,
      worldId,
      ...(foundation && { foundation }),
    };
    if (gift.name === null || gift.donorId === null) {
      rows.push({
        donorId: null,
        name: null,
        amountCents: gift.amountCents,
        cities: [city],
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
    const there = entry.byCity.get(slug);
    if (!there) {
      entry.byCity.set(slug, { city, cents: gift.amountCents });
      continue;
    }
    there.cents += gift.amountCents;
    if (foundation) {
      const earlier = there.city.foundation;
      there.city.foundation = earlier
        ? {
            number: Math.min(earlier.number, foundation.number),
            firstStone: earlier.firstStone || foundation.firstStone,
            keystone: earlier.keystone || foundation.keystone,
          }
        : foundation;
    }
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
