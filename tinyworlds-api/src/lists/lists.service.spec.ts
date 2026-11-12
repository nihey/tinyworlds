import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FakePrisma } from '../../test/fake-prisma.js';
import type { Env } from '../config/env.js';
import { leaveToken } from './leave-token.js';
import { ListsService } from './lists.service.js';

const DORA = 'd0000000-0000-4000-8000-000000000001';
const EVA = 'd0000000-0000-4000-8000-000000000002';
const SECRET = 'a secret';

function setup() {
  const prisma = new FakePrisma();
  const config = {
    get: (key: string) =>
      ({ JWT_SECRET: SECRET, SITE_URL: 'https://example.com' })[key],
  } as unknown as ConfigService<Env, true>;
  const service = new ListsService(prisma.asService(), config);
  const lisbon = prisma.seedCity({ slug: 'lisbon', name: 'Lisbon' });
  const rome = prisma.seedCity({ slug: 'rome', name: 'Rome' });
  return { prisma, service, lisbon, rome };
}

const join = (s: ReturnType<typeof setup>, donor: string, slug?: string) =>
  s.service.join(
    donor,
    slug ? { kind: 'city', slug } : { kind: 'new' },
    'en-US',
  );

describe('ListsService', () => {
  it('joins a city still being funded, once', async () => {
    const s = setup();
    await join(s, DORA, 'lisbon');
    const again = await join(s, DORA, 'lisbon');
    expect(s.prisma.listMembers).toHaveLength(1);
    expect(again.cities.map((c) => c.slug)).toEqual(['lisbon']);
    expect((await s.service.mine(DORA)).cities[0]).toMatchObject({
      slug: 'lisbon',
      waiting: 1,
      goalCents: 10_000,
    });
  });

  it('joins new cities', async () => {
    const s = setup();
    expect((await s.service.mine(DORA)).newCities).toBe(false);
    const mine = await join(s, DORA);
    expect(mine.newCities).toBe(true);
    expect(mine.cities).toEqual([]);
    expect(s.prisma.listMembers).toHaveLength(1);
  });

  it('refuses a built, hidden or unknown city', async () => {
    const s = setup();
    s.prisma.seedCity({ slug: 'paris', name: 'Paris', status: 'BUILT' });
    s.prisma.seedCity({ slug: 'oslo', name: 'Oslo', hidden: true });
    for (const slug of ['paris', 'oslo', 'nowhere'])
      await expect(join(s, DORA, slug)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    expect(s.prisma.listMembers).toHaveLength(0);
  });

  it('leaves', async () => {
    const s = setup();
    await join(s, DORA, 'lisbon');
    await join(s, DORA);
    const left = await s.service.leave(DORA, { kind: 'city', slug: 'lisbon' });
    expect(left.cities).toEqual([]);
    expect(left.newCities).toBe(true);
    await s.service.leave(DORA, { kind: 'city', slug: 'lisbon' });
    await s.service.leave(DORA, { kind: 'city', slug: 'nowhere' });
    expect((await s.service.leave(DORA, { kind: 'new' })).newCities).toBe(
      false,
    );
    expect(s.prisma.listMembers).toHaveLength(0);
  });

  it('lists the unbuilt cities the donor gave to in donated', async () => {
    const s = setup();
    const paris = s.prisma.seedCity({
      slug: 'paris',
      name: 'Paris',
      status: 'BUILT',
    });
    for (const city of [s.rome, s.lisbon, paris])
      s.prisma.donations.push({
        id: `don-${city.slug}`,
        donorId: DORA,
        cityId: city.id,
      } as (typeof s.prisma.donations)[number]);
    expect((await s.service.mine(DORA)).donated).toEqual(['lisbon', 'rome']);
    expect((await s.service.mine(EVA)).donated).toEqual([]);
  });

  it('leaveWithToken leaves that list and answers true; with all, every list', async () => {
    const s = setup();
    await join(s, DORA, 'lisbon');
    await join(s, DORA, 'rome');
    await join(s, DORA);
    const token = (list: string) => leaveToken(SECRET, DORA, list);
    expect(await s.service.leaveWithToken(token(s.lisbon.id), false)).toBe(
      true,
    );
    expect(s.prisma.listMembers.map((m) => m.cityId)).toEqual([
      s.rome.id,
      null,
    ]);
    expect(await s.service.leaveWithToken(token('*'), false)).toBe(true);
    expect(s.prisma.listMembers.map((m) => m.cityId)).toEqual([s.rome.id]);
    await join(s, DORA, 'lisbon');
    expect(await s.service.leaveWithToken(token(s.rome.id), true)).toBe(true);
    expect(s.prisma.listMembers).toHaveLength(0);
  });

  it('leaveWithToken answers true a second time and false for a bad token, changing nothing', async () => {
    const s = setup();
    await join(s, DORA, 'lisbon');
    await join(s, EVA, 'lisbon');
    const token = leaveToken(SECRET, DORA, s.lisbon.id);
    expect(await s.service.leaveWithToken(token, false)).toBe(true);
    expect(await s.service.leaveWithToken(token, false)).toBe(true);
    expect(s.prisma.listMembers.map((m) => m.donorId)).toEqual([EVA]);
    const forged = leaveToken('not the secret', EVA, s.lisbon.id);
    expect(await s.service.leaveWithToken(forged, true)).toBe(false);
    expect(await s.service.leaveWithToken('', false)).toBe(false);
    expect(s.prisma.listMembers).toHaveLength(1);
  });

  it("waitingByCity counts each city's members and leaves new cities out", async () => {
    const s = setup();
    await join(s, DORA, 'lisbon');
    await join(s, EVA, 'lisbon');
    await join(s, EVA, 'rome');
    await join(s, EVA);
    const waiting = await s.service.waitingByCity();
    expect(waiting).toEqual(
      new Map([
        [s.lisbon.id, 2],
        [s.rome.id, 1],
      ]),
    );
  });

  it('counts are most first, then by name, with new cities apart', async () => {
    const s = setup();
    const athens = s.prisma.seedCity({ slug: 'athens', name: 'Athens' });
    s.prisma.seedCity({ slug: 'quiet', name: 'Quiet' });
    await join(s, DORA, 'rome');
    await join(s, DORA, 'athens');
    await join(s, DORA, 'lisbon');
    await join(s, EVA, 'lisbon');
    await join(s, EVA);
    expect(athens.slug).toBe('athens');
    expect(await s.service.counts()).toEqual({
      newCities: 1,
      cities: [
        { slug: 'lisbon', name: 'Lisbon', waiting: 2 },
        { slug: 'athens', name: 'Athens', waiting: 1 },
        { slug: 'rome', name: 'Rome', waiting: 1 },
      ],
    });
  });

  it('makes leave links that read back', () => {
    const s = setup();
    const { leaveUrl, unsubscribeUrl } = s.service.leaveUrls(DORA, '*');
    const token = leaveToken(SECRET, DORA, '*');
    expect(leaveUrl).toBe(`https://example.com/lists/leave/#t=${token}`);
    expect(unsubscribeUrl).toBe(
      `https://example.com/api/lists/unsubscribe?t=${token}`,
    );
  });
});
