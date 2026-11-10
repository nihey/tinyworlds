import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedCities } from './seed-cities.js';

/**
 * Puts the starting cities in place. Safe to run again at any time: a city that is already
 * there keeps what it has raised, its donations and (for the suggestions) whatever status it
 * has reached since. Only the built ones are re-asserted as built.
 *
 *   npm run seed
 */
config({ path: '.env', quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const goalCents = Number(process.env.CITY_GOAL_CENTS ?? 10_000);
if (!Number.isInteger(goalCents) || goalCents <= 0)
  throw new Error('CITY_GOAL_CENTS must be a positive whole number of cents');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

try {
  const { built, proposed } = await seedCities(prisma, goalCents);
  const total = await prisma.city.count();
  console.log(
    `Seeded ${built} built and ${proposed} proposed cities; ${total} in the table.`,
  );
} finally {
  await prisma.$disconnect();
}
