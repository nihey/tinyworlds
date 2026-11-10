import { BUILT, PROPOSED } from '../../prisma/seed-data.js';
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
  });
});
