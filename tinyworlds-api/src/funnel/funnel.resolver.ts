import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard.js';
import { DonationFunnelInput } from './dto/donation-funnel.input.js';
import { TrackFunnelStepInput } from './dto/track-funnel-step.input.js';
import { FunnelService } from './funnel.service.js';
import { DonationFunnel } from './models/donation-funnel.model.js';

/** Steps one address may report per minute: a page reports one or two. */
export const STEPS_PER_MINUTE = 60;

@Resolver()
export class FunnelResolver {
  constructor(private readonly funnel: FunnelService) {}

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: STEPS_PER_MINUTE, ttl: 60_000 } })
  @Mutation(() => Boolean, {
    description:
      'Reports that a visit reached a step towards a donation. Says true; saying a step twice changes nothing.',
  })
  async trackFunnelStep(
    @Args('input') input: TrackFunnelStepInput,
  ): Promise<boolean> {
    await this.funnel.track(input);
    return true;
  }

  @Query(() => DonationFunnel, {
    description:
      'For admins: how many visits reached each step towards a donation over a period',
  })
  donationFunnel(
    @Args('input') input: DonationFunnelInput,
  ): Promise<DonationFunnel> {
    return this.funnel.report(input);
  }
}
