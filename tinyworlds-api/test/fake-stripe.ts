import Stripe from 'stripe';
import type { StripeClient } from '../src/donations/stripe.provider.js';

/** Placeholders: nothing in the tests talks to Stripe. */
export const TEST_SECRET_KEY = 'sk_test_example';
export const TEST_WEBHOOK_SECRET = 'whsec_example';

/** Records what the API asked Stripe for, and answers with a made-up checkout page. */
export class FakeStripe implements StripeClient {
  calls: Stripe.Checkout.SessionCreateParams[] = [];
  /** The price ids whose product was asked for, in order. */
  priceLookups: string[] = [];
  /** Set to make the next call fail the way a Stripe outage does. */
  failWith: Error | null = null;

  /** "price_en" belongs to "prod_en": enough to tell the languages apart. */
  prices = {
    retrieve: (id: string): Promise<{ product: string }> => {
      if (this.failWith) return Promise.reject(this.failWith);
      this.priceLookups.push(id);
      return Promise.resolve({ product: id.replace(/^price_/, 'prod_') });
    },
  };

  checkout = {
    sessions: {
      create: (
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<{ url: string | null }> => {
        if (this.failWith) return Promise.reject(this.failWith);
        this.calls.push(params);
        return Promise.resolve({
          url: `https://checkout.stripe.test/c/pay/cs_test_${this.calls.length}`,
        });
      },
    },
  };
}

export interface SessionOptions {
  id?: string;
  amount?: number;
  currency?: string;
  paymentStatus?: string;
  metadata?: Record<string, string>;
  /** As typed into a payment link's "city" field. */
  cityField?: string;
  clientReferenceId?: string | null;
}

/** A Checkout session the way Stripe reports it, cut down to what the API reads. */
export function checkoutSession(
  options: SessionOptions = {},
): Stripe.Checkout.Session {
  return {
    id: options.id ?? 'cs_test_1',
    object: 'checkout.session',
    amount_total: options.amount ?? 500,
    currency: options.currency ?? 'usd',
    payment_status: options.paymentStatus ?? 'paid',
    payment_intent: 'pi_test_1',
    client_reference_id: options.clientReferenceId ?? null,
    metadata: options.metadata ?? { app: 'tinyworlds' },
    custom_fields:
      options.cityField === undefined
        ? []
        : [
            {
              key: 'city',
              type: 'text',
              optional: true,
              label: { type: 'custom', custom: 'City' },
              text: {
                value: options.cityField,
                maximum_length: 80,
                minimum_length: null,
              },
            },
          ],
  } as unknown as Stripe.Checkout.Session;
}

/** The body and signature header of a webhook delivery, signed with the test secret. */
export function signedEvent(
  session: Stripe.Checkout.Session,
  type = 'checkout.session.completed',
  secret = TEST_WEBHOOK_SECRET,
): { body: Buffer; signature: string } {
  const payload = JSON.stringify({
    id: `evt_${session.id}`,
    object: 'event',
    type,
    data: { object: session },
  });
  const signature = new Stripe(
    TEST_SECRET_KEY,
  ).webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return { body: Buffer.from(payload), signature };
}
