import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { Env } from '../config/env.js';

export const STRIPE = Symbol('STRIPE');

/** The part of the Stripe client the API uses; tests fake exactly this. */
export interface StripeClient {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<Pick<Stripe.Checkout.Session, 'url'>>;
    };
  };
  prices: {
    retrieve(id: string): Promise<Pick<Stripe.Price, 'product'>>;
  };
}

/**
 * How long one call to Stripe may take. Under the five seconds the site waits before it falls
 * back to its static payment link, so the API has always answered by then.
 */
export const STRIPE_TIMEOUT_MS = 4500;

export const stripeProvider: Provider = {
  provide: STRIPE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): StripeClient =>
    // fail fast, and only once: when Stripe is slow the site falls back to its static payment
    // link, and a retry would outlast the site's patience
    new Stripe(config.get('STRIPE_SECRET_KEY', { infer: true }), {
      timeout: STRIPE_TIMEOUT_MS,
      maxNetworkRetries: 0,
    }),
};
