import { registerEnumType } from '@nestjs/graphql';
import {
  CityStatus,
  FunnelStep,
  QuizLevel,
} from '../generated/prisma/enums.js';

registerEnumType(CityStatus, {
  name: 'CityStatus',
  description:
    'PROPOSED until its goal is met, then FUNDED; BUILDING and BUILT are set by hand',
});

registerEnumType(FunnelStep, {
  name: 'FunnelStep',
  description:
    'A step of a visit towards a donation, in order; the last one, paying, is a donation itself',
});

registerEnumType(QuizLevel, {
  name: 'QuizLevel',
  description:
    "Guess the building's difficulty: each offers other wrong answers, so each is tallied apart",
});
