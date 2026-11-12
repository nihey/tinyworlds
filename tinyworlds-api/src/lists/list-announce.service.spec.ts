import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FakeMailer } from '../../test/fake-mailer.js';
import {
  type CityRow,
  type DonationRow,
  FakePrisma,
} from '../../test/fake-prisma.js';
import type { Env } from '../config/env.js';
import type { Locale } from '../donations/locales.js';
import type { Mail } from '../mail/mailer.js';
import { leaveToken } from './leave-token.js';
import {
  describeListAnnouncement,
  ListAnnounceService,
  type ListAnnouncement,
  listsFellShort,
} from './list-announce.service.js';
import { type MailSight, SightsCatalog } from './sights-catalog.js';

const SITE = 'https://example.com';
const SECRET = 'a secret';

const ANA = 'd0000000-0000-4000-8000-00000000000a';
const BO = 'd0000000-0000-4000-8000-00000000000b';
const CY = 'd0000000-0000-4000-8000-00000000000c';
const DORA = 'd0000000-0000-4000-8000-00000000000d';
const EVA = 'd0000000-0000-4000-8000-00000000000e';
const ADDRESS: Record<string, string> = {
  [ANA]: 'ana@example.com',
  [BO]: 'bo@example.com',
  [CY]: 'cy@example.com',
  [DORA]: 'dora@example.com',
  [EVA]: 'eva@example.com',
};

/** When the memberships of these tests were made: well before any run. */
const JOINED = Date.UTC(2026, 10, 1);

const sightOf = (world: string, locale: Locale, n: number): MailSight => ({
  world,
  id: `${world}-${n}`,
  name: `${world} building ${n} (${locale})`,
  text: 'A famous one.',
  mapUrl: `${SITE}/${world}/#38.8,-104.8,1`,
  picture: {
    src: `${SITE}/api/sight-pictures/${world}/h${n}.png`,
    width: 90,
    height: 100,
  },
});

const config = {
  get: (key: string) => ({ JWT_SECRET: SECRET, SITE_URL: SITE })[key],
} as unknown as ConfigService<Env, true>;

/** `catalog`: a real one in place of the stand-in, for a test about what the site's files say. */
function setup(options: { catalog?: SightsCatalog } = {}) {
  const prisma = new FakePrisma();
  const mailer = new FakeMailer();
  /** Worlds whose files the site cannot give. */
  const unread = new Set<string>();
  const pickIn = vi.fn(
    (
      world: string,
      locale: Locale,
      count: number,
    ): Promise<{ sights: MailSight[]; unread: boolean; quiz: boolean }> => {
      if (unread.has(world))
        return Promise.resolve({ sights: [], unread: true, quiz: false });
      // the imagined world has no lit buildings and no quiz
      const imagined = world === 'tinywinterfell';
      return Promise.resolve({
        sights: imagined
          ? []
          : Array.from({ length: count }, (_, i) =>
              sightOf(world, locale, i + 1),
            ),
        unread: false,
        quiz: !imagined,
      });
    },
  );
  const catalog = options.catalog ?? ({ pickIn } as unknown as SightsCatalog);
  const service = new ListAnnounceService(
    prisma.asService(),
    config,
    mailer,
    catalog,
  );
  for (const [id, email] of Object.entries(ADDRESS))
    prisma.donors.push({ id, email, displayName: null });
  const built = (slug: string, name: string, worldId: string) =>
    prisma.seedCity({ slug, name, status: 'BUILT', worldId });
  const lisbon = built('lisbon', 'Lisbon', 'tinylis');
  const rome = built('rome', 'Rome', 'tinyrom');
  const winterfell = built('winterfell', 'Winterfell', 'tinywinterfell');
  const oslo = prisma.seedCity({ slug: 'oslo', name: 'Oslo' });
  return {
    prisma,
    mailer,
    pickIn,
    unread,
    service,
    lisbon,
    rome,
    winterfell,
    oslo,
  };
}

type Setup = ReturnType<typeof setup>;

