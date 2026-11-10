import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { citySlug, cleanCityName } from '../cities/city-name.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  APP_TAG,
  donationFacts,
  type DonationFacts,
} from './donation-facts.js';
import type { CreateDonationCheckoutInput } from './dto/create-donation-checkout.input.js';
import { LOCALE_FACTS, type Locale } from './locales.js';
import { acceptReturnUrl } from './return-url.js';
import { STRIPE, type StripeClient } from './stripe.provider.js';

/** The checkout events that can mean "this donation is paid". */
const PAID_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

/** Only US dollars fill a city's bar: the goal is in dollars. */
const COUNTED_CURRENCY = 'usd';

const isUniqueViolation = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === 'P2002';

/** Donations: starting one at Stripe, and recording the ones Stripe says were paid. */
@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);

  constructor(
    @Inject(STRIPE) private readonly stripe: StripeClient,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Opens a Stripe Checkout for a donation and answers its URL. The donor picks the amount on
   * Stripe's page (the price is pay-what-you-want); the city, if any, travels in the metadata
   * and comes back through the webhook.
   */
  async createCheckout(input: CreateDonationCheckoutInput): Promise<string> {
    const returnUrl = acceptReturnUrl(
      input.returnUrl,
      this.config.get('ALLOWED_ORIGINS', { infer: true }),
    );
    if (!returnUrl)
      throw new BadRequestException('returnUrl is not a page of this site');

    const locale = input.locale as Locale;
    const facts = LOCALE_FACTS[locale];
    const typed = cleanCityName(input.city);
    // a name with no letter or digit in it names no city
    const city = citySlug(typed) ? typed : '';
    const metadata: Record<string, string> = {
      app: APP_TAG,
      world: input.world,
      locale,
      ...(city ? { city } : {}),
    };

    let url: string | null;
    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          { price: this.config.get(facts.price, { infer: true }), quantity: 1 },
        ],
        submit_type: 'donate',
        locale: facts.stripe,
        success_url: `${returnUrl}?donated=1`,
        cancel_url: `${returnUrl}?donated=0`,
        metadata,
        payment_intent_data: {
          description: city
            ? `Tiny Worlds donation — ${city}`
            : 'Tiny Worlds donation',
          metadata,
        },
        ...(city
          ? { custom_text: { submit: { message: facts.countsToward(city) } } }
          : {}),
      });
      url = session.url;
    } catch (error) {
      this.logger.error(
        `Stripe refused a checkout: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        "Couldn't start the checkout. Try again.",
        { cause: error },
      );
    }
    if (!url)
      throw new ServiceUnavailableException(
        "Couldn't start the checkout. Try again.",
      );
    return url;
  }

  /**
   * A webhook from Stripe, checked against its signature (400 otherwise). Paid checkouts of
   * this app are recorded; everything else on the shared account is acknowledged and ignored.
   */
  async handleWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<void> {
    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(
        rawBody ?? Buffer.alloc(0),
        signature ?? '',
        this.config.get('STRIPE_WEBHOOK_SECRET', { infer: true }),
      );
    } catch (error) {
      throw new BadRequestException('Invalid signature', { cause: error });
    }
    if (!PAID_EVENTS.has(event.type)) return;
    const facts = donationFacts(event.data.object as Stripe.Checkout.Session);
    if (facts) await this.record(facts);
  }

  /**
   * Records a paid donation once, however often Stripe reports it, and moves its city's bar
   * in the same transaction: the city is found by slug or created, dollars are added to what
   * it has raised, and a PROPOSED city that reaches its goal becomes FUNDED.
   */
  async record(facts: DonationFacts): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        const recorded = await this.insert(facts);
        if (recorded)
          this.logger.log(
            `Donation ${facts.stripeSessionId}: ${facts.amountCents} ${facts.currency}` +
              (facts.citySlug ? ` for ${facts.citySlug}` : ''),
          );
        return;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Lost a race. Either the same event arrived twice at once (the donation is there
        // now: done), or two donors named the same new city at the same moment (try again:
        // the city exists this time).
        const existing = await this.prisma.donation.findUnique({
          where: { stripeSessionId: facts.stripeSessionId },
          select: { id: true },
        });
        if (existing) return;
        if (attempt >= 2) throw error;
      }
    }
  }

  /** False when the donation was already there. */
  private insert(facts: DonationFacts): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const seen = await tx.donation.findUnique({
        where: { stripeSessionId: facts.stripeSessionId },
        select: { id: true },
      });
      if (seen) return false;

      const city =
        facts.citySlug && facts.cityName
          ? await tx.city.upsert({
              where: { slug: facts.citySlug },
              create: {
                slug: facts.citySlug,
                name: facts.cityName,
                goalCents: this.config.get('CITY_GOAL_CENTS', { infer: true }),
              },
              update: {},
              select: { id: true },
            })
          : null;

      await tx.donation.create({
        data: {
          stripeSessionId: facts.stripeSessionId,
          stripePaymentIntentId: facts.stripePaymentIntentId,
          amountCents: facts.amountCents,
          currency: facts.currency,
          cityId: city?.id ?? null,
          cityText: facts.cityName,
          world: facts.world,
          locale: facts.locale,
        },
      });

      if (city && facts.currency === COUNTED_CURRENCY) {
        const after = await tx.city.update({
          where: { id: city.id },
          data: {
            raisedCents: { increment: facts.amountCents },
            donationCount: { increment: 1 },
          },
          select: { status: true, raisedCents: true, goalCents: true },
        });
        if (after.status === 'PROPOSED' && after.raisedCents >= after.goalCents)
          await tx.city.update({
            where: { id: city.id },
            data: { status: 'FUNDED' },
          });
      }
      return true;
    });
  }
}
