import {
  benefactorWall,
  WALL_MAX,
  type WallCity,
  type WallGift,
} from './wall.js';

const LISBON: WallCity = { slug: 'lisbon', name: 'Lisbon', worldId: null };
const NYC: WallCity = {
  slug: 'new-york',
  name: 'New York',
  worldId: 'tinynyc',
};

let minute = 0;
const gift = (
  donorId: string | null,
  amountCents: number,
  name: string | null,
  city = LISBON,
): WallGift => ({
  donorId,
  amountCents,
  name,
  city,
  at: new Date(Date.UTC(2026, 0, 1, 0, minute++)),
});

describe('benefactorWall', () => {
  it('is empty without gifts', () => {
    expect(benefactorWall([])).toEqual([]);
  });

  it("adds a named donor's gifts up over every city they are named in", () => {
    const first = gift('ana', 500, 'Ana', LISBON);
    const second = gift('ana', 2000, 'Ana', NYC);
    const third = gift('ana', 700, 'Ana', LISBON);
    expect(benefactorWall([first, second, third])).toEqual([
      {
        donorId: 'ana',
        name: 'Ana',
        amountCents: 3200,
        // the city they gave most to first
        cities: [NYC, LISBON],
        lastGiftAt: third.at,
      },
    ]);
  });

  it('keeps every unnamed gift on its own, with what it gave and where', () => {
    const rows = benefactorWall([
      gift('bo', 300, null, LISBON),
      gift('bo', 300, null, NYC),
      gift(null, 900, null, LISBON),
    ]);
    expect(rows.map((r) => [r.name, r.amountCents, r.cities])).toEqual([
      [null, 900, [LISBON]],
      [null, 300, [NYC]],
      [null, 300, [LISBON]],
    ]);
    expect(rows.every((r) => r.donorId === null)).toBe(true);
  });

  it('shows a donor named in one city and not in another as both', () => {
    const rows = benefactorWall([
      gift('ana', 1000, 'Ana', LISBON),
      gift('ana', 4000, null, NYC),
    ]);
    expect(rows.map((r) => [r.name, r.amountCents])).toEqual([
      [null, 4000],
      ['Ana', 1000],
    ]);
    // the unnamed one says nothing of whose it is
    expect(rows[0].donorId).toBeNull();
  });

  it('never names a gift that came without a donor', () => {
    expect(benefactorWall([gift(null, 100, 'Ghost')])[0]).toMatchObject({
      name: null,
      donorId: null,
    });
  });

  it('puts the largest first, then the latest', () => {
    const rows = benefactorWall([
      gift('a', 500, 'Early'),
      gift('b', 2000, 'Large'),
      gift('c', 500, 'Late'),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Large', 'Late', 'Early']);
  });

  it('answers the same whatever order the gifts come in', () => {
    const gifts = [
      gift('a', 500, 'Ana'),
      gift(null, 500, null, NYC),
      gift('b', 700, 'Bo', NYC),
      gift('a', 200, 'Ana', NYC),
    ];
    expect(benefactorWall([...gifts].reverse())).toEqual(benefactorWall(gifts));
  });

  it('answers no more than WALL_MAX', () => {
    const many = Array.from({ length: WALL_MAX + 50 }, (_, i) =>
      gift(null, 100 + i, null),
    );
    const rows = benefactorWall(many);
    expect(rows).toHaveLength(WALL_MAX);
    expect(rows[0].amountCents).toBe(100 + WALL_MAX + 49);
  });
});
