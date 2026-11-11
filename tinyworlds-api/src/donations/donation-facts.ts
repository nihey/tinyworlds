import type Stripe from 'stripe';
import { citySlug, cleanCityName } from '../cities/city-name.js';
import { cleanDisplayName } from '../benefactors/display-name.js';
import { isLocale, localeOfLang, type Locale } from './locales.js';

/** How every session of this app is marked. The Stripe account is shared with other products. */
export const APP_TAG = 'tinyworlds';

/** A visit's id: a UUID, as browsers make them. */
const VISIT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  /** The visit the checkout was started from, when the site said. */
  visitId: string | null;
  /** The donor's address as Stripe collected it: lower case; null when missing or unusable. */
  email: string | null;
  /** The name the donor asked to be listed under, cleaned; null when none. */
  benefactorName: string | null;
}

/** The longest address there can be. */
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The donor's email from a Checkout session: trimmed, lower case; null if missing or not one. */
export function donorEmailOf(session: Stripe.Checkout.Session): string | null {
  const raw = session.customer_details?.email;
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= EMAIL_MAX && EMAIL_PATTERN.test(email) ? email : null;
}

/**
 * Reads a Checkout session. Null unless it is a paid donation of this app.
 *
 * Sessions come from two places. The API's own (createDonationCheckout) carry the city, the
 * world, the locale and the visit in their metadata. The static payment links, which the site falls back
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
    visitId: VISIT_PATTERN.test(metadata.visit_id ?? '')
      ? metadata.visit_id.toLowerCase()
      : null,
    email: donorEmailOf(session),
    benefactorName: cleanDisplayName(metadata.benefactor_name),
  };
}
