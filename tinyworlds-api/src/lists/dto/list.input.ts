import { Field, InputType } from '@nestjs/graphql';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { LOCALES, type Locale } from '../../donations/locales.js';

@InputType()
export class ListInput {
  @Field(() => String, {
    nullable: true,
    description: 'The city, by its slug; omitted: every new city',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'The language of the mails (joining only); default en-US',
  })
  @IsOptional()
  @IsIn(LOCALES)
  locale?: Locale | null;
}
