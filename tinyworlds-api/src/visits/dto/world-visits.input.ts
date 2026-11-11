import { Field, InputType } from '@nestjs/graphql';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, Matches } from 'class-validator';
import { WORLD_PATTERN } from '../../donations/donation-facts.js';

/** How many worlds one question may name: the site has a dozen. */
export const MAX_WORLDS = 50;

@InputType()
export class WorldVisitsInput {
  @Field(() => [String], {
    description: `The worlds' ids ("tinynyc"), at most ${MAX_WORLDS}; answered in this order`,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_WORLDS)
  @Matches(WORLD_PATTERN, { each: true })
  worlds: string[];
}
