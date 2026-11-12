import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../vitest.config.e2e.js';

const MIGRATIONS = join(import.meta.dirname, '../prisma/migrations');
const sqlOf = (migration: string) =>
  readFileSync(join(MIGRATIONS, migration, 'migration.sql'), 'utf8');

/**
 * Migrations that change rows, run on a database of their own: every migration before the one
 * under test, then rows as they were, then that migration.
 */
describe('the migrations', () => {
  const url = new URL(E2E_DATABASE_URL);
  const name = `${url.pathname.slice(1)}_migrations`;
  const at = (database: string) =>
    Object.assign(new URL(url), { pathname: `/${database}` }).href;
  const all = readdirSync(MIGRATIONS)
    .filter((entry) => /^\d{14}_/.test(entry))
    .sort();

  const onServer = async (sql: string) => {
    const admin = new pg.Client({ connectionString: at('postgres') });
    await admin.connect();
    try {
      await admin.query(sql);
    } finally {
      await admin.end();
    }
  };

  let db: pg.Client;
  /** A fresh database with every migration before `migration` applied. */
  const upTo = async (migration: string) => {
    const index = all.indexOf(migration);
    expect(index).toBeGreaterThan(0);
    for (const earlier of all.slice(0, index)) await db.query(sqlOf(earlier));
  };

  beforeEach(async () => {
    await onServer(`DROP DATABASE IF EXISTS "${name}"`);
    await onServer(`CREATE DATABASE "${name}"`);
    db = new pg.Client({ connectionString: at(name) });
    await db.connect();
  });

  afterEach(async () => {
    await db.end();
    await onServer(`DROP DATABASE IF EXISTS "${name}"`);
  });

  it('counts the cities already on the map as announced, and no other', async () => {
    const migration = '20261111220000_built_announced';
    await upTo(migration);
    await db.query(`INSERT INTO cities (id, slug, name, status, goal_cents, world_id, updated_at) VALUES
      (gen_random_uuid(), 'new-york', 'New York', 'BUILT', 3000, 'tinynyc', now()),
      (gen_random_uuid(), 'orlando', 'Orlando', 'BUILT', 3000, NULL, now()),
      (gen_random_uuid(), 'las-vegas', 'Las Vegas', 'BUILDING', 3000, 'tinylas', now()),
      (gen_random_uuid(), 'lisbon', 'Lisbon', 'BUILDING', 3000, NULL, now()),
      (gen_random_uuid(), 'sao-paulo', 'São Paulo', 'FUNDED', 3000, NULL, now())`);
    await db.query(sqlOf(migration));
    const { rows } = await db.query<{
      slug: string;
      built_announced_at: Date | null;
    }>('SELECT slug, built_announced_at FROM cities ORDER BY slug');
    expect(
      rows.map((row) => [row.slug, row.built_announced_at !== null]),
    ).toEqual([
      ['las-vegas', true],
      ['lisbon', false],
      ['new-york', true],
      ['orlando', true],
      ['sao-paulo', false],
    ]);
  });

  it('counts every world already on the map as told to the lists', async () => {
    const migration = '20261112020000_city_lists';
    await upTo(migration);
    await db.query(`INSERT INTO cities (id, slug, name, status, goal_cents, world_id, updated_at) VALUES
      (gen_random_uuid(), 'new-york', 'New York', 'BUILT', 3000, 'tinynyc', now()),
      (gen_random_uuid(), 'winterfell', 'Winterfell', 'PROPOSED', 3000, 'tinywinterfell', now()),
      (gen_random_uuid(), 'lisbon', 'Lisbon', 'PROPOSED', 3000, NULL, now())`);
    await db.query(sqlOf(migration));
    const { rows } = await db.query<{
      slug: string;
      lists_announced_at: Date | null;
      lists_started_at: Date | null;
    }>(
      'SELECT slug, lists_announced_at, lists_started_at FROM cities ORDER BY slug',
    );
    expect(
      rows.map((row) => [
        row.slug,
        row.lists_announced_at !== null,
        row.lists_started_at !== null,
      ]),
    ).toEqual([
      ['lisbon', false, false],
      ['new-york', true, true],
      ['winterfell', true, true],
    ]);
  });
});