/** A membership: a city's list, or new cities (null), made `at` minutes after JOINED (or then). */
function member(
  s: Setup,
  donorId: string,
  city: CityRow | null,
  locale: Locale,
  at: number | Date,
): void {
  s.prisma.listMembers.push({
    id: `${donorId.slice(-1)}-${city?.slug ?? 'new'}`,
    donorId,
    cityId: city?.id ?? null,
    locale,
    createdAt: at instanceof Date ? at : new Date(JOINED + at * 60_000),
  });
}

const mailTo = (s: Setup, donorId: string): Mail[] =>
  s.mailer.sent.filter((mail) => mail.to === ADDRESS[donorId]);

const only = (s: Setup, donorId: string): Mail => {
  const mails = mailTo(s, donorId);
  expect(mails).toHaveLength(1);
  return mails[0];
};

const leaveLink = (donorId: string, list: string) =>
  `${SITE}/lists/leave/#t=${leaveToken(SECRET, donorId, list)}`;

const city = (s: Setup, slug: string) =>
  s.prisma.cities.find((c) => c.slug === slug)!;

/** A mail server that does not answer, as nodemailer reports it. */
const away = () =>
  Object.assign(new Error('Connection timeout'), { code: 'ECONNECTION' });

/** The mail server's answer to the recipient, as nodemailer reports it: 4xx for now, 5xx for good. */
const refusedWith = (responseCode: number) =>
  Object.assign(new Error("Can't send mail - all recipients were rejected"), {
    code: 'EENVELOPE',
    command: 'RCPT TO',
    responseCode,
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ListAnnounceService', () => {
  it("mails each member of the city's list once, in their language, with three of its buildings", async () => {
    const s = setup();
    member(s, ANA, s.lisbon, 'pt-BR', 1);
    member(s, BO, s.lisbon, 'en-US', 2);
    member(s, CY, s.lisbon, 'en-US', 3);
    // someone waiting for another city hears nothing
    member(s, DORA, s.oslo, 'en-US', 4);

    const done = await s.service.announce(['tinylis']);
    expect(done).toEqual({
      cities: [
        {
          world: 'tinylis',
          city: 'Lisbon',
          mailed: 3,
          failed: [],
          unsent: [],
          refused: [],
          closed: true,
        },
      ],
      unread: [],
    });
    expect(s.mailer.sent.map((mail) => mail.to)).toEqual([
      'ana@example.com',
      'bo@example.com',
      'cy@example.com',
    ]);

    const ana = only(s, ANA);
    expect(ana.subject).toBe('Lisbon já está no mapa. Venha ver');
    for (const n of [1, 2, 3])
      expect(ana.html).toContain(`tinylis building ${n} (pt-BR)`);
    expect(ana.html).toContain(`${SITE}/tinylis/og/tinylis.jpg`);
    expect(ana.text).toContain(leaveLink(ANA, s.lisbon.id));
    expect(ana.headers?.['List-Unsubscribe']).toBe(
      `<${SITE}/api/lists/unsubscribe?t=${leaveToken(SECRET, ANA, s.lisbon.id)}>`,
    );
    const bo = only(s, BO);
    expect(bo.subject).toBe('Lisbon is built. Come and see it');
    expect(bo.html).toContain('tinylis building 3 (en-US)');
    expect(bo.html).toContain('Play Guess the building');
    // nobody's mail names anyone else
    for (const mail of s.mailer.sent)
      for (const other of Object.values(ADDRESS))
        if (other !== mail.to)
          expect(mail.html + mail.text).not.toContain(other);

    // the buildings were picked once per language, not once per person
    expect(s.pickIn).toHaveBeenCalledTimes(2);
    expect(s.pickIn).toHaveBeenCalledWith('tinylis', 'pt-BR', 3);
    expect(s.pickIn).toHaveBeenCalledWith('tinylis', 'en-US', 3);

    // each is told once, and the city's list ends; the other list stays
    expect(
      s.prisma.listNotices.map((n) => [n.donorId, n.cityId]).sort(),
    ).toEqual([
      [ANA, s.lisbon.id],
      [BO, s.lisbon.id],
      [CY, s.lisbon.id],
    ]);
    expect(city(s, 'lisbon').listsStartedAt).toBeInstanceOf(Date);
    expect(city(s, 'lisbon').listsAnnouncedAt).toBeInstanceOf(Date);
    expect(s.prisma.listMembers.map((m) => m.donorId)).toEqual([DORA]);
  });

  it('new-cities members hear about every new world, imagined ones too', async () => {
    const s = setup();
    member(s, DORA, null, 'es-ES', 1);

    const first = await s.service.announce(['tinywinterfell']);
    expect(first.cities).toEqual([
      {
        world: 'tinywinterfell',
        city: 'Winterfell',
        mailed: 1,
        failed: [],
        unsent: [],
        refused: [],
        closed: true,
      },
    ]);
    const winterfell = only(s, DORA);
    expect(winterfell.subject).toBe(
      'Winterfell ya está en el mapa. Ven a echar un vistazo',
    );
    expect(winterfell.html).toContain(
      `${SITE}/tinywinterfell/og/tinywinterfell.jpg`,
    );
    expect(winterfell.html).not.toContain('Adivina el edificio');
    expect(winterfell.text).not.toMatch(/la ciudad|esta ciudad/i);
    expect(winterfell.text).toContain(leaveLink(DORA, '*'));

    const second = await s.service.announce(['tinylis']);
    expect(second.cities[0]).toMatchObject({ city: 'Lisbon', mailed: 1 });
    const mails = mailTo(s, DORA);
    expect(mails).toHaveLength(2);
    expect(mails[1].subject).toBe(
      'Lisbon ya está en el mapa. Ven a echar un vistazo',
    );
    expect(mails[1].html).toContain('Jugar a Adivina el edificio');
    // the list of new cities lasts until they leave it
    expect(s.prisma.listMembers).toHaveLength(1);
  });

  it('someone on both lists gets one mail', async () => {
    const s = setup();
    member(s, ANA, s.lisbon, 'en-US', 1);
    member(s, ANA, null, 'pt-BR', 2);

    const done = await s.service.announce(['tinylis']);
    expect(done.cities[0]).toMatchObject({ mailed: 1, closed: true });
    const mail = only(s, ANA);
    // in the language of the newest of their reasons
    expect(mail.subject).toBe('Lisbon já está no mapa. Venha ver');
    // two reasons: the footer and the leave link are new cities', the list that goes on
    expect(mail.text).toContain('quando novas cidades ficarem prontas');
    expect(mail.text).toContain(leaveLink(ANA, '*'));
    expect(s.prisma.listNotices).toHaveLength(1);
    expect(s.prisma.listMembers.map((m) => m.cityId)).toEqual([null]);
  });

  it('a donor of the city gets no list mail', async () => {
    const s = setup();
    member(s, BO, s.lisbon, 'en-US', 1);
    member(s, BO, null, 'en-US', 2);
    member(s, CY, s.lisbon, 'en-US', 3);
    const gift = (id: string, donorId: string, cityId: string) =>
      s.prisma.donations.push({
        id,
        stripeSessionId: `cs_${id}`,
        amountCents: 500,
        currency: 'usd',
        cityId,
        donorId,
      } as DonationRow);
    gift('g1', BO, s.lisbon.id);
    // a gift to another city is no reason to leave someone out
    gift('g2', CY, s.rome.id);

    const done = await s.service.announce(['tinylis']);
    expect(done.cities).toEqual([
      {
        world: 'tinylis',
        city: 'Lisbon',
        mailed: 1,
        failed: [],
        unsent: [],
        refused: [],
        closed: true,
      },
    ]);
    expect(s.mailer.sent.map((mail) => mail.to)).toEqual(['cy@example.com']);
    expect(s.prisma.listNotices.map((n) => n.donorId)).toEqual([CY]);
    // their place on the city's list ends with everyone's
    expect(s.prisma.listMembers.map((m) => [m.donorId, m.cityId])).toEqual([
      [BO, null],
    ]);
  });

  it('two cities in one run make one mail naming both, a building each', async () => {
    const s = setup();
    member(s, DORA, null, 'en-US', 1);
    member(s, EVA, s.lisbon, 'en-US', 2);
    member(s, EVA, s.rome, 'en-US', 3);
    member(s, ANA, s.rome, 'en-US', 4);

    const done = await s.service.announce(['tinylis', 'tinyrom']);
    expect(done).toEqual({
      cities: [
        {
          world: 'tinylis',
          city: 'Lisbon',
          mailed: 2,
          failed: [],
          unsent: [],
          refused: [],
          closed: true,
        },
        {
          world: 'tinyrom',
          city: 'Rome',
          mailed: 3,
          failed: [],
          unsent: [],
          refused: [],
          closed: true,
        },
      ],
      unread: [],
    });
    expect(s.mailer.sent).toHaveLength(3);
    for (const donor of [DORA, EVA]) {
      const mail = only(s, donor);
      expect(mail.subject).toBe('Lisbon and Rome are built. Come and see them');
      for (const world of ['tinylis', 'tinyrom']) {
        expect(mail.html).toContain(`${world} building 1 (en-US)`);
        expect(mail.html).not.toContain(`${world} building 2`);
        expect(mail.html).toContain(`${SITE}/${world}/og/${world}.jpg`);
      }
      // several reasons: the leave link is new cities'
      expect(mail.text).toContain(leaveLink(donor, '*'));
    }
    const ana = only(s, ANA);
    expect(ana.subject).toBe('Rome is built. Come and see it');
    expect(ana.html).toContain('tinyrom building 3 (en-US)');
    expect(ana.text).toContain(leaveLink(ANA, s.rome.id));
    // once per world and language, whoever needs them
    expect(s.pickIn).toHaveBeenCalledTimes(2);
    expect(s.prisma.listNotices).toHaveLength(5);
    expect(s.prisma.listMembers.map((m) => m.donorId)).toEqual([DORA]);
  });

  it('a second run sends nothing', async () => {
    const s = setup();
    member(s, ANA, s.lisbon, 'en-US', 1);
    member(s, DORA, null, 'en-US', 2);
    await s.service.announce(['tinylis']);
    expect(s.mailer.sent).toHaveLength(2);
    const announcedAt = city(s, 'lisbon').listsAnnouncedAt;

    expect(await s.service.announce(['tinylis'])).toEqual({
      cities: [],
      unread: [],
    });
    expect(s.mailer.sent).toHaveLength(2);
    expect(city(s, 'lisbon').listsAnnouncedAt).toEqual(announcedAt);
    expect(s.prisma.listMembers.map((m) => m.cityId)).toEqual([null]);
  });

  it('an address the mail server refuses for good (5xx) counts as told, and the city closes', async () => {
    const s = setup();
    member(s, ANA, s.lisbon, 'en-US', 1);
    member(s, BO, s.lisbon, 'en-US', 2);
    member(s, CY, s.lisbon, 'en-US', 3);
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    s.mailer.failWith = (attempt) => (attempt === 2 ? refusedWith(550) : null);

    const done = await s.service.announce(['tinylis']);
    expect(done.cities).toEqual([
      {
        world: 'tinylis',
        city: 'Lisbon',
        mailed: 2,
        failed: [],
        unsent: [],
        refused: [BO],
        closed: true,
      },
    ]);
    // the run goes on after it
    expect(s.mailer.sent.map((mail) => mail.to)).toEqual([
      'ana@example.com',
      'cy@example.com',
    ]);
    // logged by donor id, never by address
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0][0])).toContain(BO);
    expect(String(logged.mock.calls[0][0])).toContain('refused');
    expect(String(logged.mock.calls[0][0])).not.toContain('@');
    // their claim is kept: nobody tries them again, and the list ends
    expect(s.prisma.listNotices.map((n) => n.donorId).sort()).toEqual(
      [ANA, BO, CY].sort(),
    );
    expect(city(s, 'lisbon').listsAnnouncedAt).toBeInstanceOf(Date);
    expect(s.prisma.listMembers).toHaveLength(0);
    // said once, so the deploy warns once
    expect(listsFellShort(done)).toBe(true);
    expect(describeListAnnouncement(done)).toEqual([
      'Lisbon (tinylis), its lists: 2 mailed, 0 failed, 1 refused. Its list is closed.',
      `Refused by the mail server, counted as told and not tried again (donor ids): ${BO}`,
    ]);

    const again = await s.service.announce(['tinylis']);
    expect(again).toEqual({ cities: [], unread: [] });
    expect(s.mailer.attempts).toBe(3);
  });

  it('a mail that fails for now (a 4xx answer) is tried again on the next run, and only that one', async () => {
    const s = setup();
    member(s, ANA, s.lisbon, 'en-US', 1);
    member(s, BO, s.lisbon, 'en-US', 2);
    member(s, CY, s.lisbon, 'en-US', 3);
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    s.mailer.failWith = (attempt) => (attempt === 2 ? refusedWith(450) : null);

    const first = await s.service.announce(['tinylis']);
    expect(first.cities).toEqual([
      {
        world: 'tinylis',
        city: 'Lisbon',
        mailed: 2,
        failed: [BO],
        unsent: [],
        refused: [],
        closed: false,
      },
    ]);
    expect(listsFellShort(first)).toBe(true);
    // logged by donor id, never by address
    expect(logged).toHaveBeenCalledTimes(1);
    expect(String(logged.mock.calls[0][0])).toContain(BO);
    expect(String(logged.mock.calls[0][0])).not.toContain('@');
    // their claim is given back; the list stays open
    expect(s.prisma.listNotices.map((n) => n.donorId)).toEqual([ANA, CY]);
    expect(city(s, 'lisbon').listsAnnouncedAt).toBeNull();
    expect(s.prisma.listMembers).toHaveLength(3);

    s.mailer.failWith = null;
    const second = await s.service.announce(['tinylis']);
    expect(second.cities).toEqual([
      {
        world: 'tinylis',
        city: 'Lisbon',
        mailed: 1,
        failed: [],
        unsent: [],
        refused: [],
        closed: true,
      },
    ]);
    expect(s.mailer.sent.map((mail) => mail.to)).toEqual([
      'ana@example.com',
      'cy@example.com',
      'bo@example.com',
    ]);
    expect(city(s, 'lisbon').listsAnnouncedAt).toBeInstanceOf(Date);
    expect(s.prisma.listMembers).toHaveLength(0);
  });

  it('a mail server that goes away stops the run; the rest are unsent and tried next run', async () => {
    const s = setup();
    member(s, ANA, s.lisbon, 'en-US', 1);
    member(s, BO, s.lisbon, 'en-US', 2);
    member(s, CY, null, 'en-US', 3);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    s.mailer.failWith = (attempt) => (attempt === 2 ? away() : null);

    const first = await s.service.announce(['tinylis', 'tinyrom']);
    expect(first.cities).toEqual([
      {
        world: 'tinylis',
        city: 'Lisbon',
        mailed: 1,
        failed: [BO],
        unsent: [CY],
        refused: [],
        closed: false,
      },
      {
        world: 'tinyrom',
        city: 'Rome',
        mailed: 0,
        failed: [],
        unsent: [CY],
        refused: [],
        closed: false,
      },
    ]);
    // no waiting on the server for everyone after it
    expect(s.mailer.attempts).toBe(2);
    expect(s.prisma.listNotices.map((n) => n.donorId)).toEqual([ANA]);
    expect(city(s, 'lisbon').listsAnnouncedAt).toBeNull();
    expect(city(s, 'rome').listsAnnouncedAt).toBeNull();

    s.mailer.failWith = null;
    const second = await s.service.announce(['tinylis', 'tinyrom']);
    expect(second.cities.map((c) => [c.city, c.mailed, c.closed])).toEqual([
      ['Lisbon', 2, true],
      ['Rome', 1, true],
    ]);
    expect(only(s, ANA).subject).toBe('Lisbon is built. Come and see it');
    expect(only(s, BO).subject).toBe('Lisbon is built. Come and see it');
    expect(only(s, CY).subject).toBe(
      'Lisbon and Rome are built. Come and see them',
    );
  });

  it('someone who joined new cities after the city was first announced is not mailed about it', async () => {
    const s = setup();
    member(s, ANA, s.lisbon, 'en-US', 1);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    s.mailer.failWith = away();
    const first = await s.service.announce(['tinylis']);
    expect(first.cities[0]).toMatchObject({ failed: [ANA], closed: false });
    const started = city(s, 'lisbon').listsStartedAt!;
    expect(started).toBeInstanceOf(Date);

    // after the first run: one joins new cities, one slips onto the city's list
    const later = new Date(started.getTime() + 60_000);
    member(s, DORA, null, 'en-US', later);
    member(s, EVA, s.lisbon, 'en-US', later);
    s.mailer.failWith = null;
    const second = await s.service.announce(['tinylis']);
    expect(second.cities[0]).toMatchObject({ mailed: 1, closed: true });
    expect(s.mailer.sent.map((mail) => mail.to)).toEqual(['ana@example.com']);
    // the cut-off is the first run's, kept
    expect(city(s, 'lisbon').listsStartedAt).toEqual(started);
    expect(s.prisma.listMembers.map((m) => m.donorId)).toEqual([DORA]);
  });

  it('unreadable site files: mails go without buildings, and the output names the world', async () => {
    const s = setup();
    s.unread.add('tinylis');
    member(s, ANA, s.lisbon, 'en-US', 1);
    member(s, DORA, s.rome, 'en-US', 2);

    const done = await s.service.announce(['tinylis', 'tinyrom']);
    expect(done.unread).toEqual(['tinylis']);
    expect(done.cities.map((c) => [c.city, c.mailed, c.closed])).toEqual([
      ['Lisbon', 1, true],
      ['Rome', 1, true],
    ]);
    const ana = only(s, ANA);
    expect(ana.html).not.toContain('/api/sight-pictures/');
    expect(ana.html).not.toContain('places to start');
    expect(ana.html).toContain(`${SITE}/tinylis/og/tinylis.jpg`);
    expect(ana.html).toContain('Explore Lisbon');
    // what was not read is not offered either
    expect(ana.html).not.toContain('Guess the building');
    expect(only(s, DORA).html).toContain('tinyrom building 1');
    const lines = describeListAnnouncement(done);
    expect(lines.some((line) => line.includes('tinylis'))).toBe(true);
    expect(lines.at(-1)).toBe(
      'Could not read the buildings of tinylis: its mails went without them.',
    );
    expect(listsFellShort(done)).toBe(false);
  });

  it('a world without lit buildings is not named unread; one whose files fail is', async () => {
    const warned = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    // the site as it is: tinylis's sights.json fails, tinywinterfell has none of the files
    const fetcher = ((url: string) =>
      Promise.resolve(
        new Response('', {
          status: url === `${SITE}/tinylis/data/sights.json` ? 500 : 404,
        }),
      )) as unknown as typeof fetch;
    const s = setup({ catalog: new SightsCatalog(config, fetcher) });
    member(s, ANA, s.lisbon, 'en-US', 1);
    member(s, DORA, null, 'en-US', 2);

    const done = await s.service.announce(['tinylis', 'tinywinterfell']);
    expect(done.unread).toEqual(['tinylis']);
    expect(done.cities.map((c) => [c.city, c.closed])).toEqual([
      ['Lisbon', true],
      ['Winterfell', true],
    ]);
    expect(describeListAnnouncement(done).at(-1)).toBe(
      'Could not read the buildings of tinylis: its mails went without them.',
    );
    expect(warned).toHaveBeenCalledTimes(1);
    expect(String(warned.mock.calls[0][0])).toContain('tinylis');
  });

  it('someone another run is mailing is skipped, and the city stays open for it', async () => {
    const s = setup();
    member(s, ANA, s.lisbon, 'en-US', 1);
    member(s, BO, s.lisbon, 'en-US', 2);
    member(s, CY, s.lisbon, 'en-US', 3);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    // another run claims Bo while this one is under way
    const createMany = s.prisma.listNotice.createMany;
    let first = true;
    s.prisma.listNotice.createMany = (args) => {
      if (first) {
        first = false;
        s.prisma.listNotices.push({
          donorId: BO,
          cityId: s.lisbon.id,
          sentAt: new Date(),
        });
      }
      return createMany(args);
    };

    const done = await s.service.announce(['tinylis']);
    expect(done.cities).toEqual([
      {
        world: 'tinylis',
        city: 'Lisbon',
        mailed: 2,
        failed: [],
        unsent: [],
        refused: [],
        closed: false,
      },
    ]);
    expect(s.mailer.sent.map((mail) => mail.to)).toEqual([
      'ana@example.com',
      'cy@example.com',
    ]);
    expect(city(s, 'lisbon').listsAnnouncedAt).toBeNull();
    // the next run finds everyone told, and closes it
    const next = await s.service.announce(['tinylis']);
    expect(next.cities[0]).toMatchObject({ mailed: 0, closed: true });
    expect(s.mailer.sent).toHaveLength(2);
  });

  it('tells only the lists of cities built, shown and not told before', async () => {
    const s = setup();
    s.prisma.seedCity({ slug: 'paris', name: 'Paris', worldId: 'tinypar' });
    s.prisma.seedCity({
      slug: 'hid',
      name: 'Hid',
      status: 'BUILT',
      worldId: 'tinyhid',
      hidden: true,
    });
    s.prisma.seedCity({
      slug: 'old',
      name: 'Old',
      status: 'BUILT',
      worldId: 'tinyold',
      listsStartedAt: new Date(JOINED),
      listsAnnouncedAt: new Date(JOINED),
    });
    member(s, DORA, null, 'en-US', 1);

    expect(
      await s.service.announce(['tinypar', 'tinyhid', 'tinyold', 'tinynope']),
    ).toEqual({ cities: [], unread: [] });
    expect(s.mailer.sent).toHaveLength(0);
    expect(s.pickIn).not.toHaveBeenCalled();
    for (const slug of ['paris', 'hid'])
      expect(city(s, slug).listsStartedAt).toBeNull();
  });
});

