import { Field, InputType } from '@nestjs/graphql';
import { IsString, MaxLength } from 'class-validator';

@InputType()
export class SetDisplayNameInput {
  // cleaned (and refused when nothing is left) in the service; the cap only bounds the work
  @Field(() => String)
  @IsString()
  @MaxLength(400)
  name: string;
}
