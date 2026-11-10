import { Injectable } from '@nestjs/common';
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
  worldId: string | null;
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
      status: row.status,
      worldId: row.worldId,
    }));
}

@Injectable()
export class CitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every city that may be shown, in the order the site lists them. */
  async milestones(): Promise<CityMilestone[]> {
    const rows = await this.prisma.city.findMany({
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
    });
    return inMilestoneOrder(rows);
  }
}
