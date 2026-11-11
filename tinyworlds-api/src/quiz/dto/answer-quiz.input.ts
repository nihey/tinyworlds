import { Field, ID, InputType } from '@nestjs/graphql';
import { QuizLevel } from '../../generated/prisma/enums.js';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { WORLD_PATTERN } from '../../donations/donation-facts.js';
import { LOCALES } from '../../donations/locales.js';

/** A sight's id in a world's sights.json: "b19j7udl", "bridge:brooklyn bridge", "statue:0". */
export const SIGHT_ID_PATTERN = /^[a-z0-9][a-z0-9 :._-]{0,79}$/;

@InputType()
export class AnswerQuizInput {
  @Field(() => ID, {
    nullable: true,
    description:
      "The visit (the funnel's: a UUID the page makes up for its tab). Without it nothing is recorded and the tally is answered all the same.",
  })
  @IsOptional()
  @IsUUID()
  visitId?: string | null;

  @Field({ description: "The world the building is in: a world's id" })
  @Matches(WORLD_PATTERN)
  world: string;

  @Field({ description: 'The building asked about: a sight id' })
  @Matches(SIGHT_ID_PATTERN)
  sightId: string;

  @Field({
    description:
      'The name picked, as a sight id: right when it is the building itself',
  })
  @Matches(SIGHT_ID_PATTERN)
  choice: string;

  @Field(() => [String], {
    nullable: true,
    description:
      'The names the page offered, as sight ids (up to four, the building and the pick among them): the tally counts only these. Without them it gives the most picked.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @Matches(SIGHT_ID_PATTERN, { each: true })
  choices?: string[] | null;

  @Field(() => QuizLevel, {
    nullable: true,
    description:
      "The game's difficulty; HARD when left out (pages from before difficulties)",
  })
  @IsOptional()
  @IsEnum(QuizLevel)
  level?: QuizLevel | null;

  @Field(() => String, {
    nullable: true,
    description: 'The interface language: en-US, pt-BR or es-ES',
  })
  @IsOptional()
  @IsIn(LOCALES)
  locale?: string | null;
}
