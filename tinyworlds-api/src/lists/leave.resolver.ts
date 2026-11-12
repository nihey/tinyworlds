import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard.js';
import { LeaveListWithTokenInput } from './dto/leave-list-with-token.input.js';
import { ListsService } from './lists.service.js';

/** Leaves one address may make per minute. */
export const LEAVES_PER_MINUTE = 30;

@Resolver()
export class LeaveResolver {
  constructor(private readonly lists: ListsService) {}

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: LEAVES_PER_MINUTE, ttl: 60_000 } })
  @Mutation(() => Boolean, {
    description:
      "Leaves the list a mail's link is for (or all of them). True for any link of ours, even used twice; false for one that is not.",
  })
  leaveListWithToken(
    @Args('input') input: LeaveListWithTokenInput,
  ): Promise<boolean> {
    return this.lists.leaveWithToken(input.token, input.all === true);
  }
}
