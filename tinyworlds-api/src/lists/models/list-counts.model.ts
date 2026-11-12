import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CityWaiting {
  @Field()
  slug: string;

  @Field()
  name: string;

  @Field(() => Int)
  waiting: number;
}

@ObjectType({ description: 'How many people are on each list' })
export class ListCounts {
  @Field(() => Int)
  newCities: number;

  @Field(() => [CityWaiting], { description: 'Most waited for first' })
  cities: CityWaiting[];
}
