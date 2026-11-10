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
}

export const stripeProvider: Provider = {
  provide: STRIPE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): StripeClient =>
    // fail fast: when Stripe is slow the site falls back to its static payment link
    new Stripe(config.get('STRIPE_SECRET_KEY', { infer: true }), {
      timeout: 8000,
      maxNetworkRetries: 1,
    }),
};
