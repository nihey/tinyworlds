import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'How many answers picked one name for a building' })
export class QuizPick {
  @Field({ description: 'The name picked, as a sight id' })
  choice: string;

  @Field(() => Int)
  count: number;
}

@ObjectType({ description: 'How everyone has answered one building' })
export class QuizTally {
  @Field(() => Int, {
    description: 'Answers to this building, one per visit',
  })
  answers: number;

  @Field(() => [QuizPick], {
    description:
      'Every name picked for it, the most picked first (then by sight id)',
  })
  picks: QuizPick[];
}
