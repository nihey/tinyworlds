import { BadRequestException } from '@nestjs/common';
import { FakePrisma } from '../../test/fake-prisma.js';
import { MAX_PICKS, QuizService } from './quiz.service.js';

const VISIT = '0b0e7a52-6c1d-4f0a-9c55-2f1b8e3d4a10';
const OTHER = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const FLATIRON = 'b1uuogys';
const ONE_MADISON = 'b1abc';

function setup() {
  const prisma = new FakePrisma();
  return { prisma, service: new QuizService(prisma.asService()) };
}

describe('QuizService.answer', () => {
  it('records an answer and gives back the building tally, that answer included', async () => {
    const { service, prisma } = setup();
    const tally = await service.answer({
      visitId: VISIT,
      world: 'tinynyc',
      sightId: FLATIRON,
      choice: ONE_MADISON,
      locale: 'pt-BR',
    });
    expect(prisma.quizAnswers).toEqual([
      {
        visitId: VISIT,
        world: 'tinynyc',
        sightId: FLATIRON,
        choice: ONE_MADISON,
        locale: 'pt-BR',
      },
    ]);
    expect(tally).toEqual({
      answers: 1,
      picks: [{ choice: ONE_MADISON, count: 1 }],
    });
  });

  it('counts a visit once per building, however often it answers', async () => {
    const { service, prisma } = setup();
    const answer = { world: 'tinynyc', sightId: FLATIRON };
    await service.answer({ ...answer, visitId: VISIT, choice: ONE_MADISON });
    const again = await service.answer({
      ...answer,
      visitId: VISIT,
      choice: FLATIRON,
    });
    expect(again).toEqual({
      answers: 1,
      picks: [{ choice: ONE_MADISON, count: 1 }],
    });
    await service.answer({ ...answer, visitId: OTHER, choice: FLATIRON });
    await service.answer({
      visitId: VISIT,
      world: 'tinynyc',
      sightId: ONE_MADISON,
      choice: ONE_MADISON,
    });
    await service.answer({
      ...answer,
      world: 'tinylax',
      visitId: VISIT,
      choice: FLATIRON,
    });
    expect(prisma.quizAnswers).toHaveLength(4);
  });

  it('records nothing without a visit, and still gives the tally', async () => {
    const { service, prisma } = setup();
    await service.answer({
      visitId: VISIT,
      world: 'tinynyc',
      sightId: FLATIRON,
      choice: FLATIRON,
    });
    const tally = await service.answer({
      visitId: null,
      world: 'tinynyc',
      sightId: FLATIRON,
      choice: ONE_MADISON,
    });
    expect(prisma.quizAnswers).toHaveLength(1);
    expect(tally).toEqual({
      answers: 1,
      picks: [{ choice: FLATIRON, count: 1 }],
    });
  });
});

describe('QuizService.tally', () => {
  it('orders the picks by how many, then by name, over that building only', async () => {
    const { service } = setup();
    const visit = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const picks: [string, string, string][] = [
      ['tinynyc', FLATIRON, 'zz'],
      ['tinynyc', FLATIRON, FLATIRON],
      ['tinynyc', FLATIRON, FLATIRON],
      ['tinynyc', FLATIRON, 'aa'],
      ['tinynyc', ONE_MADISON, FLATIRON],
      ['tinylax', FLATIRON, FLATIRON],
    ];
    for (const [i, [world, sightId, choice]] of picks.entries())
      await service.answer({ visitId: visit(i), world, sightId, choice });
    expect(await service.tally('tinynyc', FLATIRON)).toEqual({
      answers: 4,
      picks: [
        { choice: FLATIRON, count: 2 },
        { choice: 'aa', count: 1 },
        { choice: 'zz', count: 1 },
      ],
    });
  });
});

describe('the tally, bounded', () => {
  const visit = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const offered = [FLATIRON, ONE_MADISON, 'b2', 'b3'];

  it('counts only the names the page offered, and everyone in answers', async () => {
    const { service } = setup();
    for (const [i, choice] of ['zz1', 'zz2', FLATIRON, ONE_MADISON].entries())
      await service.answer({
        visitId: visit(i),
        world: 'tinynyc',
        sightId: FLATIRON,
        choice,
      });
    const tally = await service.answer({
      visitId: visit(9),
      world: 'tinynyc',
      sightId: FLATIRON,
      choice: FLATIRON,
      choices: offered,
    });
    expect(tally).toEqual({
      answers: 5,
      picks: [
        { choice: FLATIRON, count: 2 },
        { choice: ONE_MADISON, count: 1 },
      ],
    });
  });

  it('refuses a pick, or a building, that is not among the names offered', async () => {
    const { service, prisma } = setup();
    const base = { visitId: visit(1), world: 'tinynyc', sightId: FLATIRON };
    await expect(
      service.answer({ ...base, choice: 'zz', choices: offered }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.answer({
        ...base,
        choice: 'b2',
        choices: ['b2', 'b3', 'b4', 'b5'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.quizAnswers).toHaveLength(0);
  });

  it('gives at most the most picked names when the page does not say which it offered', async () => {
    const { service } = setup();
    for (let i = 0; i < MAX_PICKS + 5; i++)
      await service.answer({
        visitId: visit(i),
        world: 'tinynyc',
        sightId: FLATIRON,
        choice: i < 3 ? FLATIRON : `zz${i}`,
      });
    const tally = await service.tally('tinynyc', FLATIRON);
    expect(tally.answers).toBe(MAX_PICKS + 5);
    expect(tally.picks).toHaveLength(MAX_PICKS);
    expect(tally.picks[0]).toEqual({ choice: FLATIRON, count: 3 });
  });
});
