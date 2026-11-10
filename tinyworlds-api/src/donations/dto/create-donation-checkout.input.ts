import { Field, InputType, Int } from '@nestjs/graphql';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CITY_NAME_MAX } from '../../cities/city-name.js';
import { WORLD_PATTERN } from '../donation-facts.js';
import { LOCALES } from '../locales.js';

/** The least and the most one donation may be, in US cents: US$1 to US$10,000. */
export const AMOUNT_MIN_CENTS = 100;
export const AMOUNT_MAX_CENTS = 1_000_000;

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

  @Field(() => Int, {
    nullable: true,
    description:
      "What to give, in US cents: a whole number from 100 to 1000000. Leave out to choose the amount on Stripe's page.",
  })
  @IsOptional()
  @IsInt({ message: 'amountCents must be a whole number of US cents' })
  @Min(AMOUNT_MIN_CENTS, {
    message: `amountCents must be at least ${AMOUNT_MIN_CENTS} (US$1)`,
  })
  @Max(AMOUNT_MAX_CENTS, {
    message: `amountCents must be at most ${AMOUNT_MAX_CENTS} (US$10,000)`,
  })
  amountCents?: number | null;

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
