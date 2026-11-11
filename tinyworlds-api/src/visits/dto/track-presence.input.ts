import { Field, ID, InputType } from '@nestjs/graphql';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { WORLD_PATTERN } from '../../donations/donation-facts.js';
import { LOCALES } from '../../donations/locales.js';

@InputType()
export class TrackPresenceInput {
  @Field(() => ID, {
    description:
      "The visit: the same UUID the page's funnel steps carry. It names no person and is gone with the tab's session.",
  })
  @IsUUID()
  visitId: string;

  @Field({ description: 'The world whose map is open: "tinynyc"' })
  @Matches(WORLD_PATTERN)
  world: string;

  @Field(() => String, {
    nullable: true,
    description: 'The interface language: en-US, pt-BR or es-ES',
  })
  @IsOptional()
  @IsIn(LOCALES)
  locale?: string | null;
}
