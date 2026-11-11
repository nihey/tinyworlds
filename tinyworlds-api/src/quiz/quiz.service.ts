import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { QuizTally } from './models/quiz-tally.model.js';

/** One answer, as the site reports it. */
export interface QuizAnswerFacts {
  visitId?: string | null;
  world: string;
  sightId: string;
  choice: string;
  locale?: string | null;
}

/**
 * "Guess the building": the answers, one per visit and building, and each building's tally.
 * The questions are the site's own files; the right name is the building itself, so nothing
 * here needs to know them.
 */
@Injectable()
export class QuizService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records the answer (once per visit and building; none without a visit) and tallies the building. */
  async answer(facts: QuizAnswerFacts): Promise<QuizTally> {
    if (facts.visitId)
      await this.prisma.quizAnswer.createMany({
        data: [
          {
            visitId: facts.visitId,
            world: facts.world,
            sightId: facts.sightId,
            choice: facts.choice,
            locale: facts.locale ?? null,
          },
        ],
        skipDuplicates: true,
      });
    return this.tally(facts.world, facts.sightId);
  }

  /** Every name picked for a building, the most picked first, then by sight id. */
  async tally(world: string, sightId: string): Promise<QuizTally> {
    const rows = await this.prisma.quizAnswer.groupBy({
      by: ['choice'],
      where: { world, sightId },
      _count: { _all: true },
    });
    const picks = rows
      .map((row) => ({ choice: row.choice, count: row._count._all }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          (a.choice < b.choice ? -1 : a.choice > b.choice ? 1 : 0),
      );
    return { answers: picks.reduce((sum, p) => sum + p.count, 0), picks };
  }
}
