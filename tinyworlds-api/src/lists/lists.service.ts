import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { failureOf } from '../auth/failure.js';
import { sessionSecret } from '../auth/session-secret.js';
import type { Env } from '../config/env.js';
import type { Locale } from '../donations/locales.js';
import { CityStatus } from '../generated/prisma/enums.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type ListKey, listKeyOf, NEW_CITIES } from './list-key.js';
import { leaveToken, readLeaveToken } from './leave-token.js';
import { SightsCatalog } from './sights-catalog.js';
import { welcomeMail } from './welcome-mail.js';

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

/**
 * The links a list mail carries to leave its list (`list`: a city's id or '*'): the page that
 * leaves at once, and the one-click address a mail client posts to (RFC 8058).
 */
export function leaveUrlsFor(
  config: ConfigService<Env, true>,
  donorId: string,
  list: string,
): { leaveUrl: string; unsubscribeUrl: string } {
  const site = config.get('SITE_URL', { infer: true }).replace(/\/+$/, '');
  const token = leaveToken(sessionSecret(config), donorId, list);
  return {
    leaveUrl: `${site}/lists/leave/#t=${token}`,
    unsubscribeUrl: `${site}/api/lists/unsubscribe?t=${token}`,
  };
}

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, 'en');

@Injectable()
export class ListsService {
  private readonly logger = new Logger(ListsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly catalog: SightsCatalog,
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
    let city: { id: string; name: string; slug: string } | null = null;
    if (key.kind === 'city') {
      const [found] = await this.prisma.city.findMany({
        where: { slug: key.slug, hidden: false },
        select: { id: true, slug: true, name: true, status: true },
      });
      if (!found || found.status === CityStatus.BUILT)
        throw new BadRequestException('That city has no list to join');
      city = found;
      cityId = found.id;
    }
    let isNew = true;
    try {
      await this.prisma.listMember.create({
        data: { donorId, cityId, locale },
      });
    } catch (error) {
      // already on it: the unique index says so
      if ((error as { code?: string }).code !== 'P2002') throw error;
      isNew = false;
    }
    const answer = await this.mine(donorId);
    // the welcome goes out after the answer, and never holds it up
    if (isNew) setImmediate(() => void this.welcome(donorId, city, locale));
    return answer;
  }

  /**
   * What a list is, for a mail that offers to join it: new cities, or a city's name; null for a
   * city that is built, hidden or unknown (a list nobody can join).
   */
  async describe(
    raw: string,
  ): Promise<{ kind: 'new' } | { kind: 'city'; name: string } | null> {
    const key = listKeyOf(raw);
    if (key.kind === 'new') return { kind: 'new' };
    const [found] = await this.prisma.city.findMany({
      where: { slug: key.slug, hidden: false },
      select: { name: true, status: true },
    });
    return found && found.status !== CityStatus.BUILT
      ? { kind: 'city', name: found.name }
      : null;
  }

  /**
   * Joins the list a sign-in link carried, once the link is used. Never throws and never says
   * why: a list that cannot be joined any more (built since, hidden) is simply not joined.
   */
  async joinAfterSignIn(
    donorId: string,
    raw: string,
    locale: Locale,
  ): Promise<void> {
    try {
      if (!(await this.describe(raw))) return;
      await this.join(donorId, listKeyOf(raw), locale);
    } catch (error) {
      this.logger.error(
        `Donor ${donorId} could not join a list on signing in: ${failureOf(error)}`,
      );
    }
  }

  /**
   * The welcome mail, once per donor: whoever claims `welcomedAt` sends it. Never throws; a
   * failure gives the claim back so the next join tries again, and is logged by donor id.
   */
  async welcome(
    donorId: string,
    city: { id: string; name: string; slug: string } | null,
    locale: Locale,
  ): Promise<void> {
    let claimed = false;
    try {
      const donor = await this.prisma.donor.findUnique({
        where: { id: donorId },
        select: { email: true, welcomedAt: true },
      });
      if (!donor || donor.welcomedAt) return;
      const claim = await this.prisma.donor.updateMany({
        where: { id: donorId, welcomedAt: null },
        data: { welcomedAt: new Date() },
      });
      if (claim.count === 0) return;
      claimed = true;
      const site = this.config
        .get('SITE_URL', { infer: true })
        .replace(/\/+$/, '');
      const cities = await this.prisma.city.findMany({
        where: {
          status: CityStatus.BUILT,
          hidden: false,
          worldId: { not: null },
        },
        select: { name: true, worldId: true },
      });
      const names = new Map<string, string>();
      for (const c of cities) if (c.worldId) names.set(c.worldId, c.name);
      const { sights } = await this.catalog.pickAcross(
        [...names.keys()].sort(),
        locale,
        3,
      );
      const { leaveUrl, unsubscribeUrl } = this.leaveUrls(
        donorId,
        city ? city.id : NEW_CITIES,
      );
      await this.mailer.send({
        to: donor.email,
        ...welcomeMail({
          locale,
          site,
          list: city
            ? { kind: 'city', name: city.name, slug: city.slug }
            : { kind: 'new' },
          sights: sights.map((s) => ({ ...s, city: names.get(s.world) })),
          leaveUrl,
          unsubscribeUrl,
        }),
      });
    } catch (error) {
      this.logger.error(
        `The welcome for donor ${donorId} was not sent: ${failureOf(error)}`,
      );
      if (claimed)
        await this.prisma.donor
          .update({ where: { id: donorId }, data: { welcomedAt: null } })
          .catch(() => undefined);
    }
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
    return leaveUrlsFor(this.config, donorId, list);
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
