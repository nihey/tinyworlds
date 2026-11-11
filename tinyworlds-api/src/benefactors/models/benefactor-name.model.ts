import { Field, ID, ObjectType } from '@nestjs/graphql';
import { BenefactorLink } from '../../links/models/benefactor-link.model.js';

@ObjectType({
  description: 'A name donors asked to show, for admins to review',
})
export class BenefactorName {
  @Field(() => ID)
  donorId: string;

  @Field()
  name: string;

  @Field()
  hidden: boolean;

  @Field(() => [String])
  cities: string[];

  @Field()
  lastGiftAt: Date;

  @Field(() => [BenefactorLink], {
    description:
      "The donor's links, hidden or not, each with its picture: what there is to review",
  })
  links: BenefactorLink[];

  @Field()
  linksHidden: boolean;
}
