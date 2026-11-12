import { Injectable } from '@nestjs/common';
import { COUNTED_CURRENCY } from '../donations/currency.js';
import { CityStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CityMilestone } from './models/city-milestone.model.js';

/** What the public list needs of a city row. */
export interface MilestoneRow {
  id: string;
  slug: string;
  name: string;
  status: CityStatus;
  goalCents: number;
  raisedCents: number;
  donationCount: number;
  /** How many people gave to it (`benefactorCounts`). */
  benefactors: number;
  worldId: string | null;
}

/**
 * How many people gave to each city: a donor once, however many gifts; a gift that came with
 * no address (no donor) as someone of its own. A city nobody gave to is not in the map.
 */
export function benefactorCounts(
  gifts: { cityId: string; donorId: string | null }[],
): Map<string, number> {
  const donors = new Map<string, Set<string>>();
  const unknown = new Map<string, number>();
  for (const { cityId, donorId } of gifts) {
    if (donorId === null) unknown.set(cityId, (unknown.get(cityId) ?? 0) + 1);
    else donors.set(cityId, (donors.get(cityId) ?? new Set()).add(donorId));
  }
  const counts = new Map<string, number>();
  for (const cityId of new Set([...donors.keys(), ...unknown.keys()]))
    counts.set(
      cityId,
      (donors.get(cityId)?.size ?? 0) + (unknown.get(cityId) ?? 0),
    );
  return counts;
}

/**
 * The order of the public list: cities still to be built first, the best funded at the top and
 * ties by name; the ones already built last, by name.
 */
export function inMilestoneOrder(rows: MilestoneRow[]): CityMilestone[] {
  const built = (row: MilestoneRow): number =>
    row.status === CityStatus.BUILT ? 1 : 0;
  return [...rows]
    .sort(
      (a, b) =>
        built(a) - built(b) ||
        (built(a) ? 0 : b.raisedCents - a.raisedCents) ||
        a.name.localeCompare(b.name, 'en'),
    )
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      raisedCents: row.raisedCents,
      goalCents: row.goalCents,
      donations: row.donationCount,
      benefactorCount: row.benefactors,
      status: row.status,
      worldId: row.worldId,
    }));
}

@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every city that may be shown, in the order the site lists them, each with how many people
   * gave to it: the gifts that count toward it (in dollars, as `raisedCents` counts them).
   */
  async milestones(): Promise<CityMilestone[]> {
    const [rows, gifts] = await Promise.all([
      this.prisma.city.findMany({
        where: { hidden: false },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          goalCents: true,
          raisedCents: true,
          donationCount: true,
          worldId: true,
        },
      }),
      // one row per donor and city (and per city for the gifts without one)
      this.prisma.donation.groupBy({
        by: ['cityId', 'donorId'],
        where: {
          currency: COUNTED_CURRENCY,
          cityId: { not: null },
          city: { hidden: false },
        },
        _count: { _all: true },
      }),
    ]);
    // a gift without a donor is someone of its own: its group counts each of them
    const people: { cityId: string; donorId: string | null }[] = [];
    for (const { cityId, donorId, _count } of gifts) {
      if (cityId === null) continue;
      const times = donorId === null ? _count._all : 1;
      for (let i = 0; i < times; i++) people.push({ cityId, donorId });
    }
    const counts = benefactorCounts(people);
    return inMilestoneOrder(
      rows.map((row) => ({ ...row, benefactors: counts.get(row.id) ?? 0 })),
    );
  }
}
