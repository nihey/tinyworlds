import { UseGuards } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard.js';
import { BenefactorsService } from './benefactors.service.js';
import { CityBenefactorsInput } from './dto/city-benefactors.input.js';
import { CityBenefactors } from './models/city-benefactors.model.js';
import { WallBenefactor } from './models/wall.model.js';

@Resolver(() => CityBenefactors)
export class BenefactorsResolver {
  constructor(private readonly benefactors: BenefactorsService) {}

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Query(() => CityBenefactors, {
    nullable: true,
    description:
      "A city's stones, founders and benefactors, by slug or by world; null for an unknown or hidden city",
  })
  cityBenefactors(
    @Args('input') input: CityBenefactorsInput,
  ): Promise<CityBenefactors | null> {
    return this.benefactors.cityBenefactors(input);
  }

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Query(() => [WallBenefactor], {
    description:
      'Everyone who gave to a city, largest first: named donors with their links, unnamed gifts as "anonymous" (at most 200)',
  })
  benefactorWall(): Promise<WallBenefactor[]> {
    return this.benefactors.wall();
  }
}
