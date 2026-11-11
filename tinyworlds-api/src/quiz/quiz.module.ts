import { Module } from '@nestjs/common';
import { QuizResolver } from './quiz.resolver.js';
import { QuizService } from './quiz.service.js';

@Module({
  providers: [QuizService, QuizResolver],
})
export class QuizModule {}
