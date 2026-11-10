import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Someone signed in to the admin pages' })
export class Admin {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;
}
