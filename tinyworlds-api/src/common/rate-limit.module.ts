import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

/** Checkout sessions one address may start per minute: each one is a call to Stripe. */
export const CHECKOUTS_PER_MINUTE = 10;

/**
 * Per-IP limits. Nothing is throttled globally: a route opts in with GqlThrottlerGuard (the
 * createDonationCheckout mutation does).
 */
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: CHECKOUTS_PER_MINUTE },
      ],
    }),
  ],
})
export class RateLimitModule {}
