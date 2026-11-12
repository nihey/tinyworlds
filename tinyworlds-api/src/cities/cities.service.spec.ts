import {
  benefactorCounts,
  inMilestoneOrder,
  type MilestoneRow,
} from './cities.service.js';

const row = (over: Partial<MilestoneRow> & { name: string }): MilestoneRow => ({
  id: `id-${over.name}`,
  slug: over.name.toLowerCase(),
  status: 'PROPOSED',
  goalCents: 10_000,
  raisedCents: 0,
  donationCount: 0,
  benefactors: 0,
  worldId: null,
  ...over,
});

describe('inMilestoneOrder', () => {
  it('puts the best funded first, ties by name, and what is built last', () => {
    const list = inMilestoneOrder([
      row({ name: 'New York', status: 'BUILT', worldId: 'tinynyc' }),
      row({ name: 'Tokyo' }),
      row({ name: 'Paris', raisedCents: 2500 }),
      row({ name: 'London' }),
      row({ name: 'Lisbon', raisedCents: 12_000, status: 'FUNDED' }),
      row({
        name: 'Athens',
        status: 'BUILT',
        worldId: 'tinyath',
        raisedCents: 99_999,
      }),
      row({ name: 'Berlin', raisedCents: 2500, status: 'BUILDING' }),
    ]);
    expect(list.map((c) => c.name)).toEqual([
      'Lisbon',
      'Berlin',
      'Paris',
      'London',
      'Tokyo',
      'Athens',
      'New York',
    ]);
  });

  it('reports the number of donations under the name the API uses', () => {
    const [city] = inMilestoneOrder([
      row({
        name: 'Paris',
        raisedCents: 700,
        donationCount: 3,
        benefactors: 2,
      }),
    ]);
    expect(city).toEqual({
      id: 'id-Paris',
      slug: 'paris',
      name: 'Paris',
      raisedCents: 700,
      goalCents: 10_000,
      donations: 3,
      benefactorCount: 2,
      status: 'PROPOSED',
      worldId: null,
    });
  });
});

describe('benefactorCounts', () => {
  it('counts each donor once per city, and each gift without a donor as someone', () => {
    const counts = benefactorCounts([
      { cityId: 'lisbon', donorId: 'ana' },
      { cityId: 'lisbon', donorId: 'ana' },
      { cityId: 'lisbon', donorId: 'bo' },
      { cityId: 'lisbon', donorId: null },
      { cityId: 'lisbon', donorId: null },
      { cityId: 'porto', donorId: 'ana' },
    ]);
    expect(counts).toEqual(
      new Map([
        ['lisbon', 4],
        ['porto', 1],
      ]),
    );
  });

  it('knows no city nobody gave to', () => {
    expect(benefactorCounts([]).get('lisbon')).toBeUndefined();
  });
});
