import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CityBenefactorsInput } from './dto/city-benefactors.input.js';
import type { CityBenefactors } from './models/city-benefactors.model.js';
import { cityStanding, type Gift } from './standing.js';

@Injectable()
export class BenefactorsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A city's paid gifts in dollars, oldest first, with a name only where it may be shown. */
  async giftsOf(cityId: string): Promise<Gift[]> {
    const rows = await this.prisma.donation.findMany({
      where: { cityId, currency: 'usd' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { donor: { select: { displayName: true, nameHidden: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      donorId: row.donorId,
      amountCents: row.amountCents,
      at: row.createdAt,
      name:
        row.listed && row.donor?.displayName && !row.donor.nameHidden
          ? row.donor.displayName
          : null,
    }));
  }

  /** Null for a city that does not exist or is hidden. */
  async cityBenefactors(
    input: CityBenefactorsInput,
  ): Promise<CityBenefactors | null> {
    const { slug, world } = input;
    if (!slug === !world) {
      throw new BadRequestException('give either slug or world');
    }
    const city = await this.prisma.city.findFirst({
      where: slug ? { slug, hidden: false } : { worldId: world, hidden: false },
    });
    if (!city) return null;
    const standing = cityStanding(await this.giftsOf(city.id), city.goalCents);
    return {
      slug: city.slug,
      name: city.name,
      status: city.status,
      worldId: city.worldId,
      goalCents: city.goalCents,
      raisedCents: city.raisedCents,
      stones: standing.stones,
      founders: standing.founders,
      benefactors: standing.benefactors,
    };
  }
}
