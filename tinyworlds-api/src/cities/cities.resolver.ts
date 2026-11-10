import { Query, Resolver } from '@nestjs/graphql';
import { CitiesService } from './cities.service.js';
import { CityMilestone } from './models/city-milestone.model.js';

@Resolver(() => CityMilestone)
export class CitiesResolver {
  constructor(private readonly cities: CitiesService) {}

  @Query(() => [CityMilestone], {
    description:
      'Cities people can fund and the ones already built: most raised first, built ones last',
  })
  cityMilestones(): Promise<CityMilestone[]> {
    return this.cities.milestones();
  }
}
