import { execSync } from 'node:child_process';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../vitest.config.e2e.js';

/** Makes the test database if it is not there, and brings it up to the latest migration. */
export default async function setup(): Promise<void> {
  const url = new URL(E2E_DATABASE_URL);
  const database = url.pathname.slice(1);
  const admin = new pg.Client({
    connectionString: Object.assign(new URL(url), { pathname: '/postgres' })
      .href,
  });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      'The e2e tests need the local Postgres: run `docker compose up -d` in tinyworlds-api first.',
      { cause: error },
    );
  }
  try {
    const found = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [database],
    );
    if (found.rowCount === 0)
      await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
  });
}
