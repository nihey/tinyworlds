import type Stripe from 'stripe';
import { citySlug, cleanCityName } from '../cities/city-name.js';
import { isLocale, localeOfLang, type Locale } from './locales.js';

/** How every session of this app is marked. The Stripe account is shared with other products. */
export const APP_TAG = 'tinyworlds';

/** A world id as it appears in URLs: "tinynyc". */
export const WORLD_PATTERN = /^[a-z0-9]{3,20}$/;

/** What a paid Checkout session says about a donation. */
export interface DonationFacts {
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  amountCents: number;
  /** Lower case: "usd". */
  currency: string;
  /** The city the donor named, cleaned up; null when none. */
  cityName: string | null;
  citySlug: string | null;
  world: string | null;
  locale: Locale | null;
}

/**
 * Reads a Checkout session. Null unless it is a paid donation of this app.
 *
 * Sessions come from two places. The API's own (createDonationCheckout) carry the city, the
 * world and the locale in their metadata. The static payment links, which the site falls back
 * to, carry the city in a custom field called "city", the world as the client reference, and a
 * short language tag in `metadata.lang`.
 */
export function donationFacts(
  session: Stripe.Checkout.Session,
): DonationFacts | null {
  const metadata = session.metadata ?? {};
  if (metadata.app !== APP_TAG) return null;
  if (session.payment_status !== 'paid') return null;
  const amount = session.amount_total;
  if (
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  )
    return null;
  if (!session.currency) return null;

  const typed =
    metadata.city ??
    session.custom_fields?.find((field) => field.key === 'city')?.text?.value;
  const cityName = cleanCityName(typed);
  const slug = citySlug(cityName);

  const world = metadata.world ?? session.client_reference_id ?? '';
  const locale = isLocale(metadata.locale)
    ? metadata.locale
    : localeOfLang(metadata.lang);
  const intent = session.payment_intent;

  return {
    stripeSessionId: session.id,
    stripePaymentIntentId:
      typeof intent === 'string' ? intent : (intent?.id ?? null),
    amountCents: amount,
    currency: session.currency.toLowerCase(),
    cityName: slug ? cityName : null,
    citySlug: slug || null,
    world: WORLD_PATTERN.test(world) ? world : null,
    locale,
  };
}
