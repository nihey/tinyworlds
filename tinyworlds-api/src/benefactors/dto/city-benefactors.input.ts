import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { WORLD_PATTERN } from '../../donations/donation-facts.js';

@InputType()
export class CityBenefactorsInput {
  @Field(() => String, {
    nullable: true,
    description: 'The city by its slug; give this or `world`, not both',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string | null;

  @Field(() => String, {
    nullable: true,
    description:
      'The city by the id of its map ("tinynyc"); give this or `slug`',
  })
  @IsOptional()
  @Matches(WORLD_PATTERN)
  world?: string | null;
}
