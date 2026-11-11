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
import { cleanDisplayName } from '../benefactors/display-name.js';
import type { Env } from '../config/env.js';
import { failureOf } from '../auth/auth.service.js';
import { FunnelService } from '../funnel/funnel.service.js';
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
export const COUNTED_CURRENCY = 'usd';

const isUniqueViolation = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === 'P2002';

/** Donations: starting one at Stripe, and recording the ones Stripe says were paid. */
@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);

  /**
   * The Stripe product behind each language's price, asked for once and kept: a donation of a
   * set amount is a one-off price on that product, so the checkout page still names it in the
   * donor's language.
   */
  private readonly products = new Map<Locale, Promise<string>>();

  constructor(
    @Inject(STRIPE) private readonly stripe: StripeClient,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly funnel: FunnelService,
  ) {}

  private productOf(locale: Locale): Promise<string> {
    let known = this.products.get(locale);
    if (!known) {
      const priceId = this.config.get(LOCALE_FACTS[locale].price, {
        infer: true,
      });
      known = this.stripe.prices.retrieve(priceId).then(({ product }) => {
        const id = typeof product === 'string' ? product : product?.id;
        if (!id) throw new Error(`Price ${priceId} has no product`);
        return id;
      });
      this.products.set(locale, known);
      // a failed lookup is not remembered: the next donation asks again
      known.catch(() => this.products.delete(locale));
    }
    return known;
  }

  /**
   * Opens a Stripe Checkout for a donation and answers its URL. The amount is the one the donor
   * chose on the site; without one it is chosen on Stripe's page (the price is
   * pay-what-you-want). The city, if any, travels in the metadata and comes back through the
   * webhook; so does the visit, which is also noted as having reached the checkout.
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
    const amountCents = input.amountCents ?? null;
    const benefactorName =
      input.benefactorName == null
        ? null
        : cleanDisplayName(input.benefactorName);
    if (input.benefactorName != null && benefactorName === null)
      throw new BadRequestException('benefactorName needs a letter or a digit');
    const visitId = input.visitId?.toLowerCase() ?? null;
    const metadata: Record<string, string> = {
      app: APP_TAG,
      world: input.world,
      locale,
      ...(city ? { city } : {}),
      ...(city && benefactorName ? { benefactor_name: benefactorName } : {}),
      ...(amountCents !== null ? { amount_cents: String(amountCents) } : {}),
      ...(visitId ? { visit_id: visitId } : {}),
    };

    let url: string | null;
    try {
      const lineItem: Stripe.Checkout.SessionCreateParams.LineItem =
        amountCents !== null
          ? {
              quantity: 1,
              price_data: {
                currency: COUNTED_CURRENCY,
                unit_amount: amountCents,
                product: await this.productOf(locale),
              },
            }
          : {
              price: this.config.get(facts.price, { infer: true }),
              quantity: 1,
            };
      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [lineItem],
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
    if (visitId)
      // the funnel's own step; it must never stand between a donor and the checkout
      await this.funnel
        .track({
          visitId,
          step: 'CHECKOUT_STARTED',
          world: input.world,
          locale,
          city: city || null,
          amountCents,
        })
        .catch((error: unknown) =>
          this.logger.warn(
            `A checkout's funnel step was not recorded: ${(error as Error).message}`,
          ),
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
    let current = facts;
    for (let attempt = 0; ; attempt++) {
      try {
        const recorded = await this.insert(current);
        if (recorded)
          this.logger.log(
            `Donation ${facts.stripeSessionId}: ${facts.amountCents} ${facts.currency}` +
              (facts.citySlug ? ` for ${facts.citySlug}` : ''),
          );
        return;
      } catch (error) {
        if (!isUniqueViolation(error)) {
          // The donor or the listing must never cost a donation: record it unlisted, without a
          // donor, and let the backfill give it one later. Never log the address.
          if (current.email || current.benefactorName) {
            this.logger.error(
              `Donation ${facts.stripeSessionId}: the donor step failed (${failureOf(error)}); recording it unlisted`,
            );
            current = { ...current, email: null, benefactorName: null };
            continue;
          }
          throw error;
        }
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

      let donor: { id: string; displayName: string | null } | null = null;
      if (facts.email) {
        donor = await tx.donor.upsert({
          where: { email: facts.email },
          create: { email: facts.email, displayName: facts.benefactorName },
          update: {},
          select: { id: true, displayName: true },
        });
        // only the first name delivered sticks, even when two arrive at once
        if (facts.benefactorName && donor.displayName === null)
          await tx.donor.updateMany({
            where: { id: donor.id, displayName: null },
            data: { displayName: facts.benefactorName },
          });
      }

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
          visitId: facts.visitId,
          donorId: donor?.id ?? null,
          listed:
            facts.benefactorName !== null && city !== null && donor !== null,
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
