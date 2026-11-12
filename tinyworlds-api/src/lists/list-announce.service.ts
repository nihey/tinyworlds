import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { failureOf } from '../auth/failure.js';
import type { Env } from '../config/env.js';
import { isLocale, type Locale } from '../donations/locales.js';
import { CityStatus } from '../generated/prisma/enums.js';
import {
  isRecipientRefused,
  isServerFailure,
  MAILER,
  type Mail,
  type Mailer,
} from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { listBuiltMail, type ListBuiltCity } from './list-built-mail.js';
import { NEW_CITIES } from './list-key.js';
import { leaveUrlsFor } from './lists.service.js';
import { type MailSight, SightsCatalog } from './sights-catalog.js';

/** What telling one city's lists came to. */
export interface ListCityAnnouncement {
  world: string;
  city: string;
  /** Mails sent that named the city. */
  mailed: number;
  /** Donor ids whose mail failed, and those not tried once the mail server failed. */
  failed: string[];
  unsent: string[];
  /**
   * Donor ids whose address the mail server refused for good (`isRecipientRefused`): counted as
   * told, so they are not tried again and do not keep the list open.
   */
  refused: string[];
  /** Everyone was told: the city counts as announced to its lists, and its list has ended. */
  closed: boolean;
}

/** What a run came to: city by city, and the worlds whose buildings could not be read. */
export interface ListAnnouncement {
  cities: ListCityAnnouncement[];
  unread: string[];
}

/** What the command prints for the lists: counts and donor ids, never an address. */
export function describeListAnnouncement(done: ListAnnouncement): string[] {
  if (!done.cities.length)
    return ['Lists: no city newly built here, nothing to send.'];
  const lines: string[] = [];
  for (const c of done.cities) {
    const where = `${c.city} (${c.world}), its lists`;
    const missed = [...c.failed, ...c.unsent];
    const refused = c.refused.length ? `, ${c.refused.length} refused` : '';
    if (missed.length) {
      lines.push(
        `${where}: ${c.mailed} mailed, ${c.failed.length} failed${refused}` +
          (c.unsent.length
            ? `, ${c.unsent.length} not tried once the mail server failed.`
            : '.'),
        `Not mailed (donor ids): ${missed.join(', ')}`,
        'Its list stays open: the next run mails them, and nobody twice.',
      );
    } else if (c.closed) {
      lines.push(
        `${where}: ${c.mailed} mailed, 0 failed${refused}. Its list is closed.`,
      );
    } else {
      lines.push(
        `${where}: ${c.mailed} mailed, 0 failed${refused}. Another run was mailing some of them: its list stays open until a run finds everyone told.`,
      );
    }
    if (c.refused.length)
      lines.push(
        `Refused by the mail server, counted as told and not tried again (donor ids): ${c.refused.join(', ')}`,
      );
  }
  if (done.unread.length)
    lines.push(
      `Could not read the buildings of ${done.unread.join(', ')}: ${done.unread.length === 1 ? 'its' : 'their'} mails went without them.`,
    );
  return lines;
}

/**
 * True when someone waiting was not mailed: a failure, a mail not tried, or an address refused
 * (said once: a refused person counts as told, so the next run does not say it again).
 */
export const listsFellShort = (done: ListAnnouncement): boolean =>
  done.cities.some(
    (c) => c.failed.length + c.unsent.length + c.refused.length > 0,
  );

/** A city whose lists are told in this run. */
interface Built {
  id: string;
  name: string;
  slug: string;
  world: string;
  /** Who joined after this is not told about it: the moment its first run began. */
  startedAt: Date;
}

/** A place on a list: one city's (`cityId`) or new cities' (null). */
interface Membership {
  donorId: string;
  cityId: string | null;
  locale: string;
  createdAt: Date;
}

/** One person's mail, ready to go, and the cities it tells them of. */
interface Letter {
  donorId: string;
  cityIds: string[];
  mail: Mail;
}

/** As many buildings as a mail about one world shows. */
const SIGHTS_ONE = 3;

/**
 * Tells everyone waiting on a list that the world they waited for is on the map, once each, in
 * the same command that tells its donors (`announce-cli.ts`, after the donors' step). A city's
 * list hears of that city; "new cities" hears of every world built after joining it. The city's
 * donors are left out (they have their own mail), and so is anyone already told of it. One mail
 * per person names all their cities of the run.
 *
 * Each person is claimed before their mail goes out (their `list_notices` rows, unique on donor
 * and city), so two runs at once cannot both mail them, and given back when it fails, so the
 * next run tries again; a mail server that is away stops the run. An address the mail server
 * refuses for good keeps its claim: it counts as told, logged by donor id, so it cannot keep its
 * city open. A city whose run left nobody untold is closed: `lists_announced_at` is set and its
 * list ends.
 */
@Injectable()
export class ListAnnounceService {
  private readonly logger = new Logger(ListAnnounceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly catalog: SightsCatalog,
  ) {}

