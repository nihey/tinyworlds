import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { CurrentDonor } from '../auth/current-donor.decorator.js';
import { ForDonors } from '../auth/for-donors.decorator.js';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard.js';
import { ListInput } from './dto/list.input.js';
import { listKeyOf } from './list-key.js';
import { ListsService } from './lists.service.js';
import { MyLists } from './models/my-lists.model.js';

/** Joins one address may make per minute. */
export const JOINS_PER_MINUTE = 20;

@ForDonors()
@Resolver()
export class ListsResolver {
  constructor(private readonly lists: ListsService) {}

  @Query(() => MyLists, { description: 'The lists the signed-in donor is on' })
  myLists(@CurrentDonor() donor: { id: string }): Promise<MyLists> {
    return this.lists.mine(donor.id);
  }

  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: JOINS_PER_MINUTE, ttl: 60_000 } })
  @Mutation(() => MyLists, {
    description: 'Joins a list to hear when a city is built (once)',
  })
  joinList(
    @CurrentDonor() donor: { id: string },
    @Args('input') input: ListInput,
  ): Promise<MyLists> {
    return this.lists.join(
      donor.id,
      listKeyOf(input.city),
      input.locale ?? 'en-US',
    );
  }

  @Mutation(() => MyLists, { description: 'Leaves a list' })
  leaveList(
    @CurrentDonor() donor: { id: string },
    @Args('input') input: ListInput,
  ): Promise<MyLists> {
    return this.lists.leave(donor.id, listKeyOf(input.city));
  }
}
