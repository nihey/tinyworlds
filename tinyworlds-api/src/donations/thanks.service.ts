import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { failureOf } from '../auth/auth.service.js';
import { BenefactorsService } from '../benefactors/benefactors.service.js';
import type { Env } from '../config/env.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VisitsService } from '../visits/visits.service.js';
import { COUNTED_CURRENCY } from './currency.js';
import { isLocale } from './locales.js';
import { placeOfGift } from './thanks-facts.js';
import { thanksMail, type ThanksFacts } from './thanks-mail.js';

/**
 * The thank-you a donor gets once Stripe has confirmed their gift, to the address Stripe gave,
 * in the language they gave in. What it says comes from the same standing as the public list
 * (`cityStanding`), and the visits from the same counts as the front page's cards.
 */
@Injectable()
export class ThanksService {
  private readonly logger = new Logger(ThanksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly benefactors: BenefactorsService,
    private readonly visits: VisitsService,
  ) {}

  /**
   * Thanks the donor of a donation just recorded. Never throws: a donation is never undone, nor
   * held up, by its mail. A failure is logged by the donation's id, never by an address. True
   * when a mail went out.
   */
  async send(donationId: string): Promise<boolean> {
    try {
      const found = await this.factsOf(donationId);
      if (!found) return false;
      await this.mailer.send({ to: found.to, ...thanksMail(found.facts) });
      return true;
    } catch (error) {
      this.logger.error(
        `The thank-you for donation ${donationId} was not sent: ${failureOf(error)}`,
      );
      return false;
    }
  }

  /** Who to thank for a donation, and what to tell them; null when it has no donor to thank. */
  private async factsOf(
    donationId: string,
  ): Promise<{ to: string; facts: ThanksFacts } | null> {
    const gift = await this.prisma.donation.findUnique({
      where: { id: donationId },
      select: {
        id: true,
        amountCents: true,
        currency: true,
        locale: true,
        donorId: true,
        listed: true,
        donor: {
          select: { email: true, displayName: true, nameHidden: true },
        },
        city: {
          select: {
            id: true,
            name: true,
            status: true,
            worldId: true,
            goalCents: true,
          },
        },
      },
    });
    if (!gift?.donor || !gift.donorId) return null;
    const { city } = gift;

    const worlds = await this.prisma.city.findMany({
      where: { worldId: { not: null } },
      select: { worldId: true },
    });
    const totalVisits = await this.visits.totalOf(
      worlds.flatMap((c) => (c.worldId ? [c.worldId] : [])),
    );
    const worldVisits = city?.worldId
      ? ((await this.visits.ofWorlds([city.worldId]))[0]?.visits ?? 0)
      : null;
    const place =
      city && gift.currency === COUNTED_CURRENCY
        ? placeOfGift(
            await this.benefactors.giftsOf(city.id),
            city.goalCents,
            gift.id,
            gift.donorId,
          )
        : null;

    return {
      to: gift.donor.email,
      facts: {
        locale: isLocale(gift.locale) ? gift.locale : 'en-US',
        site: this.config.get('SITE_URL', { infer: true }),
        amountCents: gift.amountCents,
        inDollars: gift.currency === COUNTED_CURRENCY,
        city: city && {
          name: city.name,
          status: city.status,
          worldVisits,
          place,
        },
        totalVisits,
        nameHidden:
          gift.listed && !!gift.donor.displayName && gift.donor.nameHidden,
      },
    };
  }
}
