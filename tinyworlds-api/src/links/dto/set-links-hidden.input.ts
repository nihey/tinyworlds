import { Field, ID, InputType } from '@nestjs/graphql';
import { IsBoolean, IsUUID } from 'class-validator';

@InputType()
export class SetLinksHiddenInput {
  @Field(() => ID)
  @IsUUID()
  donorId: string;

  @Field(() => Boolean, {
    description: 'Whether the links are kept off the lists',
  })
  @IsBoolean()
  hidden: boolean;
}
