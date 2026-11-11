import { Field, ID, InputType } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@InputType({ description: "One of the donor's own links, by its id" })
export class LinkIdInput {
  @Field(() => ID)
  @IsUUID()
  id: string;
}
