import { Field, ID, InputType } from '@nestjs/graphql';
import { IsBoolean, IsUUID } from 'class-validator';

@InputType()
export class SetNameHiddenInput {
  @Field(() => ID)
  @IsUUID()
  donorId: string;

  @Field(() => Boolean, {
    description: 'Whether the name is kept off the lists',
  })
  @IsBoolean()
  hidden: boolean;
}
