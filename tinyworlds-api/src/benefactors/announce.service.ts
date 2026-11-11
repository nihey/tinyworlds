import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { failureOf } from '../auth/auth.service.js';
import type { Env } from '../config/env.js';
import { isLocale } from '../donations/locales.js';
import type { CityStatus } from '../generated/prisma/enums.js';
import {
  isServerFailure,
  MAILER,
  type Mail,
  type Mailer,
} from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BenefactorsService } from './benefactors.service.js';
import { builtMail } from './built-mail.js';
import { cityStanding } from './standing.js';

/** What announcing a world came to. */
export type Announcement =
  /** No city has that world. */
  | { kind: 'unknown'; world: string }
  /** Its city is not marked BUILT: the seed has not run since the world was added. */
  | { kind: 'not-built'; world: string; city: string; status: CityStatus }
  /** Its donors were told already, at `at`. */
  | { kind: 'announced-before'; world: string; city: string; at: Date }
  /**
   * Its donors were mailed now, and it counts as announced. `failed` are the donors whose mail
   * did not go out, `unsent` those not tried once the mail server failed: a later run does not
   * mail them (the announcement is partial).
   */
  | {
      kind: 'sent';
      world: string;
      city: string;
      mailed: number;
      failed: string[];
      unsent: string[];
    }
  /** Not one mail went out: the announcement is left open, and the next run tries again. */
  | {
      kind: 'not-sent';
      world: string;
      city: string;
      failed: string[];
      unsent: string[];
    };

/** What the command prints for an announcement: counts and ids, never an address. */
export function describeAnnouncement(done: Announcement): string[] {
  const where =
    done.kind === 'unknown' ? done.world : `${done.city} (${done.world})`;
  switch (done.kind) {
    case 'unknown':
      return [`No city has the world ${done.world}: nothing to announce.`];
    case 'not-built':
      return [
        `${where} is ${done.status}, not BUILT: run the seed first (npm run seed), then announce again.`,
      ];
    case 'announced-before':
      return [
        `${where} was announced on ${done.at.toISOString()}: nothing to send.`,
      ];
    case 'sent': {
      const missed = [...done.failed, ...done.unsent];
      if (!missed.length)
        return [`${where} is announced: ${done.mailed} mailed, 0 failed.`];
      return [
        `${where} is announced, but only partly: ${done.mailed} mailed, ${done.failed.length} failed` +
          (done.unsent.length
            ? `, ${done.unsent.length} not tried once the mail server failed.`
            : '.'),
        `Not mailed (donor ids): ${missed.join(', ')}`,
        'It counts as announced: a later run will not mail them.',
      ];
    }
    case 'not-sent':
      return [
        `${where}: nothing was sent (${done.failed.length} failed` +
          (done.unsent.length
            ? `, ${done.unsent.length} not tried once the mail server failed).`
            : ').') +
          ' It is left unannounced: the next run tries again.',
        `Not mailed (donor ids): ${[...done.failed, ...done.unsent].join(', ')}`,
      ];
  }
}

/** True when an announcement left someone out, or sent nothing at all. */
export const fellShort = (done: Announcement): boolean =>
  done.kind === 'not-sent' ||
  (done.kind === 'sent' && done.failed.length + done.unsent.length > 0);

/** One donor's mail, ready to go. */
interface Letter {
  donorId: string;
  mail: Mail;
}

/**
 * Tells the donors of a city that it is built, once, right after its world is deployed
 * (`announce-cli.ts`, which `deploy/deploy.sh` runs). Each donor who gave to the city gets one
 * mail however many gifts they made, in the language of their latest; only donors with an
 * address are mailed, and only their own address.
 */
@Injectable()
export class AnnounceService {
  private readonly logger = new Logger(AnnounceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly benefactors: BenefactorsService,
  ) {}

