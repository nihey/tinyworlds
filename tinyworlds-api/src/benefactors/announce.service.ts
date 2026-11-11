import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { failureOf } from '../auth/auth.service.js';
import type { Env } from '../config/env.js';
import { isLocale } from '../donations/locales.js';
import type { CityStatus } from '../generated/prisma/enums.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
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
  /** Its donors were mailed now; `failed` are the donors whose mail did not go out. */
  | {
      kind: 'sent';
      world: string;
      city: string;
      mailed: number;
      failed: string[];
    };

/** What the command prints for an announcement: counts and ids, never an address. */
export function describeAnnouncement(done: Announcement): string[] {
  switch (done.kind) {
    case 'unknown':
      return [`No city has the world ${done.world}: nothing to announce.`];
    case 'not-built':
      return [
        `${done.city} (${done.world}) is ${done.status}, not BUILT: run the seed first (npm run seed), then announce again.`,
      ];
    case 'announced-before':
      return [
        `${done.city} (${done.world}) was announced on ${done.at.toISOString()}: nothing to send.`,
      ];
    case 'sent':
      return [
        `${done.city} (${done.world}) is announced: ${done.mailed} mailed, ${done.failed.length} failed.`,
        ...(done.failed.length
          ? [`Not mailed (donor ids): ${done.failed.join(', ')}`]
          : []),
      ];
  }
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
   * Announces the city of a world. The announcement is claimed in one conditional update before
   * anything is sent, so two runs at once cannot both send, and a run after one that sent sends
   * nothing (not even to a donor whose mail failed: their ids are in the answer).
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

    const now = new Date();
    const claimed = await this.prisma.city.updateMany({
      where: { id: city.id, status: 'BUILT', builtAnnouncedAt: null },
      data: { builtAnnouncedAt: now },
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
        at: after?.builtAnnouncedAt ?? now,
      };
    }

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

    // one mail per donor, in the language of their latest gift (the gifts come oldest first)
    const donors = new Map<string, { email: string; locale: string | null }>();
    for (const gift of gifts)
      if (gift.donorId && gift.donor)
        donors.set(gift.donorId, {
          email: gift.donor.email,
          locale: gift.locale,
        });

    let mailed = 0;
    const failed: string[] = [];
    for (const [donorId, { email, locale }] of donors) {
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
      try {
        await this.mailer.send({ to: email, ...mail });
        mailed++;
      } catch (error) {
        failed.push(donorId);
        // the donor's id, never their address
        this.logger.error(
          `The announcement of ${world} to donor ${donorId} was not sent: ${failureOf(error)}`,
        );
      }
    }
    return { kind: 'sent', ...named, mailed, failed };
  }
}
