import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEnum, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { WORLD_PATTERN } from '../../donations/donation-facts.js';
import { LOCALES } from '../../donations/locales.js';
import { FunnelStep } from '../../generated/prisma/enums.js';

@InputType()
export class TrackFunnelStepInput {
  @Field(() => ID, {
    description:
      "The visit: a UUID the page makes up for its tab. It names no person and is gone with the tab's session.",
  })
  @IsUUID()
  visitId: string;

  @Field(() => FunnelStep)
  @IsEnum(FunnelStep)
  step: FunnelStep;

  @Field({
    description:
      'Where it happened: a world\'s id, or "home" for the front page',
  })
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
