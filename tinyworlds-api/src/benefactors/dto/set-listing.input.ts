import { Field, InputType } from '@nestjs/graphql';
import { IsBoolean, IsString, MaxLength } from 'class-validator';

@InputType()
export class SetListingInput {
  @Field(() => String, { description: 'The city, by its slug' })
  @IsString()
  @MaxLength(100)
  city: string;

  @Field(() => Boolean, {
    description: 'Whether the donor is named for their gifts to this city',
  })
  @IsBoolean()
  listed: boolean;
}
