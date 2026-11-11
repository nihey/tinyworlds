import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard.js';
import { AnswerQuizInput } from './dto/answer-quiz.input.js';
import { QuizTally } from './models/quiz-tally.model.js';
import { QuizService } from './quiz.service.js';

/** Answers one address may send per minute: a round takes a person several seconds. */
export const ANSWERS_PER_MINUTE = 30;

@Resolver()
export class QuizResolver {
  constructor(private readonly quiz: QuizService) {}

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Throttle({ default: { limit: ANSWERS_PER_MINUTE, ttl: 60_000 } })
  @Mutation(() => QuizTally, {
    description:
      'Records which name a visit picked for a building in "Guess the building" (once per visit and building) and answers how everyone has answered it.',
  })
  answerQuiz(@Args('input') input: AnswerQuizInput): Promise<QuizTally> {
    return this.quiz.answer(input);
  }
}
