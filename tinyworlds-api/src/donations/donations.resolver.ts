import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard.js';
import { DonationsService } from './donations.service.js';
import { CreateDonationCheckoutInput } from './dto/create-donation-checkout.input.js';
import { DonationCheckout } from './models/donation-checkout.model.js';

@Resolver()
export class DonationsResolver {
  constructor(private readonly donations: DonationsService) {}

  @UseGuards(GqlThrottlerGuard)
  @Mutation(() => DonationCheckout, {
    description:
      'Starts a donation at Stripe (the amount is chosen there, from US$1) and answers the page to send the donor to',
  })
  async createDonationCheckout(
    @Args('input') input: CreateDonationCheckoutInput,
  ): Promise<DonationCheckout> {
    return { url: await this.donations.createCheckout(input) };
  }
}
