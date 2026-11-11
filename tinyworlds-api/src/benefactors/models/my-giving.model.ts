import { Field, Int, ObjectType } from '@nestjs/graphql';
import { CityStatus } from '../../generated/prisma/enums.js';

@ObjectType({
  description: "One city a donor gave to, and the donor's place in it",
})
export class MyCity {
  @Field()
  slug: string;

  @Field()
  name: string;

  @Field(() => CityStatus)
  status: CityStatus;

  @Field(() => String, { nullable: true })
  worldId: string | null;

  @Field(() => Int)
  goalCents: number;

  @Field(() => Int)
  raisedCents: number;

  @Field(() => Int, {
    description: "All the donor's gifts to this city, in US cents",
  })
  givenCents: number;

  @Field(() => Int, {
    nullable: true,
    description:
      'The founding number; null when none of the gifts is a founding one',
  })
  founderNumber: number | null;

  @Field(() => [Int], {
    description: 'The stones the donor laid, 1-based, sorted',
  })
  stones: number[];

  @Field(() => Boolean)
  firstStone: boolean;

  @Field(() => Boolean)
  keystone: boolean;

  @Field(() => Boolean, { description: 'Named for any gift to this city' })
  listed: boolean;
}

@ObjectType({ description: 'What the signed-in donor has given' })
export class MyGiving {
  @Field(() => String, { nullable: true })
  displayName: string | null;

  @Field(() => [MyCity], { description: 'By latest gift, newest first' })
  cities: MyCity[];

  @Field(() => Int, {
    description: 'Gifts to no city in particular, in US cents',
  })
  projectCents: number;
}