  async announce(worlds: string[]): Promise<ListAnnouncement> {
    const cities = await this.builtCities(worlds);
    if (!cities.length) return { cities: [], unread: [] };
    const { letters, unread } = await this.lettersFor(cities);

    const tally = new Map<string, ListCityAnnouncement>(
      cities.map((c) => [
        c.id,
        {
          world: c.world,
          city: c.name,
          mailed: 0,
          failed: [],
          unsent: [],
          refused: [],
          closed: false,
        },
      ]),
    );
    const of = (cityId: string) => tally.get(cityId)!;
    /** Cities with someone another run is mailing now: that run, or a later one, closes them. */
    const elsewhere = new Set<string>();

    for (const [i, letter] of letters.entries()) {
      if (!(await this.claim(letter))) {
        for (const id of letter.cityIds) elsewhere.add(id);
        continue;
      }
      try {
        await this.mailer.send(letter.mail);
        for (const id of letter.cityIds) of(id).mailed++;
      } catch (error) {
        if (isRecipientRefused(error)) {
          // it would be refused on every run: the claim stays, and it counts as told
          for (const id of letter.cityIds) of(id).refused.push(letter.donorId);
          this.logger.error(
            `The list mail about ${letter.cityIds.map((id) => of(id).world).join(', ')} to donor ${letter.donorId} was refused by the mail server for good: ${failureOf(error)}. Counted as told, not tried again`,
          );
          continue;
        }
        await this.release(letter);
        for (const id of letter.cityIds) of(id).failed.push(letter.donorId);
        // the donor's id, never their address
        this.logger.error(
          `The list mail about ${letter.cityIds.map((id) => of(id).world).join(', ')} to donor ${letter.donorId} was not sent: ${failureOf(error)}`,
        );
        if (isServerFailure(error)) {
          for (const rest of letters.slice(i + 1))
            for (const id of rest.cityIds) of(id).unsent.push(rest.donorId);
          break;
        }
      }
    }

    for (const city of cities) {
      const done = of(city.id);
      if (done.failed.length || done.unsent.length || elsewhere.has(city.id))
        continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.city.updateMany({
          where: { id: city.id, listsAnnouncedAt: null },
          data: { listsAnnouncedAt: new Date() },
        });
        await tx.listMember.deleteMany({ where: { cityId: city.id } });
      });
      done.closed = true;
    }
    return { cities: cities.map((c) => of(c.id)), unread };
  }

  /**
   * The worlds' cities whose lists are still to be told (built, shown, not announced to them),
   * in the order the worlds were given; each marked started the first time.
   */
  private async builtCities(worlds: string[]): Promise<Built[]> {
    const found = await this.prisma.city.findMany({
      where: {
        worldId: { in: worlds },
        status: CityStatus.BUILT,
        hidden: false,
        listsAnnouncedAt: null,
      },
      select: { id: true },
    });
    if (!found.length) return [];
    const ids = found.map((c) => c.id);
    // the first run fixes who is waiting: a retry tells nobody who joined since
    await this.prisma.city.updateMany({
      where: { id: { in: ids }, listsStartedAt: null },
      data: { listsStartedAt: new Date() },
    });
    const rows = await this.prisma.city.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        slug: true,
        worldId: true,
        listsStartedAt: true,
      },
    });
    return rows
      .flatMap((c) =>
        c.worldId && c.listsStartedAt
          ? [
              {
                id: c.id,
                name: c.name,
                slug: c.slug,
                world: c.worldId,
                startedAt: c.listsStartedAt,
              },
            ]
          : [],
      )
      .sort((a, b) => worlds.indexOf(a.world) - worlds.indexOf(b.world));
  }

  /**
   * Everyone's mail, the one who has waited longest first; and the worlds whose buildings could
   * not be read. The buildings are picked once per world and language, whoever needs them.
   */
  private async lettersFor(
    cities: Built[],
  ): Promise<{ letters: Letter[]; unread: string[] }> {
    const ids = cities.map((c) => c.id);
    const [onCities, onNew, gifts, notices] = await Promise.all([
      this.prisma.listMember.findMany({ where: { cityId: { in: ids } } }),
      this.prisma.listMember.findMany({ where: { cityId: null } }),
      this.prisma.donation.findMany({
        where: { cityId: { in: ids }, donorId: { not: null } },
        select: { donorId: true, cityId: true },
      }),
      this.prisma.listNotice.findMany({
        where: { cityId: { in: ids } },
        select: { donorId: true, cityId: true },
      }),
    ]);
    const pair = (donorId: string | null, cityId: string | null) =>
      `${donorId}/${cityId}`;
    // a city's donors have their own mail; and nobody hears of a city twice
    const leftOut = new Set([
      ...gifts.map((g) => pair(g.donorId, g.cityId)),
      ...notices.map((n) => pair(n.donorId, n.cityId)),
    ]);

    // each person's cities, and the places on lists that are why they hear of each
    const people = new Map<string, Map<string, Membership[]>>();
    for (const city of cities) {
      const reasons = [
        ...onCities.filter((m) => m.cityId === city.id),
        ...onNew,
      ];
      for (const m of reasons) {
        if (m.createdAt > city.startedAt) continue;
        if (leftOut.has(pair(m.donorId, city.id))) continue;
        let theirs = people.get(m.donorId);
        if (!theirs) {
          theirs = new Map<string, Membership[]>();
          people.set(m.donorId, theirs);
        }
        theirs.set(city.id, [...(theirs.get(city.id) ?? []), m]);
      }
    }
    if (!people.size) return { letters: [], unread: [] };

    const donors = await this.prisma.donor.findMany({
      where: { id: { in: [...people.keys()] } },
      select: { id: true, email: true },
    });
    const emails = new Map(donors.map((d) => [d.id, d.email]));
    const byId = new Map(cities.map((c) => [c.id, c]));

    const plans = [...people].flatMap(([donorId, theirs]) => {
      const email = emails.get(donorId);
      if (!email) return [];
      const reasons = [...theirs.values()].flat();
      const newest = reasons.reduce((a, b) =>
        b.createdAt > a.createdAt ? b : a,
      );
      // one list is why: that city's; several (or new cities): new cities'
      const lists = new Set(reasons.map((m) => m.cityId ?? NEW_CITIES));
      const [only] = lists.size === 1 ? [...lists] : [];
      const reason = only && only !== NEW_CITIES ? byId.get(only) : undefined;
      return [
        {
          donorId,
          email,
          locale: isLocale(newest.locale) ? newest.locale : ('en-US' as const),
          cities: cities.filter((c) => theirs.has(c.id)),
          reason,
          since: Math.min(...reasons.map((m) => m.createdAt.getTime())),
        },
      ];
    });
    plans.sort(
      (a, b) =>
        a.since - b.since ||
        (a.donorId < b.donorId ? -1 : a.donorId > b.donorId ? 1 : 0),
    );

    const picks = await this.pick(
      plans.flatMap((p) => p.cities.map((c) => [c.world, p.locale] as const)),
    );
    const site = this.config
      .get('SITE_URL', { infer: true })
      .replace(/\/+$/, '');
    const letters = plans.map((p): Letter => {
      const several = p.cities.length > 1;
      const shown = p.cities.map((c): ListBuiltCity => {
        const pick = picks.get(`${c.world}/${p.locale}`)!;
        return {
          name: c.name,
          slug: c.slug,
          world: c.world,
          quiz: pick.quiz,
          sights: pick.sights
            .slice(0, several ? 1 : SIGHTS_ONE)
            .map((s) => ({ ...s, city: c.name })),
        };
      });
      const urls = leaveUrlsFor(
        this.config,
        p.donorId,
        p.reason ? p.reason.id : NEW_CITIES,
      );
      return {
        donorId: p.donorId,
        cityIds: p.cities.map((c) => c.id),
        mail: {
          to: p.email,
          ...listBuiltMail({
            locale: p.locale,
            site,
            cities: shown,
            reason: p.reason
              ? { kind: 'city', name: p.reason.name }
              : { kind: 'new' },
            ...urls,
          }),
        },
      };
    });
    const unreadWorlds = new Set(
      [...picks.values()].filter((p) => p.unread).map((p) => p.world),
    );
    const unread = cities
      .map((c) => c.world)
      .filter((world) => unreadWorlds.has(world));
    return { letters, unread };
  }

  /** The buildings of each world and language asked, picked once each. */
  private async pick(
    wanted: (readonly [world: string, locale: Locale])[],
  ): Promise<
    Map<
      string,
      { world: string; sights: MailSight[]; unread: boolean; quiz: boolean }
    >
  > {
    const unique = new Map(
      wanted.map(([world, locale]) => [
        `${world}/${locale}`,
        { world, locale },
      ]),
    );
    return new Map(
      await Promise.all(
        [...unique].map(
          async ([key, { world, locale }]) =>
            [
              key,
              {
                world,
                ...(await this.catalog.pickIn(world, locale, SIGHTS_ONE)),
              },
            ] as const,
        ),
      ),
    );
  }

  /**
   * Claims a person for their cities before their mail goes out: false when another run has
   * (the rows are there already), and that run mails them.
   */
  private async claim(letter: Letter): Promise<boolean> {
    try {
      await this.prisma.listNotice.createMany({
        data: letter.cityIds.map((cityId) => ({
          donorId: letter.donorId,
          cityId,
        })),
      });
      return true;
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== 'P2002') throw error;
      this.logger.warn(
        `Donor ${letter.donorId} is being told by another run: skipped here`,
      );
      return false;
    }
  }

  /** Gives a person back after their mail failed: the next run tries them again. */
  private async release(letter: Letter): Promise<void> {
    try {
      await this.prisma.listNotice.deleteMany({
        where: { donorId: letter.donorId, cityId: { in: letter.cityIds } },
      });
    } catch (error) {
      this.logger.error(
        `Donor ${letter.donorId} could not be given back after their list mail failed, and will not be tried again: ${failureOf(error)}`,
      );
      throw error;
    }
  }
}
