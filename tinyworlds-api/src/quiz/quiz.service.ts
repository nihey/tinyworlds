import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { QuizTally } from './models/quiz-tally.model.js';

/** One answer, as the site reports it. */
export interface QuizAnswerFacts {
  visitId?: string | null;
  world: string;
  sightId: string;
  choice: string;
  locale?: string | null;
  /** the names the page offered (sight ids): the tally counts only these */
  choices?: string[] | null;
}

/** The most picked names a tally gives when the page does not say which it offered. */
export const MAX_PICKS = 20;

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
    const offered = facts.choices ?? null;
    if (
      offered &&
      (!offered.includes(facts.choice) || !offered.includes(facts.sightId))
    )
      throw new BadRequestException(
        'The pick and the building must be among the names offered',
      );
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
    return this.tally(facts.world, facts.sightId, offered);
  }

  /**
   * How a building has been answered: everyone who answered it, and the names picked, the most
   * picked first, then by sight id. Only the names offered, when the page says which (so what
   * comes back stays small whatever anyone sends), else the `MAX_PICKS` most picked.
   */
  async tally(
    world: string,
    sightId: string,
    choices?: string[] | null,
  ): Promise<QuizTally> {
    const where = { world, sightId };
    const [answers, rows] = await Promise.all([
      this.prisma.quizAnswer.count({ where }),
      choices
        ? this.prisma.quizAnswer.groupBy({
            by: ['choice'],
            where: { ...where, choice: { in: choices } },
            _count: { _all: true },
          })
        : this.prisma.quizAnswer.groupBy({
            by: ['choice'],
            where,
            _count: { _all: true },
            orderBy: [{ _count: { choice: 'desc' } }, { choice: 'asc' }],
            take: MAX_PICKS,
          }),
    ]);
    const picks = rows
      .map((row) => ({ choice: row.choice, count: row._count._all }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          (a.choice < b.choice ? -1 : a.choice > b.choice ? 1 : 0),
      );
    return { answers, picks };
  }
}