describe('describeListAnnouncement', () => {
  const lisbon = { world: 'tinylis', city: 'Lisbon' };

  it('says what was sent, with counts and donor ids only', () => {
    const all: ListAnnouncement = {
      cities: [
        {
          ...lisbon,
          mailed: 3,
          failed: [],
          unsent: [],
          refused: [],
          closed: true,
        },
      ],
      unread: [],
    };
    expect(describeListAnnouncement(all)).toEqual([
      'Lisbon (tinylis), its lists: 3 mailed, 0 failed. Its list is closed.',
    ]);
    expect(listsFellShort(all)).toBe(false);
  });

  it('says who was missed, and that the next run tries them again', () => {
    const partly: ListAnnouncement = {
      cities: [
        {
          ...lisbon,
          mailed: 1,
          failed: ['d2'],
          unsent: ['d3', 'd4'],
          refused: [],
          closed: false,
        },
      ],
      unread: [],
    };
    expect(describeListAnnouncement(partly)).toEqual([
      'Lisbon (tinylis), its lists: 1 mailed, 1 failed, 2 not tried once the mail server failed.',
      'Not mailed (donor ids): d2, d3, d4',
      'Its list stays open: the next run mails them, and nobody twice.',
    ]);
    expect(listsFellShort(partly)).toBe(true);
    const failedOnly: ListAnnouncement = {
      cities: [{ ...partly.cities[0], unsent: [] }],
      unread: [],
    };
    expect(describeListAnnouncement(failedOnly)[0]).toBe(
      'Lisbon (tinylis), its lists: 1 mailed, 1 failed.',
    );
  });

  it('says when another run is mailing some of them', () => {
    expect(
      describeListAnnouncement({
        cities: [
          {
            ...lisbon,
            mailed: 2,
            failed: [],
            unsent: [],
            refused: [],
            closed: false,
          },
        ],
        unread: [],
      }),
    ).toEqual([
      'Lisbon (tinylis), its lists: 2 mailed, 0 failed. Another run was mailing some of them: its list stays open until a run finds everyone told.',
    ]);
  });

  it('names the worlds whose buildings could not be read', () => {
    const done: ListAnnouncement = {
      cities: [
        {
          ...lisbon,
          mailed: 1,
          failed: [],
          unsent: [],
          refused: [],
          closed: true,
        },
        {
          world: 'tinyrom',
          city: 'Rome',
          mailed: 1,
          failed: [],
          unsent: [],
          refused: [],
          closed: true,
        },
      ],
      unread: ['tinylis', 'tinyrom'],
    };
    expect(describeListAnnouncement(done).at(-1)).toBe(
      'Could not read the buildings of tinylis, tinyrom: their mails went without them.',
    );
    expect(listsFellShort(done)).toBe(false);
  });

  it('says when no list had anything to hear', () => {
    expect(describeListAnnouncement({ cities: [], unread: [] })).toEqual([
      'Lists: no city newly built here, nothing to send.',
    ]);
  });
});
