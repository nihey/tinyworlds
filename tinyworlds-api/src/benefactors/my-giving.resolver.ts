import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentDonor } from '../auth/current-donor.decorator.js';
import { ForDonors } from '../auth/for-donors.decorator.js';
import { BenefactorsService } from './benefactors.service.js';
import { SetDisplayNameInput } from './dto/set-display-name.input.js';
import { SetListingInput } from './dto/set-listing.input.js';
import { MyGiving } from './models/my-giving.model.js';

@ForDonors()
@Resolver()
export class MyGivingResolver {
  constructor(private readonly benefactors: BenefactorsService) {}

  @Query(() => MyGiving, { description: "The signed-in donor's own giving" })
  myGiving(@CurrentDonor() donor: { id: string }): Promise<MyGiving> {
    return this.benefactors.myGiving(donor.id);
  }

  @Mutation(() => Boolean, {
    description: 'Name the donor (or not) for all their gifts to a city',
  })
  async setListing(
    @CurrentDonor() donor: { id: string },
    @Args('input') input: SetListingInput,
  ): Promise<boolean> {
    await this.benefactors.setListing(donor.id, input.city, input.listed);
    return true;
  }

  @Mutation(() => String, {
    description: 'Saves the cleaned name and answers it',
  })
  setDisplayName(
    @CurrentDonor() donor: { id: string },
    @Args('input') input: SetDisplayNameInput,
  ): Promise<string> {
    return this.benefactors.setDisplayName(donor.id, input.name);
  }
}