  /**
   * Announces the city of a world. Everything is read and every mail written first; then the
   * announcement is claimed in one conditional update, so two runs at once cannot both send.
   * If nothing then goes out (every mail failed, or anything threw), the claim is released and
   * the next run tries again; once a mail has gone out it stays claimed, and a later run sends
   * nothing. A mail server that is away stops the sending at its first failure.
   */
  async announce(world: string): Promise<Announcement> {
    const cities = await this.prisma.city.findMany({
      where: { worldId: world },
      orderBy: { createdAt: 'asc' },
    });
    const city = cities.find((c) => c.status === 'BUILT') ?? cities[0];
    if (!city) return { kind: 'unknown', world };
    const named = { world, city: city.name };
    if (city.status !== 'BUILT')
      return { kind: 'not-built', ...named, status: city.status };
    if (city.builtAnnouncedAt)
      return { kind: 'announced-before', ...named, at: city.builtAnnouncedAt };

    const letters = await this.lettersFor(city, world);

    const claimedAt = new Date();
    const claimed = await this.prisma.city.updateMany({
      where: { id: city.id, status: 'BUILT', builtAnnouncedAt: null },
      data: { builtAnnouncedAt: claimedAt },
    });
    if (claimed.count !== 1) {
      // another run claimed it between the read and the update
      const after = await this.prisma.city.findUnique({
        where: { id: city.id },
        select: { builtAnnouncedAt: true },
      });
      return {
        kind: 'announced-before',
        ...named,
        at: after?.builtAnnouncedAt ?? claimedAt,
      };
    }

    let mailed = 0;
    const failed: string[] = [];
    const unsent: string[] = [];
    try {
      for (const [i, { donorId, mail }] of letters.entries()) {
        try {
          await this.mailer.send(mail);
          mailed++;
        } catch (error) {
          failed.push(donorId);
          // the donor's id, never their address
          this.logger.error(
            `The announcement of ${world} to donor ${donorId} was not sent: ${failureOf(error)}`,
          );
          if (isServerFailure(error)) {
            unsent.push(...letters.slice(i + 1).map((l) => l.donorId));
            break;
          }
        }
      }
    } catch (error) {
      await this.release(city.id, claimedAt);
      throw error;
    }
    if (mailed === 0 && failed.length > 0) {
      await this.release(city.id, claimedAt);
      return { kind: 'not-sent', ...named, failed, unsent };
    }
    return { kind: 'sent', ...named, mailed, failed, unsent };
  }

  /** Gives the announcement back, if it is still this run's: the next run will send it. */
  private async release(cityId: string, claimedAt: Date): Promise<void> {
    await this.prisma.city.updateMany({
      where: { id: cityId, builtAnnouncedAt: claimedAt },
      data: { builtAnnouncedAt: null },
    });
  }

  /** Every donor's mail about the city, one per donor with an address, oldest donor first. */
  private async lettersFor(
    city: { id: string; name: string; goalCents: number },
    world: string,
  ): Promise<Letter[]> {
    const gifts = await this.prisma.donation.findMany({
      where: { cityId: city.id, donorId: { not: null } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        donorId: true,
        locale: true,
        donor: { select: { email: true } },
      },
    });
    // the dollars, with names only where the list shows them: the same standing as the list
    const listed = await this.benefactors.giftsOf(city.id);
    const standing = cityStanding(listed, city.goalCents);
    const site = this.config.get('SITE_URL', { infer: true });

    // the language of each donor's latest gift (the gifts come oldest first)
    const donors = new Map<string, { email: string; locale: string | null }>();
    for (const gift of gifts)
      if (gift.donorId && gift.donor)
        donors.set(gift.donorId, {
          email: gift.donor.email,
          locale: gift.locale,
        });

    return [...donors].map(([donorId, { email, locale }]) => {
      const theirs = listed.filter((g) => g.donorId === donorId);
      const places = theirs.flatMap((g) => {
        const place = standing.places.get(g.id);
        return place ? [place] : [];
      });
      const numbers = places.flatMap((p) =>
        p.number === null ? [] : [p.number],
      );
      const mail = builtMail({
        locale: isLocale(locale) ? locale : 'en-US',
        site,
        world,
        city: city.name,
        founderNumber: numbers.length ? Math.min(...numbers) : null,
        firstStone: places.some((p) => p.firstStone),
        keystone: places.some((p) => p.keystone),
        givenCents: theirs.reduce((sum, g) => sum + g.amountCents, 0),
        stones: places.flatMap((p) => p.stones).sort((a, b) => a - b),
        named: theirs.some((g) => g.name !== null),
        founders: standing.founders.length,
        benefactors: standing.benefactors.length,
      });
      return { donorId, mail: { to: email, ...mail } };
    });
  }
}
