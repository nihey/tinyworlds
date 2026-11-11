import type { Gift } from '../benefactors/standing.js';
import { placeOfGift } from './thanks-facts.js';

const at = (minute: number) => new Date(Date.UTC(2026, 10, 11, 12, minute));
const gift = (
  id: string,
  donorId: string | null,
  amountCents: number,
  minute: number,
  name: string | null = null,
): Gift => ({ id, donorId, amountCents, at: at(minute), name });

describe('placeOfGift', () => {
  it('tells a founding gift as things stood once it was in', () => {
    const gifts = [
      gift('g1', 'bo', 200, 1),
      gift('g2', 'ana', 1000, 2, 'Ana'),
      // given later: not counted yet in the thank-you for g2
      gift('g3', 'cy', 500, 3),
    ];
    const place = placeOfGift(gifts, 3000, 'g2', 'ana');
    expect(place).toMatchObject({
      stoneCount: 30,
      goalCents: 3000,
      raisedCents: 1200,
      founding: true,
      laid: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      founderNumber: 2,
      firstStone: false,
      keystone: false,
      listedAs: 'Ana',
      onFounders: true,
    });
    expect(place?.stones).toEqual([
      'laid',
      'laid',
      ...Array<string>(10).fill('mine'),
      ...Array<null>(18).fill(null),
    ]);
  });

  it('lights all of the donor’s stones, and gives them their first founding number', () => {
    const gifts = [
      gift('g1', 'ana', 100, 1),
      gift('g2', 'bo', 100, 2),
      gift('g3', 'ana', 200, 3),
    ];
    const place = placeOfGift(gifts, 1000, 'g3', 'ana');
    expect(place?.stones.slice(0, 5)).toEqual([
      'mine',
      'laid',
      'mine',
      'mine',
      null,
    ]);
    expect(place).toMatchObject({
      founderNumber: 1,
      firstStone: true,
      laid: [3, 4],
      listedAs: null,
    });
  });

  it('knows the gift that lays the last stone, and the gifts after the goal', () => {
    const gifts = [
      gift('g1', 'ana', 700, 1, 'Ana'),
      gift('g2', 'bo', 500, 2),
      gift('g3', 'ana', 400, 3, 'Ana'),
      gift('g4', 'cy', 300, 4, 'Cy'),
    ];
    expect(placeOfGift(gifts, 1000, 'g2', 'bo')).toMatchObject({
      founding: true,
      laid: [8, 9, 10],
      keystone: true,
      raisedCents: 1200,
    });
    // a named founder giving again is still listed among the founders
    expect(placeOfGift(gifts, 1000, 'g3', 'ana')).toMatchObject({
      founding: false,
      laid: [],
      founderNumber: 1,
      listedAs: 'Ana',
      onFounders: true,
    });
    expect(placeOfGift(gifts, 1000, 'g4', 'cy')).toMatchObject({
      founding: false,
      founderNumber: null,
      listedAs: 'Cy',
      onFounders: false,
    });
  });

  it('has nothing to say of a gift that is not among the dollars', () => {
    expect(placeOfGift([gift('g1', 'ana', 500, 1)], 1000, 'eur', 'ana')).toBe(
      null,
    );
  });
});
