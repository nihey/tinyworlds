import { Field, Int, ObjectType } from '@nestjs/graphql';
import { CityStatus } from '../../generated/prisma/enums.js';

@ObjectType({ description: 'A city whose list the donor is on' })
export class ListCity {
  @Field()
  slug: string;

  @Field()
  name: string;

  @Field(() => CityStatus)
  status: CityStatus;

  @Field(() => Int)
  raisedCents: number;

  @Field(() => Int)
  goalCents: number;

  @Field(() => Int, { description: 'How many people are on its list' })
  waiting: number;
}

@ObjectType({ description: 'The lists a donor is on' })
export class MyLists {
  @Field({ description: 'On the list of every new city' })
  newCities: boolean;

  @Field(() => [ListCity])
  cities: ListCity[];

  @Field(() => [String], {
    description:
      'Slugs of the unbuilt cities the donor gave to: they are told without a list',
  })
  donated: string[];
}
