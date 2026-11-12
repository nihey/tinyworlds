import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FakeMailer } from '../../test/fake-mailer.js';
import { FakePrisma } from '../../test/fake-prisma.js';
import type { Env } from '../config/env.js';
import { leaveToken } from './leave-token.js';
import { ListsService } from './lists.service.js';
import type { MailSight, SightsCatalog } from './sights-catalog.js';

const DORA = 'd0000000-0000-4000-8000-000000000001';
const EVA = 'd0000000-0000-4000-8000-000000000002';
const SECRET = 'a secret';

function setup() {
  const prisma = new FakePrisma();
  const config = {
    get: (key: string) =>
      ({ JWT_SECRET: SECRET, SITE_URL: 'https://example.com' })[key],
  } as unknown as ConfigService<Env, true>;
  const mailer = new FakeMailer();
  const pickAcross = vi.fn(
    (worlds: string[]): Promise<{ sights: MailSight[]; unread: string[] }> =>
      Promise.resolve({
        sights: worlds.map((world) => ({
          world,
          id: `${world}-1`,
          name: `Building of ${world}`,
          text: 'A famous one.',
          mapUrl: `https://example.com/${world}/`,
          picture: null,
        })),
        unread: [],
      }),
  );
  const catalog = { pickAcross } as unknown as SightsCatalog;
  const service = new ListsService(prisma.asService(), config, mailer, catalog);
  for (const id of [DORA, EVA])
    prisma.donors.push({
      id,
      email: `${id.slice(-1)}@example.com`,
      displayName: null,
    });
  const lisbon = prisma.seedCity({ slug: 'lisbon', name: 'Lisbon' });
  const rome = prisma.seedCity({ slug: 'rome', name: 'Rome' });
  return { prisma, service, lisbon, rome, mailer, pickAcross };
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

  describe('the welcome mail', () => {
    it("the first join sends one welcome, after answering, in the join's language", async () => {
      const s = setup();
      s.prisma.seedCity({
        slug: 'paris',
        name: 'Paris',
        status: 'BUILT',
        worldId: 'tinypar',
      });
      await s.service.join(DORA, { kind: 'city', slug: 'lisbon' }, 'pt-BR');
      // answered first: nothing has gone out yet
      expect(s.mailer.attempts).toBe(0);
      await vi.waitFor(() => expect(s.mailer.sent).toHaveLength(1));
      const [mail] = s.mailer.sent;
      expect(mail.to).toBe('1@example.com');
      expect(mail.subject).toBe('Você está na lista de Lisbon');
      expect(mail.headers?.['List-Unsubscribe']).toContain(
        '/api/lists/unsubscribe?t=',
      );
      expect(mail.text).toContain('/lists/leave/#t=');
      expect(s.pickAcross).toHaveBeenCalledWith(['tinypar'], 'pt-BR', 3);
      expect(s.prisma.donors[0].welcomedAt).toBeInstanceOf(Date);
    });

    it('a second join sends none', async () => {
      const s = setup();
      await join(s, DORA, 'lisbon');
      await vi.waitFor(() => expect(s.mailer.sent).toHaveLength(1));
      await join(s, DORA, 'lisbon');
      await join(s, DORA, 'rome');
      await join(s, DORA);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(s.mailer.attempts).toBe(1);
      expect(s.prisma.listMembers).toHaveLength(3);
    });

    it('a failed welcome leaves the membership and lets the next join try again', async () => {
      const s = setup();
      s.mailer.failWith = new Error('smtp down');
      await join(s, DORA, 'lisbon');
      await vi.waitFor(() => expect(s.mailer.attempts).toBe(1));
      await vi.waitFor(() => expect(s.prisma.donors[0].welcomedAt).toBeNull());
      expect(s.prisma.listMembers).toHaveLength(1);
      s.mailer.failWith = null;
      await join(s, DORA, 'rome');
      await vi.waitFor(() => expect(s.mailer.sent).toHaveLength(1));
      expect(s.mailer.sent[0].subject).toBe("You're on the list for Rome");
    });

    it("the welcome's buildings come from built, shown worlds", async () => {
      const s = setup();
      for (const [slug, over] of [
        ['a', { status: 'BUILT', worldId: 'tinya' }],
        ['b', { status: 'BUILT', worldId: 'tinyb', hidden: true }],
        ['c', { status: 'BUILDING', worldId: 'tinyc' }],
        ['d', { status: 'BUILT', worldId: null }],
      ] as const)
        s.prisma.seedCity({ slug, name: slug, ...over });
      await join(s, DORA);
      await vi.waitFor(() => expect(s.mailer.sent).toHaveLength(1));
      expect(s.pickAcross).toHaveBeenCalledWith(['tinya'], 'en-US', 3);
      expect(s.mailer.sent[0].subject).toBe(
        "You're on the list for new cities",
      );
    });
  });

  it('describes a list that can be joined, and nothing else', async () => {
    const s = setup();
    s.prisma.seedCity({ slug: 'paris', name: 'Paris', status: 'BUILT' });
    s.prisma.seedCity({ slug: 'secret', name: 'Secret', hidden: true });
    expect(await s.service.describe('lisbon')).toEqual({
      kind: 'city',
      name: 'Lisbon',
    });
    expect(await s.service.describe('*')).toEqual({ kind: 'new' });
    expect(await s.service.describe('')).toEqual({ kind: 'new' });
    for (const raw of ['paris', 'secret', 'nowhere'])
      expect(await s.service.describe(raw)).toBeNull();
  });

  it('joinAfterSignIn joins, skips what describe refuses, and never throws', async () => {
    const s = setup();
    s.prisma.seedCity({ slug: 'paris', name: 'Paris', status: 'BUILT' });
    await s.service.joinAfterSignIn(DORA, 'lisbon', 'pt-BR');
    await s.service.joinAfterSignIn(DORA, 'paris', 'en-US');
    await s.service.joinAfterSignIn(DORA, 'nowhere', 'en-US');
    expect(s.prisma.listMembers).toHaveLength(1);
    expect(s.prisma.listMembers[0]).toMatchObject({
      donorId: DORA,
      cityId: s.lisbon.id,
      locale: 'pt-BR',
    });
    vi.spyOn(s.service, 'join').mockRejectedValue(new Error('down'));
    await expect(
      s.service.joinAfterSignIn(EVA, '*', 'en-US'),
    ).resolves.toBeUndefined();
  });
});
