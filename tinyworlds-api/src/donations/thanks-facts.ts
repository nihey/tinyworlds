import { byTime, cityStanding, type Gift } from '../benefactors/standing.js';
import type { StoneState } from '../mail/layout.js';

/** Where a gift in dollars stands in its city, as its thank-you tells it. */
export interface GiftPlace {
  stoneCount: number;
  goalCents: number;
  /** What the city had raised once this gift was in. */
  raisedCents: number;
  /** Every stone as it stood once this gift was in: the donor's, someone else's, or none yet. */
  stones: StoneState[];
  /** A founding gift: it started before the goal was reached. */
  founding: boolean;
  /** The stones this gift laid, in order. */
  laid: number[];
  /** The donor's founding number in the city (the smallest of their gifts'), if they have one. */
  founderNumber: number | null;
  /** The donor holds the city's first stone, or its last. */
  firstStone: boolean;
  keystone: boolean;
  /** The name the city's list shows for this gift, or null when it shows "anonymous". */
  listedAs: string | null;
  /** Where the donor is listed: the Founding Benefactors, or the Benefactors. */
  onFounders: boolean;
}

/**
 * A gift's place among its city's gifts, from the same `cityStanding` as the public list, as
 * things stood once it was in: later gifts are not counted yet. Null when the gift is not
 * among them (it is not in dollars).
 */
export function placeOfGift(
  gifts: Gift[],
  goalCents: number,
  giftId: string,
  donorId: string,
): GiftPlace | null {
  const { stoneCount, places } = cityStanding(gifts, goalCents);
  const place = places.get(giftId);
  if (!place) return null;
  const ordered = [...gifts].sort(byTime);
  const upTo = ordered.slice(0, ordered.findIndex((g) => g.id === giftId) + 1);
  const theirs = gifts.filter((g) => g.donorId === donorId);

  const mine = new Set(theirs.flatMap((g) => places.get(g.id)?.stones ?? []));
  const laidSoFar = new Set(
    upTo.flatMap((g) => places.get(g.id)?.stones ?? []),
  );
  const numbers = theirs.flatMap((g) => {
    const number = places.get(g.id)?.number;
    return number == null ? [] : [number];
  });
  const gift = upTo[upTo.length - 1];
  return {
    stoneCount,
    goalCents,
    raisedCents: upTo.reduce((sum, g) => sum + g.amountCents, 0),
    stones: Array.from({ length: stoneCount }, (_, i) =>
      !laidSoFar.has(i + 1) ? null : mine.has(i + 1) ? 'mine' : 'laid',
    ),
    founding: place.number !== null,
    laid: place.stones,
    founderNumber: numbers.length ? Math.min(...numbers) : null,
    firstStone: theirs.some((g) => places.get(g.id)?.firstStone),
    keystone: theirs.some((g) => places.get(g.id)?.keystone),
    listedAs: gift.name,
    // a named founder is listed once, among the founders, whatever came after
    onFounders:
      place.number !== null ||
      theirs.some((g) => g.name !== null && places.get(g.id)?.number != null),
  };
}
