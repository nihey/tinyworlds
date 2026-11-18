import { seedCities } from '../../prisma/seed-cities.js';
import { BUILT, PROPOSED } from '../../prisma/seed-data.js';
import { FakePrisma } from '../../test/fake-prisma.js';
import { citySlug } from './city-name.js';

describe('seed data', () => {
  it('gives every city the slug a donor typing its name would produce', () => {
    for (const city of [...BUILT, ...PROPOSED]) {
      expect(citySlug(city.name)).toBe(city.slug);
    }
  });

  it('has no city twice', () => {
    const slugs = [...BUILT, ...PROPOSED].map((city) => city.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('names the world of every built city', () => {
    for (const city of BUILT) expect(city.worldId).toMatch(/^[a-z0-9]{3,20}$/);
    expect(BUILT).toContainEqual({
      slug: 'austin',
      name: 'Austin',
      worldId: 'tinyaus',
    });
  });
});

describe('seeding', () => {
  it('starts an empty table with the built cities and the suggestions', async () => {
    const db = new FakePrisma();
    expect(await seedCities(db, 10_000)).toEqual({
      built: BUILT.length,
      proposed: PROPOSED.length,
    });
    expect(db.cities).toHaveLength(BUILT.length + PROPOSED.length);
    expect(db.cities.find((city) => city.slug === 'orlando')).toMatchObject({
      name: 'Orlando',
      status: 'BUILT',
      worldId: 'tinyorl',
      goalCents: 10_000,
      raisedCents: 0,
      donationCount: 0,
    });
    for (const city of PROPOSED) {
      expect(db.cities.find((row) => row.slug === city.slug)).toMatchObject({
        status: 'PROPOSED',
        worldId: null,
        raisedCents: 0,
      });
    }
  });

  it.each([
    ['orlando', 'orlando fl', 'tinyorl'],
    ['bethlehem-pennsylvania', 'Bethlehem Pennsylvania', 'tinybeth'],
  ])(
    'marks %s built and preserves its funding',
    async (slug, name, worldId) => {
      const db = new FakePrisma();
      const proposal = db.seedCity({
        slug,
        name,
        status: 'FUNDED',
        goalCents: 15_000,
        raisedCents: 18_200,
        donationCount: 7,
      });
      await seedCities(db, 10_000);
      expect(db.cities.filter((city) => city.slug === slug)).toEqual([
        {
          ...proposal,
          status: 'BUILT',
          worldId,
          // untouched: the name its first donor typed, its own goal, and every cent
          name,
          goalCents: 15_000,
          raisedCents: 18_200,
          donationCount: 7,
        },
      ]);
    },
  );

  it('changes nothing when run again, and leaves a suggestion that has moved on alone', async () => {
    const db = new FakePrisma();
    await seedCities(db, 10_000);
    const lisbon = db.cities.find((city) => city.slug === 'lisbon')!;
    Object.assign(lisbon, {
      status: 'BUILDING',
      raisedCents: 12_000,
      donationCount: 4,
    });
    const before = db.cities.map((city) => ({ ...city }));
    await seedCities(db, 99_999);
    expect(db.cities).toEqual(before);
  });
});
