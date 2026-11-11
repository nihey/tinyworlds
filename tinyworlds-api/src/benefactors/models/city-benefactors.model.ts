import { Field, Int, ObjectType } from '@nestjs/graphql';
import { CityStatus } from '../../generated/prisma/enums.js';
import { BenefactorLink } from '../../links/models/benefactor-link.model.js';

@ObjectType({
  description:
    'A founder of a city: the gifts that laid its stones, as one row',
})
export class FounderRow {
  @Field(() => Int, { description: 'The founding number, from 1' })
  number: number;

  @Field(() => String, {
    nullable: true,
    description: 'The public name; null when the founder is not named',
  })
  name: string | null;

  @Field(() => Int)
  amountCents: number;

  @Field(() => Int, { description: 'How many stones these gifts laid' })
  stones: number;

  @Field(() => Boolean, { description: 'Laid the first stone' })
  firstStone: boolean;

  @Field(() => Boolean, { description: 'Laid the last stone' })
  keystone: boolean;

  @Field(() => [BenefactorLink], {
    description:
      "The named founder's links (at most three); none for one who is not named",
  })
  links: BenefactorLink[];
}

@ObjectType({ description: 'A benefactor: gave once the city had its goal' })
export class BenefactorRow {
  @Field(() => Int, { description: 'By amount given, from 1' })
  rank: number;

  @Field(() => String, { nullable: true })
  name: string | null;

  @Field(() => Int)
  amountCents: number;

  @Field(() => [BenefactorLink], {
    description: "The named benefactor's links; none for one who is not named",
  })
  links: BenefactorLink[];
}

@ObjectType({ description: "A city's stones, founders and benefactors" })
export class CityBenefactors {
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

  @Field(() => [Int], {
    nullable: 'items',
    description:
      'For each stone, the number of the founder who laid it; null while it is not laid',
  })
  stones: (number | null)[];

  @Field(() => [FounderRow])
  founders: FounderRow[];

  @Field(() => [BenefactorRow])
  benefactors: BenefactorRow[];
}
