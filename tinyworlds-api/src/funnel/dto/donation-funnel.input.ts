import { Field, InputType } from '@nestjs/graphql';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';

@InputType()
export class DonationFunnelInput {
  @Field(() => Date, { description: 'The start of the period (included)' })
  @IsDate()
  from: Date;

  @Field(() => Date, {
    description:
      'The end of the period (excluded); at most 366 days after the start',
  })
  @IsDate()
  to: Date;

  @Field(() => String, {
    nullable: true,
    description:
      'The time zone days are counted in, as an IANA name ("America/Sao_Paulo"); UTC when left out',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string | null;
}
