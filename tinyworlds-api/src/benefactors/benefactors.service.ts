import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CityBenefactorsInput } from './dto/city-benefactors.input.js';
import { cleanDisplayName } from './display-name.js';
import type { CityBenefactors } from './models/city-benefactors.model.js';
import type { MyGiving } from './models/my-giving.model.js';
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

  /** The donor's own cities (newest gift first), their places in them, and what went to no city. */
  async myGiving(donorId: string): Promise<MyGiving> {
    const [donor, mine] = await Promise.all([
      this.prisma.donor.findUnique({
        where: { id: donorId },
        select: { displayName: true },
      }),
      this.prisma.donation.findMany({
        where: { donorId, currency: 'usd' },
        select: {
          cityId: true,
          listed: true,
          amountCents: true,
          createdAt: true,
        },
      }),
    ]);
    const projectCents = mine
      .filter((d) => d.cityId === null)
      .reduce((sum, d) => sum + d.amountCents, 0);
    const latest = new Map<string, number>();
    for (const d of mine) {
      if (d.cityId === null) continue;
      latest.set(
        d.cityId,
        Math.max(latest.get(d.cityId) ?? 0, d.createdAt.getTime()),
      );
    }
    const cities = await this.prisma.city.findMany({
      where: { id: { in: [...latest.keys()] }, hidden: false },
    });
    const when = (id: string) => latest.get(id) ?? 0;
    cities.sort(
      (a, b) => when(b.id) - when(a.id) || (a.slug < b.slug ? -1 : 1),
    );
    const rows: MyGiving['cities'] = [];
    for (const city of cities) {
      const all = await this.giftsOf(city.id);
      const { places } = cityStanding(all, city.goalCents);
      const gifts = all.filter((g) => g.donorId === donorId);
      const placed = gifts.map((g) => places.get(g.id));
      const numbers = placed.flatMap((p) =>
        p?.number != null ? [p.number] : [],
      );
      rows.push({
        slug: city.slug,
        name: city.name,
        status: city.status,
        worldId: city.worldId,
        goalCents: city.goalCents,
        raisedCents: city.raisedCents,
        givenCents: gifts.reduce((sum, g) => sum + g.amountCents, 0),
        founderNumber: numbers.length ? Math.min(...numbers) : null,
        stones: placed.flatMap((p) => p?.stones ?? []).sort((a, b) => a - b),
        firstStone: placed.some((p) => p?.firstStone),
        keystone: placed.some((p) => p?.keystone),
        listed: mine.some((d) => d.cityId === city.id && d.listed),
      });
    }
    return {
      displayName: donor?.displayName ?? null,
      cities: rows,
      projectCents,
    };
  }

  /** Lists or unlists every gift the donor made to the city; naming needs a name first. */
  async setListing(
    donorId: string,
    slug: string,
    listed: boolean,
  ): Promise<void> {
    const donor = await this.prisma.donor.findUnique({
      where: { id: donorId },
      select: { displayName: true },
    });
    if (listed && !donor?.displayName) {
      throw new BadRequestException('Choose a name first');
    }
    const city = await this.prisma.city.findUnique({ where: { slug } });
    if (!city) throw new BadRequestException('No such city');
    await this.prisma.donation.updateMany({
      where: { donorId, cityId: city.id },
      data: { listed },
    });
  }

  /** Saves the cleaned name; a name with nothing to show is refused. */
  async setDisplayName(donorId: string, raw: string): Promise<string> {
    const name = cleanDisplayName(raw);
    if (!name) {
      throw new BadRequestException('Choose a name with a letter or a digit');
    }
    await this.prisma.donor.update({
      where: { id: donorId },
      data: { displayName: name },
    });
    return name;
  }
}
