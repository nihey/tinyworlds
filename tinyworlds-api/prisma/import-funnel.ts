import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { createInterface } from 'node:readline';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { funnelRowOf, type FunnelRow } from './funnel-rows.js';

/**
 * Brings funnel steps in from somewhere else: what a page-analytics tool saw before the site
 * reported its own steps. Reads one JSON object per line from standard input (see
 * funnel-rows.ts; scripts/rybbit-funnel.sql makes such a file from a Rybbit database).
 * Safe to run again: a visit's step on a world is kept once.
 *
 *   npm run funnel:import < funnel.ndjson
 */
config({ path: '.env', quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

const BATCH = 1000;
let read = 0;
let added = 0;
const refused = new Map<string, number>();

async function write(rows: FunnelRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { count } = await prisma.funnelEvent.createMany({
    data: rows,
    skipDuplicates: true,
  });
  added += count;
}

try {
  let batch: FunnelRow[] = [];
  for await (const line of createInterface({ input: process.stdin })) {
    if (!line.trim()) continue;
    read++;
    const row = funnelRowOf(line);
    if (typeof row === 'string') {
      refused.set(row, (refused.get(row) ?? 0) + 1);
      continue;
    }
    batch.push(row);
    if (batch.length >= BATCH) {
      await write(batch);
      batch = [];
    }
  }
  await write(batch);
  const bad = [...refused.values()].reduce((sum, n) => sum + n, 0);
  console.log(
    `Read ${read} steps: ${added} added, ${read - bad - added} already there, ${bad} refused.`,
  );
  for (const [reason, n] of refused) console.log(`  refused ${n}: ${reason}`);
} finally {
  await prisma.$disconnect();
}
