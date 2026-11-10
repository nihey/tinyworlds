import { Field, InputType } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { CITY_NAME_MAX } from '../../cities/city-name.js';
import { WORLD_PATTERN } from '../donation-facts.js';
import { LOCALES } from '../locales.js';

@InputType()
export class CreateDonationCheckoutInput {
  @Field(() => String, {
    nullable: true,
    description:
      'The city the donation is for: one from the list or a new one. Leave out for none in particular.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(CITY_NAME_MAX)
  city?: string | null;

  @Field({ description: 'The map the donor is on, e.g. "tinynyc"' })
  @Matches(WORLD_PATTERN)
  world: string;

  @Field({ description: 'The interface language: en-US, pt-BR or es-ES' })
  @IsIn(LOCALES)
  locale: string;

  @Field({
    description:
      'The page to come back to, without query or hash; "?donated=1" (or 0 on cancel) is added',
  })
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(300)
  returnUrl: string;
}
