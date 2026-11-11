import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { WorldVisits } from './models/world-visits.model.js';

/** How long after a page last said it was open its visit still counts as exploring. */
export const LIVE_MS = 75_000;

/** How long a count is answered from memory: every front page asks every half minute. */
export const CACHE_MS = 10_000;

/** A page that is still open, as the map says it every half minute. */
export interface PresenceFacts {
  visitId: string;
  world: string;
  locale?: string | null;
}

interface Counts {
  visits: Map<string, number>;
  live: Map<string, number>;
}

/**
 * How many visits each world has had, and how many are still there. A visit is the VISIT step
 * of the funnel (`funnel_events`): one per tab and world, the history from the page analytics
 * included. While a map is open and in view it says so every half minute, which moves its
 * visit's `lastSeenAt`; a visit seen in the last `LIVE_MS` is one exploring now.
 */
@Injectable()
export class VisitsService {
  private counted: { at: number; counts: Promise<Counts> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** The page is still open: its visit is seen now (and counted, if its opening was lost). */
  async stillHere(facts: PresenceFacts): Promise<void> {
    const now = new Date();
    await this.prisma.funnelEvent.upsert({
      where: {
        visitId_step_world: {
          visitId: facts.visitId,
          step: 'VISIT',
          world: facts.world,
        },
      },
      create: {
        visitId: facts.visitId,
        step: 'VISIT',
        world: facts.world,
        locale: facts.locale ?? null,
        city: null,
        amountCents: null,
        lastSeenAt: now,
      },
      update: { lastSeenAt: now },
    });
  }

  /** Each world asked for, once, in the order asked: its visits, and those still open. */
  async ofWorlds(worlds: string[]): Promise<WorldVisits[]> {
    const { visits, live } = await this.counts();
    return [...new Set(worlds)].map((world) => ({
      world,
      visits: visits.get(world) ?? 0,
      live: live.get(world) ?? 0,
    }));
  }

  /** Every world's counts, from memory while they are fresh; a failed count is not kept. */
  private counts(): Promise<Counts> {
    const now = Date.now();
    if (this.counted && now - this.counted.at < CACHE_MS)
      return this.counted.counts;
    const counts = this.count(new Date(now - LIVE_MS));
    const counted = { at: now, counts };
    this.counted = counted;
    counts.catch(() => {
      if (this.counted === counted) this.counted = null;
    });
    return counts;
  }

  private async count(since: Date): Promise<Counts> {
    const [visits, live] = await Promise.all([
      this.prisma.funnelEvent.groupBy({
        by: ['world'],
        where: { step: 'VISIT' },
        _count: { _all: true },
      }),
      this.prisma.funnelEvent.groupBy({
        by: ['world'],
        where: { step: 'VISIT', lastSeenAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const byWorld = (rows: { world: string; _count: { _all: number } }[]) =>
      new Map(rows.map((row) => [row.world, row._count._all]));
    return { visits: byWorld(visits), live: byWorld(live) };
  }
}
