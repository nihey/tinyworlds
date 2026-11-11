import { Field, Int, ObjectType } from '@nestjs/graphql';
import { BenefactorLink } from '../../links/models/benefactor-link.model.js';

@ObjectType({ description: 'A city someone on the wall gave to' })
export class WallCity {
  @Field()
  slug: string;

  @Field()
  name: string;

  @Field(() => String, {
    nullable: true,
    description: 'The id of its map once it is built ("tinynyc")',
  })
  worldId: string | null;
}

@ObjectType({
  description:
    'One entry of the wall of everyone who gave to a city: a named donor, or one unnamed gift',
})
export class WallBenefactor {
  @Field(() => String, {
    nullable: true,
    description: 'The public name; null for an unnamed gift ("anonymous")',
  })
  name: string | null;

  @Field(() => Int, {
    description:
      'A named donor: everything they are named for, in US cents; an unnamed gift: its own amount',
  })
  amountCents: number;

  @Field(() => [WallCity], {
    description:
      'Where they gave, the city they gave most to first; one city for an unnamed gift',
  })
  cities: WallCity[];

  @Field(() => [BenefactorLink], {
    description: "A named donor's links; none for an unnamed gift",
  })
  links: BenefactorLink[];

  @Field()
  lastGiftAt: Date;
}
