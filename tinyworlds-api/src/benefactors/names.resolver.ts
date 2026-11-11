import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BenefactorsService } from './benefactors.service.js';
import { SetNameHiddenInput } from './dto/set-name-hidden.input.js';
import { BenefactorName } from './models/benefactor-name.model.js';

/** Admins only (the global guard's default): who is named, and the means to hide a name. */
@Resolver()
export class NamesResolver {
  constructor(private readonly benefactors: BenefactorsService) {}

  @Query(() => [BenefactorName], {
    description:
      'Donors with a name and a listed gift, newest gift first (at most 100)',
  })
  benefactorNames(): Promise<BenefactorName[]> {
    return this.benefactors.benefactorNames();
  }

  @Mutation(() => Boolean, {
    description: "Hides (or shows again) a donor's name everywhere",
  })
  async setNameHidden(
    @Args('input') input: SetNameHiddenInput,
  ): Promise<boolean> {
    await this.benefactors.setNameHidden(input.donorId, input.hidden);
    return true;
  }
}
