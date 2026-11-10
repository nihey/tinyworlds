import { BUILT, PROPOSED } from './seed-data.js';

/** The two Prisma calls the seed makes: the real client, or a stand-in in tests. */
export interface SeedDatabase {
  city: {
    upsert(args: {
      where: { slug: string };
      create: {
        slug: string;
        name: string;
        goalCents: number;
        status?: 'BUILT';
        worldId?: string;
      };
      update: { status?: 'BUILT'; worldId?: string };
    }): Promise<unknown>;
  };
}

/**
 * Puts the starting cities in place, by slug. A city that is already there keeps its name, what
 * it has raised and its donations. A built one is (re)asserted as BUILT with its world, even if
 * donors had it on the list as a proposal first; a suggestion that already exists is left
 * exactly as it is, whatever status it has reached.
 */
export async function seedCities(
  db: SeedDatabase,
  goalCents: number,
): Promise<{ built: number; proposed: number }> {
  for (const city of BUILT) {
    await db.city.upsert({
      where: { slug: city.slug },
      create: {
        slug: city.slug,
        name: city.name,
        status: 'BUILT',
        worldId: city.worldId,
        goalCents,
      },
      update: { status: 'BUILT', worldId: city.worldId },
    });
  }
  for (const city of PROPOSED) {
    await db.city.upsert({
      where: { slug: city.slug },
      create: { slug: city.slug, name: city.name, goalCents },
      update: {},
    });
  }
  return { built: BUILT.length, proposed: PROPOSED.length };
}
