import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { CurrentDonor } from '../auth/current-donor.decorator.js';
import { ForDonors } from '../auth/for-donors.decorator.js';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard.js';
import { AddLinkInput } from './dto/add-link.input.js';
import { LinkIdInput } from './dto/link-id.input.js';
import { LinksService } from './links.service.js';
import { MyLink, MyLinks } from './models/benefactor-link.model.js';

/** Pages one address may have read in a minute: each is a few requests to someone else's server. */
export const READS_PER_MINUTE = 10;

/** The signed-in donor's own links. */
@ForDonors()
@Resolver()
export class LinksResolver {
  constructor(private readonly links: LinksService) {}

  @Query(() => MyLinks, {
    description: "The signed-in donor's links, and what decides what shows",
  })
  myLinks(@CurrentDonor() donor: { id: string }): Promise<MyLinks> {
    return this.links.mine(donor.id);
  }

  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: READS_PER_MINUTE, ttl: 60_000 } })
  @Mutation(() => MyLink, {
    description:
      'Saves a link to a public https page and reads what the page says of itself',
  })
  addLink(
    @CurrentDonor() donor: { id: string },
    @Args('input') input: AddLinkInput,
  ): Promise<MyLink> {
    return this.links.add(donor.id, input.url);
  }

  @Mutation(() => Boolean, {
    description: "Takes one of the donor's links away",
  })
  async removeLink(
    @CurrentDonor() donor: { id: string },
    @Args('input') input: LinkIdInput,
  ): Promise<boolean> {
    await this.links.remove(donor.id, input.id);
    return true;
  }

  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: READS_PER_MINUTE, ttl: 60_000 } })
  @Mutation(() => MyLink, {
    description: "Reads the page of one of the donor's links again",
  })
  refreshLink(
    @CurrentDonor() donor: { id: string },
    @Args('input') input: LinkIdInput,
  ): Promise<MyLink> {
    return this.links.refresh(donor.id, input.id);
  }
}
