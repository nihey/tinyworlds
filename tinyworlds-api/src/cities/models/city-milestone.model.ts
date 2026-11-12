import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { CityStatus } from '../../generated/prisma/enums.js';

@ObjectType({
  description: 'A city and how far it is from the donations that get it built',
})
export class CityMilestone {
  @Field(() => ID)
  id: string;

  @Field({ description: 'The name without accents, case or punctuation' })
  slug: string;

  @Field()
  name: string;

  @Field(() => Int, { description: 'US cents donated toward this city' })
  raisedCents: number;

  @Field(() => Int, { description: 'US cents it takes to get it built' })
  goalCents: number;

  @Field(() => Int, { description: 'How many donations named this city' })
  donations: number;

  @Field(() => Int, {
    description:
      'How many people gave to it: a donor once, however many gifts; a gift with no address as one',
  })
  benefactorCount: number;

  @Field(() => CityStatus)
  status: CityStatus;

  @Field(() => String, {
    nullable: true,
    description: 'The id of its map once it is built, e.g. "tinynyc"',
  })
  worldId: string | null;
}
