import { BadRequestException, Injectable } from '@nestjs/common';
import { COUNTED_CURRENCY } from '../donations/currency.js';
import { LinksService } from '../links/links.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CityBenefactorsInput } from './dto/city-benefactors.input.js';
import { cleanDisplayName } from './display-name.js';
import type { BenefactorName } from './models/benefactor-name.model.js';
import type { CityBenefactors } from './models/city-benefactors.model.js';
import type { MyGiving } from './models/my-giving.model.js';
import type { WallBenefactor } from './models/wall.model.js';
import { cityStanding, type Gift } from './standing.js';
import { benefactorWall } from './wall.js';
import { benefactorCounts } from '../cities/cities.service.js';

@Injectable()
export class BenefactorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly links: LinksService,
  ) {}

  /** A city's paid gifts in dollars, oldest first, with a name only where it may be shown. */
  async giftsOf(cityId: string): Promise<Gift[]> {
    const rows = await this.prisma.donation.findMany({
      where: { cityId, currency: COUNTED_CURRENCY },
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
    const gifts = await this.giftsOf(city.id);
    const standing = cityStanding(gifts, city.goalCents);
    // a named row shows its donor's links; a row is named only where the name may be shown
    const rows = [...standing.founders, ...standing.benefactors];
    const links = await this.links.shownFor(
      rows.flatMap((row) => (row.donorId ? [row.donorId] : [])),
    );
    const linksOf = (donorId: string | null) =>
      (donorId && links.get(donorId)) || [];
    return {
      slug: city.slug,
      name: city.name,
      status: city.status,
      worldId: city.worldId,
      goalCents: city.goalCents,
      raisedCents: city.raisedCents,
      benefactorCount:
        benefactorCounts(
          gifts.map((gift) => ({ cityId: city.id, donorId: gift.donorId })),
        ).get(city.id) ?? 0,
      stones: standing.stones,
      founders: standing.founders.map((row) => ({
        ...row,
        links: linksOf(row.donorId),
      })),
      benefactors: standing.benefactors.map((row) => ({
        ...row,
        links: linksOf(row.donorId),
      })),
    };
  }

  /**
   * Everyone who gave to a city that is shown, as one list (`benefactorWall`): named donors
   * with their links, unnamed gifts as they are. Gifts to no city are on no list.
   */
  async wall(): Promise<WallBenefactor[]> {
    const gifts = await this.prisma.donation.findMany({
      where: { currency: COUNTED_CURRENCY, city: { hidden: false } },
      select: {
        donorId: true,
        amountCents: true,
        createdAt: true,
        listed: true,
        donor: { select: { displayName: true, nameHidden: true } },
        city: { select: { slug: true, name: true, worldId: true } },
      },
    });
    const rows = benefactorWall(
      gifts.flatMap((gift) =>
        gift.city
          ? [
              {
                donorId: gift.donorId,
                amountCents: gift.amountCents,
                at: gift.createdAt,
                name:
                  gift.listed &&
                  gift.donor?.displayName &&
                  !gift.donor.nameHidden
                    ? gift.donor.displayName
                    : null,
                city: gift.city,
              },
            ]
          : [],
      ),
    );
    const links = await this.links.shownFor(
      rows.flatMap((row) => (row.donorId ? [row.donorId] : [])),
    );
    return rows.map(({ donorId, ...row }) => ({
      ...row,
      links: (donorId && links.get(donorId)) || [],
    }));
  }

  /** The donor's own cities (newest gift first), their places in them, and what went to no city. */
  async myGiving(donorId: string): Promise<MyGiving> {
    const [donor, mine] = await Promise.all([
      this.prisma.donor.findUnique({
        where: { id: donorId },
        select: { displayName: true },
      }),
      this.prisma.donation.findMany({
        where: { donorId, currency: COUNTED_CURRENCY },
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
      where: { id: { in: [...latest.keys()] } },
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

  /** Donors with a name and at least one listed gift, newest listed gift first, at most 100. */
  async benefactorNames(): Promise<BenefactorName[]> {
    const donors = await this.prisma.donor.findMany({
      where: {
        displayName: { not: null },
        donations: { some: { listed: true } },
      },
      select: {
        id: true,
        displayName: true,
        nameHidden: true,
        linksHidden: true,
        donations: {
          where: { listed: true },
          select: { createdAt: true, city: { select: { name: true } } },
        },
      },
    });
    const links = await this.links.forReview(donors.map((d) => d.id));
    return donors
      .map((d) => ({
        donorId: d.id,
        name: d.displayName ?? '',
        hidden: d.nameHidden,
        links: links.get(d.id) ?? [],
        linksHidden: d.linksHidden,
        cities: [
          ...new Set(d.donations.flatMap((g) => (g.city ? [g.city.name] : []))),
        ].sort(),
        lastGiftAt: new Date(
          Math.max(...d.donations.map((g) => g.createdAt.getTime())),
        ),
      }))
      .sort(
        (a, b) =>
          b.lastGiftAt.getTime() - a.lastGiftAt.getTime() ||
          (a.donorId < b.donorId ? -1 : 1),
      )
      .slice(0, 100);
  }

  /** Hides a donor's name from every list, or shows it again; changes no stone or number. */
  async setNameHidden(donorId: string, hidden: boolean): Promise<void> {
    const { count } = await this.prisma.donor.updateMany({
      where: { id: donorId },
      data: { nameHidden: hidden },
    });
    if (count === 0) throw new BadRequestException('No such donor');
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
