import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sessionSecret } from '../auth/session-secret.js';
import type { Env } from '../config/env.js';
import type { Locale } from '../donations/locales.js';
import { CityStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type ListKey, NEW_CITIES } from './list-key.js';
import { leaveToken, readLeaveToken } from './leave-token.js';

export interface ListCityView {
  slug: string;
  name: string;
  status: CityStatus;
  raisedCents: number;
  goalCents: number;
  waiting: number;
}

export interface MyListsView {
  newCities: boolean;
  cities: ListCityView[];
  donated: string[];
}

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, 'en');

@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** The lists a donor is on, and the unbuilt cities they gave to. */
  async mine(donorId: string): Promise<MyListsView> {
    const [members, gifts, waiting] = await Promise.all([
      this.prisma.listMember.findMany({ where: { donorId } }),
      this.prisma.donation.findMany({
        where: { donorId },
        select: { cityId: true },
      }),
      this.waitingByCity(),
    ]);
    const joined = members.flatMap((m) => (m.cityId ? [m.cityId] : []));
    const given = gifts.flatMap((g) => (g.cityId ? [g.cityId] : []));
    const rows = await this.prisma.city.findMany({
      where: { id: { in: [...new Set([...joined, ...given])] }, hidden: false },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        raisedCents: true,
        goalCents: true,
      },
    });
    return {
      newCities: members.some((m) => m.cityId === null),
      cities: rows
        .filter((c) => joined.includes(c.id))
        .sort(byName)
        .map((c) => ({
          slug: c.slug,
          name: c.name,
          status: c.status,
          raisedCents: c.raisedCents,
          goalCents: c.goalCents,
          waiting: waiting.get(c.id) ?? 0,
        })),
      donated: rows
        .filter((c) => given.includes(c.id) && c.status !== CityStatus.BUILT)
        .sort(byName)
        .map((c) => c.slug),
    };
  }

  /**
   * Puts the donor on a list: new cities, or a city that exists, is not hidden and is not yet
   * built. Joining twice is joining once.
   */
  async join(
    donorId: string,
    key: ListKey,
    locale: Locale,
  ): Promise<MyListsView> {
    let cityId: string | null = null;
    if (key.kind === 'city') {
      const [city] = await this.prisma.city.findMany({
        where: { slug: key.slug, hidden: false },
        select: { id: true, status: true },
      });
      if (!city || city.status === CityStatus.BUILT)
        throw new BadRequestException('That city has no list to join');
      cityId = city.id;
    }
    try {
      await this.prisma.listMember.create({
        data: { donorId, cityId, locale },
      });
    } catch (error) {
      // already on it: the unique index says so
      if ((error as { code?: string }).code !== 'P2002') throw error;
    }
    return this.mine(donorId);
  }

  /** Takes the donor off a list; being off it already is fine. */
  async leave(donorId: string, key: ListKey): Promise<MyListsView> {
    const cityId = await this.cityIdOf(key);
    if (cityId !== undefined)
      await this.prisma.listMember.deleteMany({ where: { donorId, cityId } });
    return this.mine(donorId);
  }

  /**
   * What a leave link does: leaves its list, or every list. True for any signed link, even
   * when there is nothing left to leave; false for one that is not ours.
   */
  async leaveWithToken(token: string, all: boolean): Promise<boolean> {
    const read = readLeaveToken(sessionSecret(this.config), token);
    if (!read) return false;
    if (all)
      await this.prisma.listMember.deleteMany({
        where: { donorId: read.donorId },
      });
    else
      await this.prisma.listMember.deleteMany({
        where: {
          donorId: read.donorId,
          cityId: read.list === NEW_CITIES ? null : read.list,
        },
      });
    return true;
  }

  /** How many are on each city's list, by city id; new cities are not in it. */
  async waitingByCity(): Promise<Map<string, number>> {
    const groups = await this.prisma.listMember.groupBy({
      by: ['cityId'],
      _count: { _all: true },
    });
    const waiting = new Map<string, number>();
    for (const g of groups) if (g.cityId) waiting.set(g.cityId, g._count._all);
    return waiting;
  }

  /** For admins: the size of every list, the most waited for first. */
  async counts(): Promise<{
    newCities: number;
    cities: { slug: string; name: string; waiting: number }[];
  }> {
    const [newCities, waiting] = await Promise.all([
      this.prisma.listMember.count({ where: { cityId: null } }),
      this.waitingByCity(),
    ]);
    const rows = await this.prisma.city.findMany({
      where: { id: { in: [...waiting.keys()] } },
      select: { id: true, slug: true, name: true },
    });
    return {
      newCities,
      cities: rows
        .map((c) => ({
          slug: c.slug,
          name: c.name,
          waiting: waiting.get(c.id) ?? 0,
        }))
        .sort((a, b) => b.waiting - a.waiting || byName(a, b)),
    };
  }

  /** The links a mail carries to leave a list (`list`: a city's id or '*'). */
  leaveUrls(
    donorId: string,
    list: string,
  ): { leaveUrl: string; unsubscribeUrl: string } {
    const site = this.config
      .get('SITE_URL', { infer: true })
      .replace(/\/+$/, '');
    const token = leaveToken(sessionSecret(this.config), donorId, list);
    return {
      leaveUrl: `${site}/lists/leave/#t=${token}`,
      unsubscribeUrl: `${site}/api/lists/unsubscribe?t=${token}`,
    };
  }

  /** A city's id for a list key; null for new cities; undefined for a city that is not there. */
  private async cityIdOf(key: ListKey): Promise<string | null | undefined> {
    if (key.kind === 'new') return null;
    const [city] = await this.prisma.city.findMany({
      where: { slug: key.slug },
      select: { id: true },
    });
    return city?.id;
  }
}
