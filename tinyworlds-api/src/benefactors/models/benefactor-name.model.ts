import { Field, ID, ObjectType } from '@nestjs/graphql';

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
}
