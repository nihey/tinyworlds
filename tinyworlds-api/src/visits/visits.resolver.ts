import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard.js';
import { TrackPresenceInput } from './dto/track-presence.input.js';
import { WorldVisitsInput } from './dto/world-visits.input.js';
import { WorldVisits } from './models/world-visits.model.js';
import { VisitsService } from './visits.service.js';

/** "Still here"s one address may say per minute: an open map says two. */
export const PRESENCE_PER_MINUTE = 120;

@Resolver(() => WorldVisits)
export class VisitsResolver {
  constructor(private readonly visits: VisitsService) {}

  @Public()
  @Query(() => [WorldVisits], {
    description:
      'Each world asked for, in that order: how many visits it has had, and how many are there now',
  })
  worldVisits(@Args('input') input: WorldVisitsInput): Promise<WorldVisits[]> {
    return this.visits.ofWorlds(input.worlds);
  }

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: PRESENCE_PER_MINUTE, ttl: 60_000 } })
  @Mutation(() => Boolean, {
    description:
      "Says a visit's map is still open and in view: the page says it every half minute. Says true.",
  })
  async trackPresence(
    @Args('input') input: TrackPresenceInput,
  ): Promise<boolean> {
    await this.visits.stillHere(input);
    return true;
  }
}
