/** What one stone costs: US$1. */
export const STONE_CENTS = 100;

/** A paid gift to one city, as the standing reads it. */
export interface Gift {
  id: string;
  donorId: string | null;
  amountCents: number;
  at: Date;
  /** The public name when this gift is listed and its donor's name is set and not hidden; else null. */
  name: string | null;
}

/** Where one gift stands: its founding number and the stones it laid. */
export interface GiftPlace {
  /** The founding number of this gift; null when it lays no stone. */
  number: number | null;
  /** The 1-based stones this gift laid. */
  stones: number[];
  firstStone: boolean;
  keystone: boolean;
}

export interface FounderRow {
  number: number;
  name: string | null;
  amountCents: number;
  stones: number;
  firstStone: boolean;
  keystone: boolean;
}

export interface BenefactorRow {
  rank: number;
  name: string | null;
  amountCents: number;
}

export interface Standing {
  stoneCount: number;
  /** For each stone, the number of the founder row that laid it, or null. */
  stones: (number | null)[];
  /** By number. */
  founders: FounderRow[];
  /** By rank. */
  benefactors: BenefactorRow[];
  /** By gift id. */
  places: Map<string, GiftPlace>;
}

interface Placed {
  gift: Gift;
  start: number;
  end: number;
  number: number | null;
  stones: number[];
}

/** The order gifts are laid in: when they were given, then by id. */
export const byTime = (a: Gift, b: Gift): number =>
  a.at.getTime() - b.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Works out a city's stones, founders and benefactors from its gifts. Gifts are
 * laid end to end in the order they were given; the stone at dollar i is laid by
 * the gift that pays its last cent. Gifts that start before the goal are
 * founders (the one crossing the line keeps its whole amount); later ones are
 * benefactors. A named person's founding gifts share one row, and a named
 * founder is not listed again among the benefactors.
 */
export function cityStanding(gifts: Gift[], goalCents: number): Standing {
  const stoneCount = Math.ceil(goalCents / STONE_CENTS);
  const lastCent = (i: number) => Math.min(i * STONE_CENTS, goalCents) - 1;

  const placed: Placed[] = [];
  let cum = 0;
  let founding = 0;
  for (const gift of [...gifts].sort(byTime)) {
    const start = cum;
    const end = cum + gift.amountCents;
    cum = end;
    const stones: number[] = [];
    for (let i = 1; i <= stoneCount; i++) {
      const c = lastCent(i);
      if (c >= start && c < Math.min(end, goalCents)) stones.push(i);
    }
    placed.push({
      gift,
      start,
      end,
      number: start < goalCents ? ++founding : null,
      stones,
    });
  }

  const stones: (number | null)[] = Array<number | null>(stoneCount).fill(null);
  const rows = new Map<number, FounderRow>();
  const rowOfDonor = new Map<string, number>();
  const places = new Map<string, GiftPlace>();

  for (const p of placed) {
    const { gift } = p;
    if (p.number !== null) {
      const named = gift.name !== null && gift.donorId !== null;
      const joined = named ? rowOfDonor.get(gift.donorId as string) : undefined;
      const rowNumber = joined ?? p.number;
      if (named && joined === undefined) {
        rowOfDonor.set(gift.donorId as string, rowNumber);
      }
      let row = rows.get(rowNumber);
      if (!row) {
        row = {
          number: rowNumber,
          name: gift.name,
          amountCents: 0,
          stones: 0,
          firstStone: false,
          keystone: false,
        };
        rows.set(rowNumber, row);
      }
      row.amountCents += gift.amountCents;
      row.stones += p.stones.length;
      if (p.stones.includes(1)) row.firstStone = true;
      if (p.stones.includes(stoneCount)) row.keystone = true;
      for (const i of p.stones) stones[i - 1] = rowNumber;
    }
    places.set(gift.id, {
      number: p.number,
      stones: p.stones,
      firstStone: p.stones.includes(1),
      keystone: p.stones.includes(stoneCount),
    });
  }

  const founders = [...rows.values()].sort((a, b) => a.number - b.number);

  const groups = new Map<
    string,
    { name: string | null; amountCents: number; first: Gift }
  >();
  for (const p of placed) {
    if (p.start < goalCents) continue;
    const { gift } = p;
    const named = gift.name !== null && gift.donorId !== null;
    if (named && rowOfDonor.has(gift.donorId as string)) continue;
    const key = named ? `donor:${gift.donorId}` : `gift:${gift.id}`;
    const group = groups.get(key);
    if (group) group.amountCents += gift.amountCents;
    else
      groups.set(key, {
        name: named ? gift.name : null,
        amountCents: gift.amountCents,
        first: gift,
      });
  }
  const benefactors = [...groups.values()]
    .sort((a, b) => b.amountCents - a.amountCents || byTime(a.first, b.first))
    .map((g, i) => ({
      rank: i + 1,
      name: g.name,
      amountCents: g.amountCents,
    }));

  return { stoneCount, stones, founders, benefactors, places };
}
