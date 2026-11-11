import { cityStanding, type Gift } from './standing.js';

const GOAL = 10_000;

const gift = (
  id: string,
  amountCents: number,
  minute: number,
  name: string | null = null,
  donorId: string | null = null,
): Gift => ({
  id,
  donorId,
  amountCents,
  at: new Date(Date.UTC(2026, 10, 1, 0, minute)),
  name,
});

describe('cityStanding', () => {
  it('has a hundred empty stones and no one listed in an empty city', () => {
    const s = cityStanding([], GOAL);
    expect(s.stoneCount).toBe(100);
    expect(s.stones).toHaveLength(100);
    expect(s.stones.every((x) => x === null)).toBe(true);
    expect(s.founders).toEqual([]);
    expect(s.benefactors).toEqual([]);
  });

  it('lets one named gift lay its stones', () => {
    const s = cityStanding([gift('a', 1200, 1, 'Marta', 'd1')], GOAL);
    expect(s.founders).toEqual([
      {
        number: 1,
        name: 'Marta',
        amountCents: 1200,
        stones: 12,
        firstStone: true,
        keystone: false,
      },
    ]);
    expect(s.stones.slice(0, 12).every((x) => x === 1)).toBe(true);
    expect(s.stones[12]).toBeNull();
  });

  it('makes the gift that crosses the line a founder with its whole amount', () => {
    const s = cityStanding(
      [gift('a', 8000, 1), gift('b', 5000, 2, 'Bia', 'd2')],
      GOAL,
    );
    expect(s.founders[1]).toEqual({
      number: 2,
      name: 'Bia',
      amountCents: 5000,
      stones: 20,
      firstStone: false,
      keystone: true,
    });
    expect(s.benefactors).toEqual([]);
  });

  it('lets one gift hold both the First Stone and the Keystone', () => {
    const s = cityStanding([gift('a', 15_000, 1)], GOAL);
    expect(s.founders[0]).toMatchObject({
      firstStone: true,
      keystone: true,
      stones: 100,
    });
  });

  it('gives a stone to whoever pays its last cent', () => {
    const s = cityStanding([gift('a', 1250, 1), gift('b', 100, 2)], GOAL);
    expect(s.founders.map((f) => f.stones)).toEqual([12, 1]);
    expect(s.places.get('b')?.stones).toEqual([13]);
  });

  it('joins a named person founding gifts into one row', () => {
    const s = cityStanding(
      [
        gift('a', 1000, 1, 'Ana', 'd1'),
        gift('b', 500, 2),
        gift('c', 700, 3, 'Ana', 'd1'),
      ],
      GOAL,
    );
    expect(s.founders).toHaveLength(2);
    expect(s.founders[0]).toMatchObject({
      number: 1,
      name: 'Ana',
      amountCents: 1700,
      stones: 17,
    });
    expect(s.founders[1]).toMatchObject({ number: 2, name: null });
    expect(s.places.get('c')?.number).toBe(3);
    expect(s.stones.slice(15, 22).every((x) => x === 1)).toBe(true);
  });

  it('never joins anonymous gifts', () => {
    const s = cityStanding(
      [gift('a', 500, 1, null, 'd1'), gift('b', 500, 2, null, 'd1')],
      GOAL,
    );
    expect(s.founders.map((f) => f.number)).toEqual([1, 2]);
  });

  it('ranks benefactors by total, ties by who gave first', () => {
    const s = cityStanding(
      [
        gift('f', 10_000, 0),
        gift('x1', 4000, 1, 'Xu', 'dx'),
        gift('y', 2500, 2),
        gift('x2', 8000, 3, 'Xu', 'dx'),
        gift('z', 2500, 4),
      ],
      GOAL,
    );
    expect(s.benefactors).toEqual([
      { rank: 1, name: 'Xu', amountCents: 12_000 },
      { rank: 2, name: null, amountCents: 2500 },
      { rank: 3, name: null, amountCents: 2500 },
    ]);
  });

  it('does not list a named founder again among benefactors', () => {
    const s = cityStanding(
      [
        gift('a', 10_000, 1, 'Ana', 'd1'),
        gift('b', 3000, 2, 'Ana', 'd1'),
        gift('c', 1000, 3, null, 'd1'),
      ],
      GOAL,
    );
    expect(s.benefactors).toEqual([{ rank: 1, name: null, amountCents: 1000 }]);
  });

  it('orders by time, not by input order', () => {
    const gifts = [
      gift('a', 1000, 1, 'Ana', 'd1'),
      gift('b', 9000, 2),
      gift('c', 500, 3, 'Cy', 'd3'),
      gift('d', 700, 4, 'Cy', 'd3'),
    ];
    const shuffled = [gifts[3], gifts[1], gifts[0], gifts[2]];
    expect(cityStanding(shuffled, GOAL)).toEqual(cityStanding(gifts, GOAL));
  });

  it('handles a goal that is not whole dollars', () => {
    expect(cityStanding([], 250).stoneCount).toBe(3);
    const s = cityStanding([gift('a', 250, 1)], 250);
    expect(s.places.get('a')?.stones).toEqual([1, 2, 3]);
  });
});
