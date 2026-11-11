import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({
  description: 'How many visits a world has had, and how many are there now',
})
export class WorldVisits {
  @Field({ description: 'The world\'s id: "tinynyc"' })
  world: string;

  @Field(() => Int, {
    description:
      'Every visit it has had: one per browser tab, the history from the page analytics included',
  })
  visits: number;

  @Field(() => Int, {
    description:
      'Visits whose map said it was open (and in view) in the last 75 seconds',
  })
  live: number;
}
