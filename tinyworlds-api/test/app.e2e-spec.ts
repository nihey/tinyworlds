import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { AnnounceService } from '../src/benefactors/announce.service.js';
import { BenefactorsService } from '../src/benefactors/benefactors.service.js';
import { announceHall, hallLetters } from '../src/benefactors/hall-announce.js';
import { noteLetters, sendNotes } from '../src/benefactors/note-announce.js';
import {
  describeListAnnouncement,
  ListAnnounceService,
  listsFellShort,
} from '../src/lists/list-announce.service.js';
import { ListsService } from '../src/lists/lists.service.js';
import { SightsCatalog } from '../src/lists/sights-catalog.js';
import { MAILER } from '../src/mail/mailer.js';
import { STRIPE } from '../src/donations/stripe.provider.js';
import { configureHttp } from '../src/http.js';
import type { Drawn } from '../src/links/link-images.js';
import { LINK_READER } from '../src/links/link-reader.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CACHE_MS, LIVE_MS } from '../src/visits/visits.service.js';
import { FakeLinkReader } from './fake-link-reader.js';
import { FakeMailer } from './fake-mailer.js';
import { checkoutSession, FakeStripe, signedEvent } from './fake-stripe.js';

const MILESTONES =
  '{ cityMilestones { slug name raisedCents goalCents donations benefactorCount status worldId } }';
const CHECKOUT =
  'mutation ($input: CreateDonationCheckoutInput!) { createDonationCheckout(input: $input) { url } }';
const TRACK =
  'mutation ($input: TrackFunnelStepInput!) { trackFunnelStep(input: $input) }';
const ANSWER_QUIZ =
  'mutation ($input: AnswerQuizInput!) { answerQuiz(input: $input) { answers picks { choice count } } }';
const COUNTS =
  'visits donateOpened checkoutStarted checkoutCancelled donations raisedCents';
const FUNNEL = `query ($input: DonationFunnelInput!) { donationFunnel(input: $input) {
  timeZone totals { ${COUNTS} } worlds { world ${COUNTS} } days { day ${COUNTS} }
  recentDonations { id createdAt amountCents currency city world locale } } }`;

const WORLD_VISITS =
  'query ($input: WorldVisitsInput!) { worldVisits(input: $input) { world visits live } }';
const PRESENCE =
  'mutation ($input: TrackPresenceInput!) { trackPresence(input: $input) }';

const ADMIN = 'admin@example.com';
const ADMIN_PAGE = 'https://example.com/admin/';

/** A GraphQL answer, as far as these tests read it. */
interface Answer {
  data: {
    cityMilestones: Record<string, unknown>[];
    createDonationCheckout: { url: string };
    trackFunnelStep: boolean;
    worldVisits: { world: string; visits: number; live: number }[];
    trackPresence: boolean;
    answerQuiz: { answers: number; picks: { choice: string; count: number }[] };
    me: { id: string; email: string };
    donationFunnel: {
      timeZone: string;
      totals: Record<string, number>;
      worlds: ({ world: string | null } & Record<string, number>)[];
      days: ({ day: string } & Record<string, number>)[];
      recentDonations: Record<string, unknown>[];
    };
  };
  errors?: { message: string; extensions: { code: string } }[];
}

const answer = (res: { body: unknown }): Answer => res.body as Answer;

describe('the API over HTTP', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let stripe: FakeStripe;
  let mailer: FakeMailer;
  let reader: FakeLinkReader;
  /** The admin's session, once signed in: sign-in links are limited to one a minute. */
  let session: { accessToken: string; admin: { id: string } } | null = null;

  const graphql = (query: string, variables?: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/graphql')
      .send({ query, variables });
  const webhook = (options: Parameters<typeof checkoutSession>[0]) => {
    const { body, signature } = signedEvent(checkoutSession(options));
    return request(app.getHttpServer())
      .post('/api/stripe/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', signature)
      .send(body.toString());
  };

  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(path).send(body);

  /** Signs the admin in the way a person does: ask for a link, read the mail, open the link. */
  const signIn = async () => {
    if (session) return session;
    await post('/api/auth/magic-link', {
      email: ADMIN,
      returnUrl: ADMIN_PAGE,
    }).expect(202, { sent: true });
    // the mail goes out after the answer
    await vi.waitFor(() => expect(mailer.signIns()).toHaveLength(1));
    const res = await post('/api/auth/verify', {
      token: mailer.token(),
    }).expect(200);
    session = res.body as NonNullable<typeof session>;
    return session;
  };

  /** A GraphQL request with the admin's session; answers once it has come back (200). */
  const asAdmin = async (query: string, variables?: Record<string, unknown>) =>
    graphql(query, variables)
      .set('Authorization', `Bearer ${(await signIn()).accessToken}`)
      .expect(200);

  beforeAll(async () => {
    stripe = new FakeStripe();
    mailer = new FakeMailer();
    reader = new FakeLinkReader();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STRIPE)
      .useValue(stripe)
      .overrideProvider(MAILER)
      .useValue(mailer)
      .overrideProvider(LINK_READER)
      .useValue(reader)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureHttp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE admins CASCADE');
  });

  beforeEach(async () => {
    // not the admins: the session made by the first sign-in serves every test after it. Links
    // go with the donors they may belong to (and so a test may ask for a fresh one)
    await prisma.$executeRawUnsafe(
      'TRUNCATE donations, donors, cities, funnel_events, magic_links, quiz_answers, donor_links, link_images, list_members, list_notices',
    );
    reader.reset();
    stripe.calls = [];
    stripe.priceLookups = [];
  });

  afterAll(async () => {
    await app.close();
  });

  it('is alive under /api', async () => {
    const res = await graphql('{ health uptime }').expect(200);
    const { data } = res.body as { data: { health: string; uptime: number } };
    expect(data.health).toBe('ok');
    // the seconds this process (the app's, in the tests) has been up: what a deploy waits on
    expect(data.uptime).toBeGreaterThanOrEqual(0);
    expect(data.uptime).toBeLessThanOrEqual(process.uptime());
    await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ health }' })
      .expect(404);
  });

  it('fills a city from signed webhooks and funds it at the goal, once', async () => {
    await prisma.city.create({
      data: {
        slug: 'new-york',
        name: 'New York',
        status: 'BUILT',
        worldId: 'tinynyc',
        goalCents: 10_000,
      },
    });
    await prisma.city.create({
      data: {
        slug: 'hidden-one',
        name: 'Hidden one',
        hidden: true,
        goalCents: 10_000,
      },
    });
    const forCity = {
      app: 'tinyworlds',
      city: 'São Paulo',
      world: 'tinynyc',
      locale: 'pt-BR',
    };

    await webhook({ id: 'cs_a', amount: 4000, metadata: forCity }).expect(200, {
      received: true,
    });
    let res = await graphql(MILESTONES).expect(200);
    expect(answer(res).data.cityMilestones).toMatchObject([
      {
        slug: 'sao-paulo',
        name: 'São Paulo',
        raisedCents: 4000,
        goalCents: 10_000,
        donations: 1,
        benefactorCount: 1,
        status: 'PROPOSED',
        worldId: null,
      },
      {
        slug: 'new-york',
        status: 'BUILT',
        worldId: 'tinynyc',
        benefactorCount: 0,
      },
    ]);

    await webhook({
      id: 'cs_b',
      amount: 6000,
      metadata: { ...forCity, city: 'sao paulo' },
    }).expect(200);
    // Stripe delivers again
    await webhook({ id: 'cs_a', amount: 4000, metadata: forCity }).expect(200);
    await webhook({ id: 'cs_b', amount: 6000, metadata: forCity }).expect(200);
    res = await graphql(MILESTONES).expect(200);
    expect(answer(res).data.cityMilestones[0]).toMatchObject({
      slug: 'sao-paulo',
      raisedCents: 10_000,
      donations: 2,
      status: 'FUNDED',
    });
    expect(await prisma.donation.count()).toBe(2);
  });

  it('counts the people who gave to a city: a donor once, a gift without an address as one', async () => {
    const lisbon = {
      app: 'tinyworlds',
      city: 'Lisbon',
      world: 'tinynyc',
      locale: 'en-US',
    };
    const before = mailer.sent.length;
    await webhook({
      id: 'cs_p1',
      amount: 1000,
      email: 'ana@example.com',
      metadata: lisbon,
    }).expect(200);
    await webhook({
      id: 'cs_p2',
      amount: 500,
      email: 'ANA@example.com',
      metadata: lisbon,
    }).expect(200);
    await webhook({
      id: 'cs_p3',
      amount: 700,
      email: 'bo@example.com',
      metadata: lisbon,
    }).expect(200);
    await webhook({
      id: 'cs_p4',
      amount: 300,
      email: null,
      metadata: lisbon,
    }).expect(200);
    await webhook({
      id: 'cs_p5',
      amount: 200,
      email: null,
      metadata: lisbon,
    }).expect(200);
    // another currency counts toward nothing, so its donor is no one's benefactor here
    await webhook({
      id: 'cs_p6',
      amount: 900,
      email: 'eva@example.com',
      currency: 'eur',
      metadata: lisbon,
    }).expect(200);
    await webhook({
      id: 'cs_p7',
      amount: 400,
      email: 'ana@example.com',
      metadata: { ...lisbon, city: 'Porto' },
    }).expect(200);
    // the thank-yous go out on their own: wait for them, so they do not land in a later test
    await vi.waitFor(() =>
      expect(mailer.sent.length).toBeGreaterThanOrEqual(before + 5),
    );

    const res = await graphql(MILESTONES).expect(200);
    const bySlug = new Map(
      answer(res).data.cityMilestones.map((city) => [city.slug, city]),
    );
    expect(bySlug.get('lisbon')).toMatchObject({
      raisedCents: 2700,
      donations: 5,
      // Ana, Bo, and the two gifts that came without an address
      benefactorCount: 4,
    });
    expect(bySlug.get('porto')).toMatchObject({
      donations: 1,
      benefactorCount: 1,
    });
  });

  it("puts the listing name into the checkout's metadata and records it from the webhook", async () => {
    const res = await graphql(CHECKOUT, {
      input: {
        city: 'Lisbon',
        benefactorName: 'Ana',
        world: 'tinynyc',
        locale: 'en-US',
        returnUrl: 'https://example.com/tinynyc/',
      },
    })
      .set('x-forwarded-for', '203.0.113.77')
      .expect(200);
    expect(answer(res).errors).toBeUndefined();
    expect(stripe.calls.at(-1)?.metadata).toMatchObject({
      benefactor_name: 'Ana',
    });
    await webhook({
      id: 'cs_named',
      email: 'ana@example.com',
      metadata: {
        app: 'tinyworlds',
        city: 'Lisbon',
        world: 'tinynyc',
        locale: 'en-US',
        benefactor_name: 'Ana',
      },
    }).expect(200);
    const donors = await prisma.donor.findMany();
    expect(donors).toMatchObject([
      { email: 'ana@example.com', displayName: 'Ana' },
    ]);
    const donations = await prisma.donation.findMany();
    expect(donations).toMatchObject([
      { stripeSessionId: 'cs_named', listed: true, donorId: donors[0].id },
    ]);
  });

  it('thanks the donor by mail once Stripe has confirmed the gift, and only once', async () => {
    const gift = {
      id: 'cs_thanks',
      amount: 1200,
      email: 'Thea@example.com',
      metadata: {
        app: 'tinyworlds',
        city: 'Lisbon',
        world: 'tinynyc',
        locale: 'en-US',
        benefactor_name: 'Thea',
      },
    };
    await webhook(gift).expect(200);
    await vi.waitFor(() =>
      expect(mailer.others('thea@example.com')).toHaveLength(1),
    );
    // Stripe delivers again: nothing new is recorded, and nobody is thanked twice
    await webhook(gift).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const thanks = mailer.others('thea@example.com');
    expect(thanks).toHaveLength(1);
    expect(thanks[0].subject).toBe('You laid stones 1–12 of Lisbon');
    expect(thanks[0].text).toContain(
      "You're on Lisbon's Founding Benefactors as Thea.",
    );
    expect(thanks[0].html).toContain('href="https://example.com/me/"');
    expect(thanks[0].html).toContain(
      'src="https://example.com/email/wordmark.png"',
    );
  });

  it('refuses a webhook with a bad signature, and one with none', async () => {
    const { body } = signedEvent(
      checkoutSession({ metadata: { app: 'tinyworlds', city: 'Paris' } }),
    );
    await request(app.getHttpServer())
      .post('/api/stripe/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', 't=1,v1=deadbeef')
      .send(body.toString())
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/stripe/webhook')
      .set('content-type', 'application/json')
      .send(body.toString())
      .expect(400);
    expect(await prisma.donation.count()).toBe(0);
  });

  it('starts a checkout for a tidy city name and answers its page', async () => {
    const res = await graphql(CHECKOUT, {
      input: {
        city: '  Buenos   Aires ',
        world: 'tinyrao',
        locale: 'es-ES',
        returnUrl: 'https://example.com/tinyrao/',
      },
    }).expect(200);
    expect(answer(res).data.createDonationCheckout.url).toMatch(
      /^https:\/\/checkout\.stripe\.test\//,
    );
    expect(stripe.calls).toHaveLength(1);
    expect(stripe.calls[0]).toMatchObject({
      mode: 'payment',
      submit_type: 'donate',
      locale: 'es',
      line_items: [{ price: 'price_es', quantity: 1 }],
      success_url: 'https://example.com/tinyrao/?donated=1',
      cancel_url: 'https://example.com/tinyrao/?donated=0',
      metadata: {
        app: 'tinyworlds',
        city: 'Buenos Aires',
        world: 'tinyrao',
        locale: 'es-ES',
      },
    });
  });

  it('charges the amount chosen on the site, looking the product up once', async () => {
    const input = {
      city: 'Lisbon',
      world: 'tinynyc',
      locale: 'pt-BR',
      returnUrl: 'https://example.com/tinynyc/',
    };
    for (const amountCents of [100, 2500, 1_000_000]) {
      // its own address: the checkout limit is counted per visitor
      const res = await graphql(CHECKOUT, { input: { ...input, amountCents } })
        .set('x-forwarded-for', '203.0.113.21')
        .expect(200);
      expect(answer(res).errors).toBeUndefined();
    }
    expect(stripe.priceLookups).toEqual(['price_pt']);
    expect(stripe.calls.map((call) => call.line_items?.[0].price_data)).toEqual(
      [100, 2500, 1_000_000].map((unit_amount) => ({
        currency: 'usd',
        unit_amount,
        product: 'prod_pt',
      })),
    );
    expect(stripe.calls[1].metadata).toEqual({
      app: 'tinyworlds',
      city: 'Lisbon',
      world: 'tinynyc',
      locale: 'pt-BR',
      amount_cents: '2500',
    });
  });

  it('refuses an amount under US$1, over US$10,000 or not in whole cents', async () => {
    const good = {
      world: 'tinynyc',
      locale: 'en-US',
      returnUrl: 'http://localhost:3000/',
    };
    for (const [amountCents, reason] of [
      [99, 'amountCents must be at least 100 (US$1)'],
      [0, 'amountCents must be at least 100 (US$1)'],
      [-500, 'amountCents must be at least 100 (US$1)'],
      [1_000_001, 'amountCents must be at most 1000000 (US$10,000)'],
    ] as const) {
      const res = await graphql(CHECKOUT, { input: { ...good, amountCents } })
        .set('x-forwarded-for', '203.0.113.22')
        .expect(200);
      const error = answer(res).errors?.[0];
      expect(error?.extensions.code).toBe('BAD_REQUEST');
      expect(JSON.stringify(error)).toContain(reason);
    }
    // not a whole number: GraphQL's Int refuses it before the resolver is reached (HTTP 400)
    const fraction = await graphql(CHECKOUT, {
      input: { ...good, amountCents: 500.5 },
    })
      .set('x-forwarded-for', '203.0.113.22')
      .expect(400);
    expect(answer(fraction).errors?.[0].extensions.code).toBe('BAD_USER_INPUT');
    expect(stripe.calls).toHaveLength(0);
    expect(stripe.priceLookups).toHaveLength(0);
  });

  it('validates the input before anything reaches Stripe', async () => {
    const good = {
      world: 'tinynyc',
      locale: 'en-US',
      returnUrl: 'http://localhost:3000/',
    };
    for (const input of [
      { ...good, returnUrl: 'https://evil.test/' },
      { ...good, returnUrl: 'http://localhost:3000/?next=x' },
      { ...good, locale: 'fr-FR' },
      { ...good, world: 'Tiny NYC' },
      { ...good, city: 'x'.repeat(61) },
    ]) {
      const res = await graphql(CHECKOUT, { input }).expect(200);
      expect(answer(res).errors?.[0].extensions.code).toBe('BAD_REQUEST');
    }
    expect(stripe.calls).toHaveLength(0);
  });

  it('limits how many checkouts one address may start in a minute', async () => {
    const input = {
      world: 'tinynyc',
      locale: 'en-US',
      returnUrl: 'http://localhost:3000/',
    };
    const codes: string[] = [];
    for (let i = 0; i < 14; i++) {
      const res = await graphql(CHECKOUT, { input }).set(
        'x-forwarded-for',
        '203.0.113.9',
      );
      codes.push(answer(res).errors?.[0]?.message ?? 'ok');
    }
    expect(codes.filter((code) => code === 'ok')).toHaveLength(10);
    expect(codes.at(-1)).toMatch(/Too Many Requests/);
    // another visitor is not held back
    const other = await graphql(CHECKOUT, { input }).set(
      'x-forwarded-for',
      '203.0.113.10',
    );
    expect(answer(other).data.createDonationCheckout.url).toBeTruthy();
  });

  it('answers the browser only from an allowed origin', async () => {
    const preflight = (origin: string) =>
      request(app.getHttpServer())
        .options('/api/graphql')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST');
    expect(
      (await preflight('https://example.com')).headers[
        'access-control-allow-origin'
      ],
    ).toBe('https://example.com');
    expect(
      (await preflight('https://evil.test')).headers[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
  });

  describe('the admin pages', () => {
    const period = {
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
    };

    it('are closed to anyone who is not signed in', async () => {
      for (const [query, variables] of [
        ['{ me { email } }', undefined],
        [FUNNEL, { input: period }],
      ] as const) {
        const res = await graphql(query, variables).expect(200);
        expect(answer(res).errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
        expect((res.body as { data: unknown }).data).toBeNull();
      }
      // nor to a session this API did not sign
      const forged = await new JwtService({
        secret: 'someone-else-made-this-secret-up-entirely',
      }).signAsync({ sub: '7a0d7d0e-3a55-4b0e-8f2a-0c1d2e3f4a5b' });
      const res = await graphql('{ me { email } }')
        .set('Authorization', `Bearer ${forged}`)
        .expect(200);
      expect(answer(res).errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('open to an admin through a link sent by mail, which works once', async () => {
      const { accessToken, admin } = await signIn();
      expect(mailer.signIns()[0].to).toBe(ADMIN);
      expect(mailer.signIns()[0].text).toContain(`${ADMIN_PAGE}#token=`);

      const res = await asAdmin('{ me { id email } }');
      expect(answer(res).data.me).toEqual({ id: admin.id, email: ADMIN });
      expect(accessToken.split('.')).toHaveLength(3);

      // the link is spent
      await post('/api/auth/verify', { token: mailer.token() }).expect(401);
      // and only its hash was ever kept
      const links = await prisma.magicLink.findMany();
      expect(links).toHaveLength(1);
      expect(links[0].usedAt).toBeInstanceOf(Date);
      expect(JSON.stringify(links)).not.toContain(mailer.token());
    });

    it('open to an admin through the code from the mail', async () => {
      // a link a minute: forget the ones the other tests asked for
      await prisma.magicLink.deleteMany();
      const before = mailer.signIns().length;
      await post('/api/auth/magic-link', {
        email: ADMIN,
        returnUrl: ADMIN_PAGE,
      })
        .set('x-forwarded-for', '203.0.113.40')
        .expect(202);
      await vi.waitFor(() =>
        expect(mailer.signIns().length).toBeGreaterThan(before),
      );
      const code = mailer.code();
      const res = await post('/api/auth/verify', {
        email: ADMIN,
        code: `${code.slice(0, 3)} ${code.slice(3)}`,
      })
        .set('x-forwarded-for', '203.0.113.40')
        .expect(200);
      expect((res.body as { admin: { email: string } }).admin.email).toBe(
        ADMIN,
      );
      await post('/api/auth/verify', { email: ADMIN, code })
        .set('x-forwarded-for', '203.0.113.40')
        .expect(401);
    });

    it('answer anyone else the same, and mail them nothing', async () => {
      await signIn();
      const before = mailer.signIns().length;
      await post('/api/auth/magic-link', {
        email: 'someone@example.com',
        returnUrl: ADMIN_PAGE,
        locale: 'pt-BR',
      })
        .set('x-forwarded-for', '203.0.113.30')
        .expect(202, { sent: true });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(mailer.signIns()).toHaveLength(before);
      expect(await prisma.admin.count()).toBe(1);
    });

    it('refuse a link to anywhere but the site, an address that is none, and a made-up token', async () => {
      const from = (body: Record<string, unknown>, path = 'magic-link') =>
        post(`/api/auth/${path}`, body).set('x-forwarded-for', '203.0.113.31');
      await from({
        email: ADMIN,
        returnUrl: 'https://evil.test/admin/',
      }).expect(400);
      await from({ email: 'not-an-address', returnUrl: ADMIN_PAGE }).expect(
        400,
      );
      await from({
        email: ADMIN,
        returnUrl: ADMIN_PAGE,
        locale: 'fr-FR',
      }).expect(400);
      await from({
        email: ADMIN,
        returnUrl: ADMIN_PAGE,
        purpose: 'root',
      }).expect(400);
      await from({ token: 'x'.repeat(43) }, 'verify').expect(401);
      await from({ token: 'short' }, 'verify').expect(400);
      await from(
        { email: ADMIN, code: '482913', purpose: 'root' },
        'verify',
      ).expect(400);
    });

    it('limit how often one address may ask for a link', async () => {
      const codes: number[] = [];
      for (let i = 0; i < 7; i++) {
        const res = await post('/api/auth/magic-link', {
          email: 'someone@example.com',
          returnUrl: ADMIN_PAGE,
        }).set('x-forwarded-for', '203.0.113.32');
        codes.push(res.status);
      }
      expect(codes).toEqual([202, 202, 202, 202, 202, 429, 429]);
    });
  });

  describe('donors signing in', () => {
    const DONOR = 'dora@example.com';
    const HOME = 'https://example.com/';
    /** A paid gift from the address, which is what makes it a donor's. */
    const give = (email = DONOR) =>
      webhook({
        id: `cs_${email}`,
        amount: 500,
        email,
        metadata: {
          app: 'tinyworlds',
          city: 'Lisbon',
          world: 'tinynyc',
          locale: 'en-US',
        },
      }).expect(200);
    const askAsDonor = (email: string, from: string) =>
      post('/api/auth/magic-link', {
        email,
        returnUrl: HOME,
        purpose: 'donor',
      }).set('x-forwarded-for', from);
    const verify = (body: Record<string, unknown>, from: string) =>
      post('/api/auth/verify', body).set('x-forwarded-for', from);
    /** Waits for the mail that should follow an answer, and says it is the latest. */
    const mailFollows = async (before: number) => {
      await vi.waitFor(() => expect(mailer.signIns()).toHaveLength(before + 1));
      return mailer.signIns()[before];
    };
    /** A donor's session, through the link of a fresh mail. */
    const signInDonor = async (from: string) => {
      await give();
      const before = mailer.signIns().length;
      await askAsDonor(DONOR, from).expect(202);
      await mailFollows(before);
      const res = await verify({ token: mailer.token() }, from).expect(200);
      return res.body as { accessToken: string; donor: { id: string } };
    };

    it('a donor signs in with the link or the code', async () => {
      await give();
      let before = mailer.signIns().length;
      await askAsDonor(DONOR, '203.0.113.50').expect(202, { sent: true });
      const mail = await mailFollows(before);
      expect(mail.to).toBe(DONOR);
      expect(mail.text).toContain(`${HOME}#token=`);

      const byLink = await verify(
        { token: mailer.token() },
        '203.0.113.50',
      ).expect(200);
      const donor = await prisma.donor.findUniqueOrThrow({
        where: { email: DONOR },
      });
      expect(byLink.body).toMatchObject({
        accessToken: expect.any(String) as string,
        expiresAt: expect.any(String) as string,
        donor: { id: donor.id, email: DONOR },
      });
      expect(byLink.body).not.toHaveProperty('admin');
      expect(donor.lastLoginAt).toBeInstanceOf(Date);

      // a link a minute: forget this one, and ask again for its code
      await prisma.magicLink.deleteMany();
      before = mailer.signIns().length;
      await askAsDonor(DONOR, '203.0.113.50').expect(202);
      await mailFollows(before);
      const code = mailer.code();
      // asked as an admin's, the donor's code is nobody's
      await verify({ email: DONOR, code }, '203.0.113.50').expect(401);
      const byCode = await verify(
        {
          email: DONOR,
          code: `${code.slice(0, 3)}-${code.slice(3)}`,
          purpose: 'donor',
        },
        '203.0.113.50',
      ).expect(200);
      expect((byCode.body as { donor: unknown }).donor).toEqual({
        id: donor.id,
        email: DONOR,
      });
    });

    it('a donor session is refused by admin queries', async () => {
      // the other half, an admin session on a donor query, is with the donor's queries
      const { accessToken } = await signInDonor('203.0.113.51');
      for (const [query, variables] of [
        ['{ me { email } }', undefined],
        [
          FUNNEL,
          {
            input: {
              from: '2026-01-01T00:00:00.000Z',
              to: '2026-12-31T00:00:00.000Z',
            },
          },
        ],
      ] as const) {
        const res = await graphql(query, variables)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        expect(answer(res).errors?.[0].extensions.code).toBe('FORBIDDEN');
        expect((res.body as { data: unknown }).data).toBeNull();
      }
    });

    it('an admin token from before this change still works', async () => {
      const { admin } = await signIn();
      const jwt = new JwtService({ secret: process.env.JWT_SECRET });
      // no kind: every admin session signed before donors could sign in
      const legacy = await jwt.signAsync(
        { sub: admin.id },
        { expiresIn: '7d' },
      );
      const res = await graphql('{ me { id email } }')
        .set('Authorization', `Bearer ${legacy}`)
        .expect(200);
      expect(answer(res).data.me).toEqual({ id: admin.id, email: ADMIN });

      // but a donor's id is no admin's, and a kind it does not know is no session
      const { donor } = await signInDonor('203.0.113.52');
      for (const payload of [
        { sub: donor.id },
        { sub: admin.id, kind: 'root' },
      ]) {
        const token = await jwt.signAsync(payload, { expiresIn: '7d' });
        const refused = await graphql('{ me { id } }')
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
        expect(answer(refused).errors?.[0].extensions.code).toBe(
          'UNAUTHENTICATED',
        );
      }
    });

    it('lets anyone sign in as a donor, given or not, and answers them all alike', async () => {
      await give();
      // the donor, someone who has never given, and an admin who has not either
      const asked = [DONOR, 'stranger@example.com', ADMIN];
      const answers = [];
      const codes = new Map<string, string>();
      for (const [i, email] of asked.entries()) {
        const before = mailer.signIns().length;
        const res = await askAsDonor(email, `203.0.113.6${i}`);
        answers.push({ status: res.status, body: res.body as unknown });
        expect((await mailFollows(before)).to).toBe(email);
        codes.set(email, mailer.code());
      }
      expect(answers[0]).toEqual({ status: 202, body: { sent: true } });
      expect(answers[1]).toEqual(answers[0]);
      expect(answers[2]).toEqual(answers[0]);

      // the stranger signs in with the code, and has given nothing yet
      const signedIn = await verify(
        {
          email: 'stranger@example.com',
          code: codes.get('stranger@example.com'),
          purpose: 'donor',
        },
        '203.0.113.68',
      ).expect(200);
      const session = signedIn.body as {
        accessToken: string;
        donor: { email: string };
      };
      expect(session.donor.email).toBe('stranger@example.com');
      const theirs = await graphql(
        '{ myGiving { displayName projectCents cities { slug } } }',
      )
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);
      expect(
        (theirs.body as { data: { myGiving: unknown } }).data.myGiving,
      ).toEqual({ displayName: null, projectCents: 0, cities: [] });

      // and a wrong code is refused alike, the donor's or the stranger's
      const right = codes.get(DONOR) ?? '';
      const wrong = right === '000000' ? '111111' : '000000';
      const refusals = [];
      for (const [i, email] of asked.slice(0, 2).entries()) {
        const res = await verify(
          { email, code: wrong, purpose: 'donor' },
          `203.0.113.6${i}`,
        );
        refusals.push({ status: res.status, body: res.body as unknown });
      }
      expect(refusals[0].status).toBe(401);
      expect(refusals[1]).toEqual(refusals[0]);
    });
  });

  describe('lists to hear when a city is built', () => {
    const MY_LISTS =
      '{ myLists { newCities donated cities { slug name status raisedCents goalCents waiting } } }';
    const JOIN =
      'mutation ($input: ListInput!) { joinList(input: $input) { newCities cities { slug waiting } } }';
    const LEAVE =
      'mutation ($input: ListInput!) { leaveList(input: $input) { newCities cities { slug waiting } } }';
    const LEAVE_TOKEN =
      'mutation ($input: LeaveListWithTokenInput!) { leaveListWithToken(input: $input) }';
    const LIST_COUNTS =
      '{ listCounts { newCities cities { slug name waiting } } }';
    const WAITING = '{ cityMilestones { slug waiting } }';
    let ip = 130;

    /** A donor's session, signed in the way a person does. */
    const signInDonor = async (email: string) => {
      const from = `203.0.113.${ip++}`;
      const before = mailer.signIns().length;
      await post('/api/auth/magic-link', {
        email,
        returnUrl: 'https://example.com/',
        purpose: 'donor',
      })
        .set('x-forwarded-for', from)
        .expect(202);
      await vi.waitFor(() => expect(mailer.signIns()).toHaveLength(before + 1));
      const res = await post('/api/auth/verify', { token: mailer.token() })
        .set('x-forwarded-for', from)
        .expect(200);
      return res.body as { accessToken: string; donor: { id: string } };
    };
    const asDonor = (
      token: string,
      query: string,
      variables?: Record<string, unknown>,
    ) =>
      graphql(query, variables)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

    it('magic-link with a list, then verify, then myLists shows the list', async () => {
      await prisma.city.create({
        data: { slug: 'lisbon', name: 'Lisbon', goalCents: 3000 },
      });
      const from = `203.0.113.${ip++}`;
      const before = mailer.signIns().length;
      await post('/api/auth/magic-link', {
        email: 'vera@example.com',
        returnUrl: 'https://example.com/',
        purpose: 'donor',
        list: 'lisbon',
      })
        .set('x-forwarded-for', from)
        .expect(202, { sent: true });
      await vi.waitFor(() => expect(mailer.signIns()).toHaveLength(before + 1));
      expect(mailer.signIns().at(-1)?.text).toContain('Lisbon');
      const res = await post('/api/auth/verify', { token: mailer.token() })
        .set('x-forwarded-for', from)
        .expect(200);
      const mine = await asDonor(
        (res.body as { accessToken: string }).accessToken,
        MY_LISTS,
      );
      expect(
        (
          mine.body as { data: { myLists: { cities: { slug: string }[] } } }
        ).data.myLists.cities.map((c) => c.slug),
      ).toEqual(['lisbon']);
    });

    it('POST /api/lists/unsubscribe with a good token leaves the list; with a bad one it answers 200 and changes nothing', async () => {
      const lisbon = await prisma.city.create({
        data: { slug: 'lisbon', name: 'Lisbon', goalCents: 3000 },
      });
      const { accessToken: token, donor } =
        await signInDonor('uma@example.com');
      await asDonor(token, JOIN, { input: { city: 'lisbon' } });
      await asDonor(token, JOIN, { input: {} });
      expect(await prisma.listMember.count()).toBe(2);
      const url = app
        .get(ListsService)
        .leaveUrls(donor.id, lisbon.id).unsubscribeUrl;
      const path = `/api/lists/unsubscribe?${url.split('?')[1]}`;
      for (let i = 0; i < 2; i++)
        await post(path, {})
          .set('x-forwarded-for', '203.0.113.200')
          .expect(200);
      expect(await prisma.listMember.count()).toBe(1);
      await post('/api/lists/unsubscribe?t=nonsense', {})
        .set('x-forwarded-for', '203.0.113.200')
        .expect(200);
      await post('/api/lists/unsubscribe', {})
        .set('x-forwarded-for', '203.0.113.200')
        .expect(200);
      expect(await prisma.listMember.count()).toBe(1);
    });

    it('a donor joins, sees, and leaves a list over GraphQL', async () => {
      await prisma.city.create({
        data: { slug: 'lisbon', name: 'Lisbon', goalCents: 3000 },
      });
      const { accessToken: token, donor } =
        await signInDonor('lia@example.com');
      const lisbon = { input: { city: 'lisbon' } };

      await asDonor(token, JOIN, lisbon);
      const twice = answer(await asDonor(token, JOIN, lisbon)) as unknown as {
        data: { joinList: { cities: { slug: string; waiting: number }[] } };
      };
      expect(twice.data.joinList.cities).toEqual([
        { slug: 'lisbon', waiting: 1 },
      ]);
      // twice is once: the database's own unique index says so
      expect(await prisma.listMember.count()).toBe(1);
      await asDonor(token, JOIN, { input: {} });
      expect(await prisma.listMember.count()).toBe(2);

      const mine = (await asDonor(token, MY_LISTS)).body as {
        data: { myLists: Record<string, unknown> };
      };
      expect(mine.data.myLists).toEqual({
        newCities: true,
        donated: [],
        cities: [
          {
            slug: 'lisbon',
            name: 'Lisbon',
            status: 'PROPOSED',
            raisedCents: 0,
            goalCents: 3000,
            waiting: 1,
          },
        ],
      });

      // a built city has no list to join
      await prisma.city.create({
        data: {
          slug: 'paris',
          name: 'Paris',
          goalCents: 3000,
          status: 'BUILT',
        },
      });
      const refused = await asDonor(token, JOIN, { input: { city: 'paris' } });
      expect(answer(refused).errors?.[0].extensions.code).toBe('BAD_REQUEST');

      // a leave link signed for the list works, twice, and one made up does not
      const lisbonId = (
        await prisma.city.findUniqueOrThrow({ where: { slug: 'lisbon' } })
      ).id;
      const signed = app
        .get(ListsService)
        .leaveUrls(donor.id, lisbonId)
        .leaveUrl.split('#t=')[1];
      for (let i = 0; i < 2; i++) {
        const left = await graphql(LEAVE_TOKEN, { input: { token: signed } });
        expect(
          (left.body as { data: { leaveListWithToken: boolean } }).data
            .leaveListWithToken,
        ).toBe(true);
      }
      expect(await prisma.listMember.count()).toBe(1);
      const forged = await graphql(LEAVE_TOKEN, {
        input: { token: `${donor.id}.*.AAAA`, all: true },
      });
      expect(
        (forged.body as { data: { leaveListWithToken: boolean } }).data
          .leaveListWithToken,
      ).toBe(false);
      expect(await prisma.listMember.count()).toBe(1);

      await asDonor(token, JOIN, lisbon);
      await asDonor(token, LEAVE, lisbon);
      await asDonor(token, LEAVE, { input: { city: '*' } });
      expect(await prisma.listMember.count()).toBe(0);

      // the admin sees the counts
      await asDonor(token, JOIN, lisbon);
      const counts = (await asAdmin(LIST_COUNTS)).body as {
        data: { listCounts: unknown };
      };
      expect(counts.data.listCounts).toEqual({
        newCities: 0,
        cities: [{ slug: 'lisbon', name: 'Lisbon', waiting: 1 }],
      });
      const asDonorCounts = await asDonor(token, LIST_COUNTS);
      expect(answer(asDonorCounts).errors?.[0].extensions.code).toBe(
        'FORBIDDEN',
      );
    });

    it("an admin's session is FORBIDDEN on joinList", async () => {
      const joined = await asAdmin(JOIN, { input: {} });
      expect(answer(joined).errors?.[0].extensions.code).toBe('FORBIDDEN');
      const anon = await graphql(JOIN, { input: {} }).expect(200);
      expect(answer(anon).errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('anyone gets cityMilestones with waiting', async () => {
      const lisbon = await prisma.city.create({
        data: { slug: 'lisbon', name: 'Lisbon', goalCents: 3000 },
      });
      await prisma.city.create({
        data: { slug: 'rome', name: 'Rome', goalCents: 3000 },
      });
      const donor = await prisma.donor.create({
        data: { email: 'mia@example.com' },
      });
      await prisma.listMember.create({
        data: { donorId: donor.id, cityId: lisbon.id, locale: 'en-US' },
      });
      const res = await graphql(WAITING).expect(200);
      expect(
        (res.body as { data: { cityMilestones: unknown } }).data.cityMilestones,
      ).toEqual([
        { slug: 'lisbon', waiting: 1 },
        { slug: 'rome', waiting: 0 },
      ]);
    });
  });

  describe('the donation funnel', () => {
    const visit = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const track = (
      n: number,
      step: string,
      world = 'tinynyc',
      locale: string | null = 'en-US',
    ) =>
      graphql(TRACK, { input: { visitId: visit(n), step, world, locale } }).set(
        'x-forwarded-for',
        '203.0.113.40',
      );

    it('takes a step from anyone, once per visit and world', async () => {
      for (const world of ['tinynyc', 'tinynyc', 'home']) {
        const res = await track(1, 'VISIT', world).expect(200);
        expect(answer(res).data.trackFunnelStep).toBe(true);
      }
      const events = await prisma.funnelEvent.findMany({
        orderBy: { world: 'asc' },
      });
      expect(events.map((event) => [event.step, event.world])).toEqual([
        ['VISIT', 'home'],
        ['VISIT', 'tinynyc'],
      ]);
      expect(events[0]).toMatchObject({ visitId: visit(1), locale: 'en-US' });
    });

    it('refuses a step that is not one, from a visit or a world that is not one', async () => {
      const good = { visitId: visit(1), step: 'VISIT', world: 'tinynyc' };
      for (const input of [
        { ...good, visitId: 'me' },
        { ...good, world: 'Tiny NYC' },
        { ...good, locale: 'fr-FR' },
      ]) {
        const res = await graphql(TRACK, { input }).expect(200);
        expect(answer(res).errors?.[0].extensions.code).toBe('BAD_REQUEST');
      }
      // a step the schema does not know never reaches the resolver
      await graphql(TRACK, { input: { ...good, step: 'PAID' } }).expect(400);
      expect(await prisma.funnelEvent.count()).toBe(0);
    });

    it('follows visits from the page to the paid donation, by world and by day', async () => {
      // five visits to New York, two of them by way of the front page, and one to Ribeirão Preto
      for (const n of [1, 2, 3, 4, 5]) await track(n, 'VISIT').expect(200);
      for (const n of [1, 2]) await track(n, 'VISIT', 'home').expect(200);
      await track(6, 'VISIT', 'tinyrao', 'pt-BR').expect(200);
      // three open the donate sign
      for (const n of [1, 2, 3]) await track(n, 'DONATE_OPENED').expect(200);
      // two go on to the checkout: the API notes that itself
      for (const n of [1, 2]) {
        const res = await graphql(CHECKOUT, {
          input: {
            city: 'Lisbon',
            amountCents: 2500,
            world: 'tinynyc',
            locale: 'en-US',
            returnUrl: 'https://example.com/tinynyc/',
            visitId: visit(n),
          },
        })
          .set('x-forwarded-for', '203.0.113.41')
          .expect(200);
        expect(answer(res).errors).toBeUndefined();
        expect(stripe.calls.at(-1)?.metadata).toMatchObject({
          visit_id: visit(n),
        });
      }
      // one pays, one comes back without paying
      await webhook({
        id: 'cs_funnel',
        amount: 2500,
        metadata: {
          app: 'tinyworlds',
          city: 'Lisbon',
          world: 'tinynyc',
          locale: 'en-US',
          visit_id: visit(1),
        },
      }).expect(200);
      await track(2, 'CHECKOUT_CANCELLED').expect(200);
      // and someone gives through the plain payment link: no visit, no world
      await webhook({
        id: 'cs_link',
        amount: 1000,
        metadata: { app: 'tinyworlds' },
      }).expect(200);

      const now = Date.now();
      const res = await asAdmin(FUNNEL, {
        input: {
          from: new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date(now + 60_000).toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
      });
      expect(answer(res).errors).toBeUndefined();
      const funnel = answer(res).data.donationFunnel;

      expect(funnel.timeZone).toBe('America/Sao_Paulo');
      // a visit counts once on the site, however many of its pages it saw
      expect(funnel.totals).toEqual({
        visits: 6,
        donateOpened: 3,
        checkoutStarted: 2,
        checkoutCancelled: 1,
        donations: 2,
        raisedCents: 3500,
      });
      expect(funnel.worlds).toEqual([
        {
          world: 'tinynyc',
          visits: 5,
          donateOpened: 3,
          checkoutStarted: 2,
          checkoutCancelled: 1,
          donations: 1,
          raisedCents: 2500,
        },
        {
          world: 'home',
          visits: 2,
          donateOpened: 0,
          checkoutStarted: 0,
          checkoutCancelled: 0,
          donations: 0,
          raisedCents: 0,
        },
        {
          world: 'tinyrao',
          visits: 1,
          donateOpened: 0,
          checkoutStarted: 0,
          checkoutCancelled: 0,
          donations: 0,
          raisedCents: 0,
        },
        {
          world: null,
          visits: 0,
          donateOpened: 0,
          checkoutStarted: 0,
          checkoutCancelled: 0,
          donations: 1,
          raisedCents: 1000,
        },
      ]);
      // every day of the period is there, and today has it all
      expect(funnel.days.length).toBeGreaterThanOrEqual(6);
      expect(funnel.days.at(-1)).toMatchObject({
        visits: 6,
        donateOpened: 3,
        checkoutStarted: 2,
        donations: 2,
        raisedCents: 3500,
      });
      expect(funnel.days[0]).toMatchObject({ visits: 0, donations: 0 });
      expect(funnel.recentDonations).toHaveLength(2);
      expect(funnel.recentDonations).toContainEqual(
        expect.objectContaining({
          amountCents: 2500,
          currency: 'usd',
          city: 'Lisbon',
          world: 'tinynyc',
          locale: 'en-US',
        }),
      );

      const donation = await prisma.donation.findUnique({
        where: { stripeSessionId: 'cs_funnel' },
      });
      expect(donation?.visitId).toBe(visit(1));
      const started = await prisma.funnelEvent.findFirst({
        where: { visitId: visit(1), step: 'CHECKOUT_STARTED' },
      });
      expect(started).toMatchObject({ city: 'Lisbon', amountCents: 2500 });
    });

    it('leaves out what happened outside the period asked for', async () => {
      await track(1, 'VISIT').expect(200);
      const res = await asAdmin(FUNNEL, {
        input: {
          from: '2020-01-01T00:00:00.000Z',
          to: '2020-01-08T00:00:00.000Z',
        },
      });
      const funnel = answer(res).data.donationFunnel;
      expect(funnel.timeZone).toBe('UTC');
      expect(funnel.totals.visits).toBe(0);
      expect(funnel.worlds).toEqual([]);
      expect(funnel.days.map((day) => day.day)).toEqual([
        '2020-01-01',
        '2020-01-02',
        '2020-01-03',
        '2020-01-04',
        '2020-01-05',
        '2020-01-06',
        '2020-01-07',
      ]);
    });

    it('refuses a period that makes no sense', async () => {
      for (const input of [
        { from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' },
        { from: '2024-01-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' },
        {
          ...{
            from: '2026-01-01T00:00:00.000Z',
            to: '2026-01-02T00:00:00.000Z',
          },
          timeZone: 'Mars/Olympus_Mons',
        },
      ]) {
        const res = await asAdmin(FUNNEL, { input });
        expect(answer(res).errors?.[0].extensions.code).toBe('BAD_REQUEST');
      }
    });
  });
  describe("each world's visits", () => {
    const visit = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const opens = (n: number, world: string) =>
      graphql(TRACK, {
        input: { visitId: visit(n), step: 'VISIT', world, locale: 'en-US' },
      })
        .set('x-forwarded-for', '203.0.113.50')
        .expect(200);
    const stillHere = (n: number, world: string) =>
      graphql(PRESENCE, { input: { visitId: visit(n), world } })
        .set('x-forwarded-for', '203.0.113.51')
        .expect(200);
    const visitsOf = async (worlds: string[]) =>
      answer(await graphql(WORLD_VISITS, { input: { worlds } }).expect(200))
        .data.worldVisits;
    /** Time passes (only as the API's clock tells it): past the counts kept in memory. */
    let clock = 0;
    const wait = (ms: number) => {
      clock += ms;
      vi.setSystemTime(clock);
    };

    beforeAll(() => {
      // from now, not from when the file was read: the thank-yous of the tests before counted
      // visits too, and their counts are kept in memory
      clock = Date.now();
    });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: clock });
      // every test counts afresh
      wait(CACHE_MS);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('counts every visit of each world asked for, and those exploring now', async () => {
      for (const n of [1, 2, 3]) await opens(n, 'tinynyc');
      await opens(4, 'tinyrao');
      await opens(1, 'home');
      // a visit from the page analytics' history, and one that left a while ago
      await prisma.funnelEvent.createMany({
        data: [
          { visitId: visit(5), step: 'VISIT', world: 'tinynyc' },
          {
            visitId: visit(6),
            step: 'VISIT',
            world: 'tinynyc',
            lastSeenAt: new Date(clock - LIVE_MS - 1_000),
          },
          { visitId: visit(2), step: 'DONATE_OPENED', world: 'tinynyc' },
        ],
      });
      expect(await visitsOf(['tinynyc', 'tinyrao', 'tinyfte'])).toEqual([
        { world: 'tinynyc', visits: 5, live: 3 },
        { world: 'tinyrao', visits: 1, live: 1 },
        { world: 'tinyfte', visits: 0, live: 0 },
      ]);
    });

    it('keeps a visit exploring while its map says it is still there', async () => {
      await opens(1, 'tinynyc');
      const opened = await prisma.funnelEvent.findFirstOrThrow();
      wait(LIVE_MS + 1_000);
      expect(await visitsOf(['tinynyc'])).toEqual([
        { world: 'tinynyc', visits: 1, live: 0 },
      ]);

      const res = await stillHere(1, 'tinynyc');
      expect(answer(res).data.trackPresence).toBe(true);
      wait(CACHE_MS);
      expect(await visitsOf(['tinynyc'])).toEqual([
        { world: 'tinynyc', visits: 1, live: 1 },
      ]);
      // the same visit, seen later: when it started stays, how long it stayed grows
      const seen = await prisma.funnelEvent.findMany();
      expect(seen).toHaveLength(1);
      expect(seen[0].createdAt).toEqual(opened.createdAt);
      expect(seen[0].lastSeenAt!.getTime()).toBe(clock - CACHE_MS);
    });

    it('counts a visit whose opening never arrived', async () => {
      await stillHere(7, 'tinylas');
      expect(await visitsOf(['tinylas'])).toEqual([
        { world: 'tinylas', visits: 1, live: 1 },
      ]);
    });

    it('refuses a visit or a world that is not one, and too many worlds at once', async () => {
      for (const input of [
        { visitId: 'me', world: 'tinynyc' },
        { visitId: visit(1), world: 'Tiny NYC' },
        { visitId: visit(1), world: 'tinynyc', locale: 'fr-FR' },
      ]) {
        const res = await graphql(PRESENCE, { input }).expect(200);
        expect(answer(res).errors?.[0].extensions.code).toBe('BAD_REQUEST');
      }
      expect(await prisma.funnelEvent.count()).toBe(0);

      for (const worlds of [
        [],
        ['tinynyc', 'Tiny NYC'],
        Array.from({ length: 51 }, (_, i) => `tiny${i}`),
      ]) {
        const res = await graphql(WORLD_VISITS, {
          input: { worlds },
        }).expect(200);
        expect(answer(res).errors?.[0].extensions.code).toBe('BAD_REQUEST');
      }
    });
  });

  describe('benefactors', () => {
    const BENEFACTORS = `query ($input: CityBenefactorsInput!) { cityBenefactors(input: $input) {
      slug name status worldId goalCents raisedCents stones benefactorCount
      founders { number name amountCents stones firstStone keystone }
      benefactors { rank name amountCents } } }`;
    const gift = (
      id: string,
      amount: number,
      email: string,
      name?: string,
      city = 'Lisbon',
    ) =>
      webhook({
        id,
        amount,
        email,
        metadata: {
          app: 'tinyworlds',
          city,
          world: 'tinynyc',
          locale: 'en-US',
          ...(name ? { benefactor_name: name } : {}),
        },
      }).expect(200);
    const seedLisbon = async () => {
      await gift('cs_1', 1200, 'ana@example.com', 'Ana');
      await gift('cs_2', 8800, 'bo@example.com');
      await gift('cs_3', 3000, 'ana@example.com', 'Ana');
    };

    it("answers a city's stones, founders and benefactors, with names only for listed gifts", async () => {
      await seedLisbon();
      const res = await graphql(BENEFACTORS, {
        input: { slug: 'lisbon' },
      }).expect(200);
      const body = res.body as {
        data: {
          cityBenefactors: {
            slug: string;
            benefactorCount: number;
            founders: unknown[];
            benefactors: unknown[];
            stones: (number | null)[];
          };
        };
      };
      const city = body.data.cityBenefactors;
      expect(city.slug).toBe('lisbon');
      // Ana gave twice: two people
      expect(city.benefactorCount).toBe(2);
      expect(city.founders).toEqual([
        {
          number: 1,
          name: 'Ana',
          amountCents: 1200,
          stones: 12,
          firstStone: true,
          keystone: false,
        },
        {
          number: 2,
          name: null,
          amountCents: 8800,
          stones: 88,
          firstStone: false,
          keystone: true,
        },
      ]);
      expect(city.benefactors).toEqual([]);
      expect(city.stones).toHaveLength(100);
      expect(city.stones[0]).toBe(1);
      expect(city.stones[99]).toBe(2);
      expect(JSON.stringify(res.body)).not.toContain('example.com');
    });

    it('lays no stone, founds nothing and lists no one for a gift in another currency', async () => {
      await webhook({
        id: 'cs_eur',
        amount: 5000,
        currency: 'eur',
        email: 'eu@example.com',
        metadata: {
          app: 'tinyworlds',
          city: 'Lisbon',
          world: 'tinynyc',
          locale: 'en-US',
          benefactor_name: 'Eva',
        },
      }).expect(200);
      const res = await graphql(BENEFACTORS, {
        input: { slug: 'lisbon' },
      }).expect(200);
      const city = (
        res.body as {
          data: {
            cityBenefactors: {
              founders: unknown[];
              benefactors: unknown[];
              benefactorCount: number;
              stones: (number | null)[];
            };
          };
        }
      ).data.cityBenefactors;
      expect(city.founders).toEqual([]);
      expect(city.benefactors).toEqual([]);
      expect(city.benefactorCount).toBe(0);
      expect(city.stones.every((s) => s === null)).toBe(true);
    });

    it('finds a built city by its world', async () => {
      await prisma.city.create({
        data: {
          slug: 'new-york',
          name: 'New York',
          status: 'BUILT',
          worldId: 'tinynyc',
          goalCents: 10_000,
        },
      });
      const res = await graphql(BENEFACTORS, {
        input: { world: 'tinynyc' },
      }).expect(200);
      const city = (
        res.body as {
          data: { cityBenefactors: { slug: string; founders: unknown[] } };
        }
      ).data.cityBenefactors;
      expect(city.slug).toBe('new-york');
      expect(city.founders).toEqual([]);
    });

    it('says null for a hidden city and for one that does not exist', async () => {
      await prisma.city.create({
        data: {
          slug: 'hidden-one',
          name: 'Hidden one',
          hidden: true,
          goalCents: 10_000,
        },
      });
      for (const input of [{ slug: 'hidden-one' }, { slug: 'nowhere' }]) {
        const res = await graphql(BENEFACTORS, { input }).expect(200);
        const body = res.body as {
          data: { cityBenefactors: unknown };
          errors?: unknown;
        };
        expect(body.errors).toBeUndefined();
        expect(body.data.cityBenefactors).toBeNull();
      }
    });

    it('refuses both a slug and a world, and neither', async () => {
      for (const input of [{ slug: 'lisbon', world: 'tinynyc' }, {}]) {
        const res = await graphql(BENEFACTORS, { input }).expect(200);
        expect(answer(res).errors?.[0].extensions.code).toBe('BAD_REQUEST');
      }
    });

    describe("a donor's own giving", () => {
      const MINE = `{ myGiving { displayName projectCents
        cities { slug name givenCents founderNumber stones firstStone keystone listed } } }`;
      const SET_LISTING =
        'mutation ($input: SetListingInput!) { setListing(input: $input) }';
      const SET_NAME =
        'mutation ($input: SetDisplayNameInput!) { setDisplayName(input: $input) }';
      let ip = 60;
      /** Her session within a test: a link is sent once a minute, so it is asked for once. */
      let token: string | null = null;
      beforeEach(() => {
        token = null;
      });
      /** Ana's session, signed in the way a person does: ask for a link, open it. */
      const signInAna = async () => {
        const from = `203.0.113.${ip++}`;
        const before = mailer.signIns().length;
        await post('/api/auth/magic-link', {
          email: 'ana@example.com',
          returnUrl: 'https://example.com/',
          purpose: 'donor',
        })
          .set('x-forwarded-for', from)
          .expect(202);
        await vi.waitFor(() =>
          expect(mailer.signIns()).toHaveLength(before + 1),
        );
        const res = await post('/api/auth/verify', { token: mailer.token() })
          .set('x-forwarded-for', from)
          .expect(200);
        return (res.body as { accessToken: string }).accessToken;
      };
      const asAna = async (
        query: string,
        variables?: Record<string, unknown>,
      ) => {
        token ??= await signInAna();
        return graphql(query, variables)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      };
      const mine = async () =>
        (
          (await asAna(MINE)).body as {
            data: {
              myGiving: {
                displayName: string | null;
                projectCents: number;
                cities: Record<string, unknown>[];
              };
            };
          }
        ).data.myGiving;
      const publicRow1 = async () => {
        const res = await graphql(BENEFACTORS, {
          input: { slug: 'lisbon' },
        }).expect(200);
        return (
          res.body as {
            data: { cityBenefactors: { founders: { name: string | null }[] } };
          }
        ).data.cityBenefactors.founders[0];
      };

      it('a donor sees their cities, titles and stones', async () => {
        await seedLisbon();
        await gift('cs_4', 700, 'ana@example.com', undefined, 'Porto');
        await gift('cs_5', 300, 'ana@example.com', undefined, '');
        const giving = await mine();
        expect(giving.displayName).toBe('Ana');
        expect(giving.projectCents).toBe(300);
        expect(giving.cities.map((c) => c.slug)).toEqual(['porto', 'lisbon']);
        expect(giving.cities[1]).toEqual({
          slug: 'lisbon',
          name: 'Lisbon',
          givenCents: 4200,
          founderNumber: 1,
          stones: Array.from({ length: 12 }, (_, i) => i + 1),
          firstStone: true,
          keystone: false,
          listed: true,
        });
        expect(JSON.stringify(giving)).not.toContain('example.com');
      });

      it("switching a city's listing changes every gift there", async () => {
        await seedLisbon();
        expect((await publicRow1()).name).toBe('Ana');
        const res = await asAna(SET_LISTING, {
          input: { city: 'lisbon', listed: false },
        });
        expect(answer(res).errors).toBeUndefined();
        expect((await publicRow1()).name).toBeNull();
        const gifts = await prisma.donation.findMany({
          where: { donor: { email: 'ana@example.com' } },
        });
        expect(gifts).toHaveLength(2);
        expect(gifts.every((d) => !d.listed)).toBe(true);
        expect((await mine()).cities[0].listed).toBe(false);
      });

      it('listing needs a name first', async () => {
        await gift('cs_1', 1200, 'ana@example.com');
        const res = await asAna(SET_LISTING, {
          input: { city: 'lisbon', listed: true },
        });
        expect(answer(res).errors?.[0].extensions.code).toBe('BAD_REQUEST');
      });

      it("listing acts only on the donor's own gifts, in a city they gave to", async () => {
        await seedLisbon();
        const gifts = (email: string) =>
          prisma.donation.findMany({ where: { donor: { email } } });
        // Bo is listed for his gift, so there is something for a stray update to undo
        await prisma.donation.updateMany({
          where: { donor: { email: 'bo@example.com' } },
          data: { listed: true },
        });
        await asAna(SET_LISTING, { input: { city: 'lisbon', listed: false } });
        expect((await gifts('ana@example.com')).map((d) => d.listed)).toEqual([
          false,
          false,
        ]);
        expect((await gifts('bo@example.com')).map((d) => d.listed)).toEqual([
          true,
        ]);
        // and listing hers does not list the gift of someone who never asked
        await prisma.donation.updateMany({
          where: { donor: { email: 'bo@example.com' } },
          data: { listed: false },
        });
        await asAna(SET_LISTING, { input: { city: 'lisbon', listed: true } });
        expect((await gifts('ana@example.com')).map((d) => d.listed)).toEqual([
          true,
          true,
        ]);
        expect((await gifts('bo@example.com')).map((d) => d.listed)).toEqual([
          false,
        ]);
        const res = await asAna(SET_LISTING, {
          input: { city: 'nowhere', listed: false },
        });
        expect(answer(res).errors?.[0].extensions.code).toBe('BAD_REQUEST');
      });

      it('a city an admin hid still shows on its own donor page, and can be listed', async () => {
        await seedLisbon();
        await prisma.city.update({
          where: { slug: 'lisbon' },
          data: { hidden: true },
        });
        const cities = (await mine()).cities;
        expect(cities.map((c) => c.slug)).toEqual(['lisbon']);
        const res = await graphql(BENEFACTORS, {
          input: { slug: 'lisbon' },
        }).expect(200);
        expect(
          (res.body as { data: { cityBenefactors: unknown } }).data
            .cityBenefactors,
        ).toBeNull();
        const set = await asAna(SET_LISTING, {
          input: { city: 'lisbon', listed: false },
        });
        expect(answer(set).errors).toBeUndefined();
        expect((await mine()).cities[0].listed).toBe(false);
      });

      it('a name is cleaned and used everywhere', async () => {
        await seedLisbon();
        const res = await asAna(SET_NAME, { input: { name: '  Ana  B ' } });
        expect((res.body as { data: { setDisplayName: string } }).data).toEqual(
          { setDisplayName: 'Ana B' },
        );
        expect((await publicRow1()).name).toBe('Ana B');
        expect((await mine()).displayName).toBe('Ana B');
        const bad = await asAna(SET_NAME, { input: { name: ' ​ ' } });
        expect(answer(bad).errors?.[0].extensions.code).toBe('BAD_REQUEST');
      });

      it('an admin session is refused by a donor query', async () => {
        for (const query of [
          MINE,
          'mutation { setDisplayName(input: { name: "x" }) }',
        ]) {
          const res = await asAdmin(query);
          expect(answer(res).errors?.[0].extensions.code).toBe('FORBIDDEN');
        }
      });
    });

    describe('names, for admins', () => {
      const NAMES =
        '{ benefactorNames { donorId name hidden cities lastGiftAt } }';
      const HIDE =
        'mutation ($input: SetNameHiddenInput!) { setNameHidden(input: $input) }';
      type Names = {
        data: {
          benefactorNames: {
            donorId: string;
            name: string;
            hidden: boolean;
            cities: string[];
            lastGiftAt: string;
          }[];
        };
      };

      it('an admin lists names and hides one', async () => {
        await seedLisbon();
        const listed = (await asAdmin(NAMES)).body as Names;
        expect(listed.data.benefactorNames).toHaveLength(1);
        const row = listed.data.benefactorNames[0];
        expect(row).toMatchObject({
          name: 'Ana',
          hidden: false,
          cities: ['Lisbon'],
        });
        expect(JSON.stringify(listed)).not.toContain('example.com');

        const res = await asAdmin(HIDE, {
          input: { donorId: row.donorId, hidden: true },
        });
        expect(answer(res).errors).toBeUndefined();
        const after = (await asAdmin(NAMES)).body as Names;
        expect(after.data.benefactorNames[0]).toMatchObject({ hidden: true });

        const founders = (
          (
            await graphql(BENEFACTORS, { input: { slug: 'lisbon' } }).expect(
              200,
            )
          ).body as {
            data: { cityBenefactors: { founders: { name: string | null }[] } };
          }
        ).data.cityBenefactors.founders;
        expect(founders[0].name).toBeNull();
      });

      it('a donor cannot list or hide names', async () => {
        await seedLisbon();
        const from = '203.0.113.90';
        const before = mailer.signIns().length;
        await post('/api/auth/magic-link', {
          email: 'ana@example.com',
          returnUrl: 'https://example.com/',
          purpose: 'donor',
        })
          .set('x-forwarded-for', from)
          .expect(202);
        await vi.waitFor(() =>
          expect(mailer.signIns()).toHaveLength(before + 1),
        );
        const res = await post('/api/auth/verify', { token: mailer.token() })
          .set('x-forwarded-for', from)
          .expect(200);
        const { accessToken, donor } = res.body as {
          accessToken: string;
          donor: { id: string };
        };
        for (const [query, variables] of [
          [NAMES, undefined],
          [HIDE, { input: { donorId: donor.id, hidden: true } }],
        ] as const) {
          const out = await graphql(query, variables)
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);
          expect(answer(out).errors?.[0].extensions.code).toBe('FORBIDDEN');
        }
      });
    });

    describe('links', () => {
      const LINK = 'url title description icon image';
      const MY_LINKS = `{ myLinks { max givenCents picturesFromCents hidden links { id ${LINK} } } }`;
      const ADD = `mutation ($input: AddLinkInput!) { addLink(input: $input) { id ${LINK} } }`;
      const REMOVE =
        'mutation ($input: LinkIdInput!) { removeLink(input: $input) }';
      const REFRESH = `mutation ($input: LinkIdInput!) { refreshLink(input: $input) { id ${LINK} } }`;
      const HIDE_LINKS =
        'mutation ($input: SetLinksHiddenInput!) { setLinksHidden(input: $input) }';
      const WALL = `{ benefactorWall { name amountCents lastGiftAt
        cities { slug name worldId } links { ${LINK} } } }`;
      const ROWS = `query ($input: CityBenefactorsInput!) { cityBenefactors(input: $input) {
        founders { number name links { ${LINK} } }
        benefactors { rank name links { ${LINK} } } } }`;
      const SHOP = 'https://shop.example.com/';

      interface Link {
        id: string;
        url: string;
        title: string;
        description: string | null;
        icon: string | null;
        image: string | null;
      }
      interface Row {
        name: string | null;
        links: Omit<Link, 'id'>[];
      }
      interface Linked {
        data: {
          myLinks: {
            max: number;
            givenCents: number;
            picturesFromCents: number;
            hidden: boolean;
            links: Link[];
          };
          addLink: Link;
          refreshLink: Link;
          removeLink: boolean;
          cityBenefactors: { founders: Row[]; benefactors: Row[] };
          benefactorWall: (Row & {
            amountCents: number;
            cities: { slug: string; name: string; worldId: string | null }[];
          })[];
        };
        errors?: { message: string; extensions: { code: string } }[];
      }
      const linked = (res: { body: unknown }) => res.body as Linked;

      let card: Drawn;
      let icon: Drawn;
      let ip = 120;
      beforeAll(async () => {
        const webp = async (width: number, height: number): Promise<Drawn> => ({
          bytes: await sharp({
            create: {
              width,
              height,
              channels: 3,
              background: { r: 247, g: 194, b: 27 },
            },
          })
            .webp()
            .toBuffer(),
          width,
          height,
        });
        card = await webp(480, 252);
        icon = await webp(64, 64);
      });
      beforeEach(() => {
        reader.pages.set(SHOP, {
          title: 'A tiny shop',
          description: 'Prints and postcards',
          icon,
          picture: card,
        });
      });

      /** A donor's session, the way a person gets one; each from an address of its own. */
      const signInDonor = async (email: string) => {
        const from = `203.0.113.${ip++}`;
        const before = mailer.signIns().length;
        await post('/api/auth/magic-link', {
          email,
          returnUrl: 'https://example.com/',
          purpose: 'donor',
        })
          .set('x-forwarded-for', from)
          .expect(202);
        await vi.waitFor(() =>
          expect(mailer.signIns()).toHaveLength(before + 1),
        );
        const res = await post('/api/auth/verify', { token: mailer.token() })
          .set('x-forwarded-for', from)
          .expect(200);
        const { accessToken, donor } = res.body as {
          accessToken: string;
          donor: { id: string };
        };
        const ask = (query: string, variables?: Record<string, unknown>) =>
          graphql(query, variables)
            .set('Authorization', `Bearer ${accessToken}`)
            .set('x-forwarded-for', from)
            .expect(200);
        return { ask, id: donor.id };
      };
      const rowsOf = async (slug = 'lisbon') =>
        linked(await graphql(ROWS, { input: { slug } }).expect(200)).data
          .cityBenefactors;
      const wall = async () =>
        linked(await graphql(WALL).expect(200)).data.benefactorWall;

      it('a donor adds a link, and its page is read once', async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        const added = linked(
          await ana.ask(ADD, { input: { url: 'shop.example.com#top' } }),
        );
        expect(added.errors).toBeUndefined();
        expect(added.data.addLink).toMatchObject({
          url: SHOP,
          title: 'A tiny shop',
          description: 'Prints and postcards',
          icon: expect.stringMatching(
            /^\/api\/link-images\/[0-9a-f-]{36}$/,
          ) as string,
          image: expect.stringMatching(
            /^\/api\/link-images\/[0-9a-f-]{36}$/,
          ) as string,
        });
        expect(reader.asked).toEqual([SHOP]);

        const mine = linked(await ana.ask(MY_LINKS)).data.myLinks;
        expect(mine).toEqual({
          max: 3,
          givenCents: 4200,
          picturesFromCents: 1000,
          hidden: false,
          links: [added.data.addLink],
        });
        // reading the list reads no page
        expect(reader.asked).toEqual([SHOP]);
      });

      it("serves the copies it keeps of a link's pictures, for good", async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        const { icon: iconPath, image } = linked(
          await ana.ask(ADD, { input: { url: SHOP } }),
        ).data.addLink;
        const res = await request(app.getHttpServer())
          .get(image as string)
          .buffer(true)
          .parse((response, done) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () => done(null, Buffer.concat(chunks)));
          })
          .expect(200);
        expect(res.headers['content-type']).toBe('image/webp');
        expect(res.headers['cache-control']).toBe(
          'public, max-age=31536000, immutable',
        );
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect((res.body as Buffer).equals(card.bytes)).toBe(true);
        await request(app.getHttpServer())
          .get(iconPath as string)
          .expect(200);

        await request(app.getHttpServer())
          .get('/api/link-images/3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b')
          .expect(404);
        await request(app.getHttpServer())
          .get('/api/link-images/not-an-id')
          .expect(400);
      });

      it('keeps a link whose page is away, under its own name', async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        const added = linked(
          await ana.ask(ADD, {
            input: { url: 'https://www.example.org/in/ana/' },
          }),
        );
        expect(added.data.addLink).toMatchObject({
          url: 'https://www.example.org/in/ana/',
          title: 'example.org/in/ana',
          description: null,
          icon: null,
          image: null,
        });
      });

      it.each([
        ['another scheme', 'javascript:alert(1)'],
        ['an address', 'https://127.0.0.1/'],
        ['a private address', 'http://10.0.0.1/admin'],
        ['the metadata service', 'http://169.254.169.254/latest/'],
        ['a service on the same network', 'https://postgres/'],
        ['a port', 'https://example.com:5432/'],
        ['nothing', ' '],
      ])('refuses %s, and asks for nothing', async (_what, url) => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        const res = linked(await ana.ask(ADD, { input: { url } }));
        expect(res.errors?.[0].extensions.code).toBe('BAD_REQUEST');
        expect(reader.asked).toEqual([]);
        expect(await prisma.donorLink.count()).toBe(0);
      });

      it('lets a donor have three links, each once', async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        for (const n of [1, 2, 3]) {
          const res = linked(
            await ana.ask(ADD, { input: { url: `https://example.com/${n}` } }),
          );
          expect(res.errors).toBeUndefined();
        }
        const again = linked(
          await ana.ask(ADD, { input: { url: 'http://example.com/2#x' } }),
        );
        expect(again.errors?.[0]).toMatchObject({
          message: 'That link is already there',
          extensions: { code: 'BAD_REQUEST' },
        });
        const fourth = linked(
          await ana.ask(ADD, { input: { url: 'https://example.com/4' } }),
        );
        expect(fourth.errors?.[0]).toMatchObject({
          message: 'No more than 3 links',
          extensions: { code: 'BAD_REQUEST' },
        });
        // neither was read: the answer was known before asking
        expect(reader.asked).toHaveLength(3);
        const { links } = linked(await ana.ask(MY_LINKS)).data.myLinks;
        expect(links.map((link) => link.url)).toEqual([
          'https://example.com/1',
          'https://example.com/2',
          'https://example.com/3',
        ]);
      });

      it('keeps the third link the third when two are added at once', async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        for (const n of [1, 2])
          await ana.ask(ADD, { input: { url: `https://example.com/${n}` } });
        const both = await Promise.all(
          ['a', 'b'].map((n) =>
            ana.ask(ADD, { input: { url: `https://example.com/${n}` } }),
          ),
        );
        expect(
          both.filter((res) => linked(res).errors === undefined),
        ).toHaveLength(1);
        expect(await prisma.donorLink.count()).toBe(3);
      });

      it('is for those who have given', async () => {
        const nobody = await signInDonor('new@example.com');
        const res = linked(await nobody.ask(ADD, { input: { url: SHOP } }));
        expect(res.errors?.[0]).toMatchObject({
          message: 'Links are for those who have given',
          extensions: { code: 'BAD_REQUEST' },
        });
        expect(reader.asked).toEqual([]);
        expect(linked(await nobody.ask(MY_LINKS)).data.myLinks).toMatchObject({
          givenCents: 0,
          links: [],
        });
      });

      it('is for donors: not for a visitor, not for an admin', async () => {
        for (const [query, variables] of [
          [MY_LINKS, undefined],
          [ADD, { input: { url: SHOP } }],
          [REMOVE, { input: { id: '3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b' } }],
          [REFRESH, { input: { id: '3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b' } }],
        ] as const) {
          const anyone = await graphql(query, variables).expect(200);
          expect(answer(anyone).errors?.[0].extensions.code).toBe(
            'UNAUTHENTICATED',
          );
          const admin = await asAdmin(query, variables);
          expect(answer(admin).errors?.[0].extensions.code).toBe('FORBIDDEN');
        }
        expect(reader.asked).toEqual([]);
      });

      it("shows a donor's links where their name shows, and nowhere else", async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        await ana.ask(ADD, { input: { url: SHOP } });
        // Bo gave without a name: a link of his shows nowhere
        const bo = await signInDonor('bo@example.com');
        await bo.ask(ADD, { input: { url: 'https://bo.example.com/' } });

        const { founders } = await rowsOf();
        expect(founders).toEqual([
          {
            number: 1,
            name: 'Ana',
            links: [
              {
                url: SHOP,
                title: 'A tiny shop',
                description: 'Prints and postcards',
                icon: expect.stringContaining('/api/link-images/') as string,
                image: expect.stringContaining('/api/link-images/') as string,
              },
            ],
          },
          { number: 2, name: null, links: [] },
        ]);

        // unlisted, Ana is one more unnamed row: her link goes with her name
        await ana.ask(
          'mutation { setListing(input: { city: "lisbon", listed: false }) }',
        );
        const unlisted = await rowsOf();
        expect(unlisted.founders.every((row) => row.name === null)).toBe(true);
        expect(
          [...unlisted.founders, ...unlisted.benefactors].flatMap(
            (row) => row.links,
          ),
        ).toEqual([]);
      });

      it("shows a link's picture from ten dollars given", async () => {
        await gift('cs_cy1', 600, 'cy@example.com', 'Cy', 'Porto');
        const cy = await signInDonor('cy@example.com');
        await cy.ask(ADD, { input: { url: SHOP } });
        const under = (await rowsOf('porto')).founders[0];
        expect(under.links[0]).toMatchObject({
          title: 'A tiny shop',
          icon: expect.any(String) as string,
          image: null,
        });
        // their own page shows it all the same, with what is missing
        const mine = linked(await cy.ask(MY_LINKS)).data.myLinks;
        expect(mine).toMatchObject({
          givenCents: 600,
          picturesFromCents: 1000,
        });
        expect(mine.links[0].image).toEqual(expect.any(String));

        // four dollars more, to nothing in particular: it is what they gave in all that counts
        await gift('cs_cy2', 400, 'cy@example.com', undefined, '');
        const over = (await rowsOf('porto')).founders[0];
        expect(over.links[0].image).toBe(mine.links[0].image);
        expect((await wall())[0].links[0].image).toBe(mine.links[0].image);
      });

      it('an admin sees the links to review, and hides them without the name', async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        await ana.ask(ADD, { input: { url: SHOP } });

        const NAMES = `{ benefactorNames { donorId name linksHidden links { ${LINK} } } }`;
        type Names = {
          data: {
            benefactorNames: {
              donorId: string;
              name: string;
              linksHidden: boolean;
              links: Omit<Link, 'id'>[];
            }[];
          };
        };
        const [row] = ((await asAdmin(NAMES)).body as Names).data
          .benefactorNames;
        expect(row).toMatchObject({
          name: 'Ana',
          linksHidden: false,
          links: [{ url: SHOP, title: 'A tiny shop' }],
        });

        const hidden = await asAdmin(HIDE_LINKS, {
          input: { donorId: row.donorId, hidden: true },
        });
        expect(answer(hidden).errors).toBeUndefined();
        expect((await rowsOf()).founders[0]).toEqual({
          number: 1,
          name: 'Ana',
          links: [],
        });
        expect((await wall()).flatMap((entry) => entry.links)).toEqual([]);
        // the admin still sees what is hidden, and the donor is told
        const [after] = ((await asAdmin(NAMES)).body as Names).data
          .benefactorNames;
        expect(after).toMatchObject({ linksHidden: true });
        expect(after.links).toHaveLength(1);
        expect(linked(await ana.ask(MY_LINKS)).data.myLinks).toMatchObject({
          hidden: true,
        });

        await asAdmin(HIDE_LINKS, {
          input: { donorId: row.donorId, hidden: false },
        });
        expect((await rowsOf()).founders[0].links).toHaveLength(1);

        // a donor cannot hide anyone's links, their own included
        const refused = await ana.ask(HIDE_LINKS, {
          input: { donorId: row.donorId, hidden: true },
        });
        expect(answer(refused).errors?.[0].extensions.code).toBe('FORBIDDEN');
      });

      it('shows no link under a name an admin hid', async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        await ana.ask(ADD, { input: { url: SHOP } });
        await prisma.donor.update({
          where: { email: 'ana@example.com' },
          data: { nameHidden: true },
        });
        const rows = await rowsOf();
        expect(
          [...rows.founders, ...rows.benefactors].flatMap((row) => row.links),
        ).toEqual([]);
        expect((await wall()).every((entry) => entry.name === null)).toBe(true);
        expect((await wall()).flatMap((entry) => entry.links)).toEqual([]);
      });

      it('takes a link away with its pictures, and only its own donor may', async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        const { id, image } = linked(
          await ana.ask(ADD, { input: { url: SHOP } }),
        ).data.addLink;

        const bo = await signInDonor('bo@example.com');
        const notHis = linked(await bo.ask(REMOVE, { input: { id } }));
        expect(notHis.errors?.[0].extensions.code).toBe('BAD_REQUEST');
        const notHisEither = linked(await bo.ask(REFRESH, { input: { id } }));
        expect(notHisEither.errors?.[0].extensions.code).toBe('BAD_REQUEST');
        expect(await prisma.donorLink.count()).toBe(1);

        const gone = linked(await ana.ask(REMOVE, { input: { id } }));
        expect(gone.data.removeLink).toBe(true);
        expect(linked(await ana.ask(MY_LINKS)).data.myLinks.links).toEqual([]);
        expect((await rowsOf()).founders[0].links).toEqual([]);
        await request(app.getHttpServer())
          .get(image as string)
          .expect(404);
        expect(await prisma.linkImage.count()).toBe(0);
      });

      it('reads a page again when its donor asks, and keeps the old reading when it is away', async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        const first = linked(await ana.ask(ADD, { input: { url: SHOP } })).data
          .addLink;

        reader.pages.set(SHOP, { title: 'A bigger shop', icon });
        const again = linked(
          await ana.ask(REFRESH, { input: { id: first.id } }),
        ).data.refreshLink;
        expect(again).toMatchObject({
          id: first.id,
          title: 'A bigger shop',
          description: null,
          image: null,
        });
        // a new reading, a new address: what a browser kept of the old one is never wrong
        expect(again.icon).not.toBe(first.icon);
        await request(app.getHttpServer())
          .get(first.icon as string)
          .expect(404);
        await request(app.getHttpServer())
          .get(again.icon as string)
          .expect(200);

        reader.pages.delete(SHOP);
        const away = linked(
          await ana.ask(REFRESH, { input: { id: first.id } }),
        );
        expect(away.errors?.[0].message).toBe('The page did not answer');
        expect(linked(await ana.ask(MY_LINKS)).data.myLinks.links[0]).toEqual(
          again,
        );
      });

      it('reads a page again no more than ten times a minute for one address', async () => {
        await seedLisbon();
        const ana = await signInDonor('ana@example.com');
        const { id } = linked(await ana.ask(ADD, { input: { url: SHOP } })).data
          .addLink;
        for (let n = 0; n < 10; n++) {
          const res = linked(await ana.ask(REFRESH, { input: { id } }));
          expect(res.errors).toBeUndefined();
        }
        const eleventh = linked(await ana.ask(REFRESH, { input: { id } }));
        expect(eleventh.errors?.[0].message).toMatch(/Too Many Requests/);
        // the page was read to add the link, ten times more, and not an eleventh
        expect(reader.asked).toHaveLength(11);
      });

      describe('the wall', () => {
        it('lists everyone who gave to a city: the named once, the unnamed as they gave', async () => {
          await seedLisbon();
          await gift('cs_4', 700, 'ana@example.com', 'Ana', 'Porto');
          await gift('cs_5', 2500, 'cy@example.com', undefined, 'Porto');
          await prisma.city.update({
            where: { slug: 'porto' },
            data: { status: 'BUILT', worldId: 'tinyopo' },
          });
          const ana = await signInDonor('ana@example.com');
          await ana.ask(ADD, { input: { url: SHOP } });

          const res = await graphql(WALL).expect(200);
          const lisbon = { slug: 'lisbon', name: 'Lisbon', worldId: null };
          const porto = { slug: 'porto', name: 'Porto', worldId: 'tinyopo' };
          expect(linked(res).data.benefactorWall).toEqual([
            {
              name: null,
              amountCents: 8800,
              cities: [lisbon],
              links: [],
              lastGiftAt: expect.any(String) as string,
            },
            {
              name: 'Ana',
              amountCents: 4900,
              cities: [lisbon, porto],
              links: [
                {
                  url: SHOP,
                  title: 'A tiny shop',
                  description: 'Prints and postcards',
                  icon: expect.any(String) as string,
                  image: expect.any(String) as string,
                },
              ],
              lastGiftAt: expect.any(String) as string,
            },
            {
              name: null,
              amountCents: 2500,
              cities: [porto],
              links: [],
              lastGiftAt: expect.any(String) as string,
            },
          ]);
          // nobody's address, and nothing that says whose an unnamed gift is
          expect(JSON.stringify(res.body)).not.toContain('@');
          expect(JSON.stringify(res.body)).not.toContain('donorId');
        });

        it('leaves out hidden cities, other currencies and gifts to no city', async () => {
          await gift('cs_h', 900, 'ana@example.com', 'Ana', 'Nowhere');
          await prisma.city.update({
            where: { slug: 'nowhere' },
            data: { hidden: true },
          });
          await gift('cs_p', 300, 'ana@example.com', undefined, '');
          await webhook({
            id: 'cs_eur',
            amount: 5000,
            currency: 'eur',
            email: 'eu@example.com',
            metadata: {
              app: 'tinyworlds',
              city: 'Lisbon',
              world: 'tinynyc',
              locale: 'en-US',
              benefactor_name: 'Eva',
            },
          }).expect(200);
          expect(await wall()).toEqual([]);
        });

        it('is empty before anyone has given', async () => {
          expect(await wall()).toEqual([]);
        });
      });
    });

    it('hides a name an admin hid', async () => {
      await seedLisbon();
      await prisma.donor.update({
        where: { email: 'ana@example.com' },
        data: { nameHidden: true },
      });
      const res = await graphql(BENEFACTORS, {
        input: { slug: 'lisbon' },
      }).expect(200);
      const founders = (
        res.body as {
          data: {
            cityBenefactors: {
              founders: {
                number: number;
                name: string | null;
                stones: number;
              }[];
            };
          };
        }
      ).data.cityBenefactors.founders;
      expect(founders[0]).toMatchObject({ number: 1, name: null, stones: 12 });
      // her second gift is no longer folded into her row: it is a plain benefactor
      expect(founders).toHaveLength(2);
    });
  });
  describe('the quiz', () => {
    const visit = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const good = { world: 'tinynyc', sightId: 'b19j7udl', locale: 'en-US' };
    const answerQuiz = (input: Record<string, unknown>) =>
      graphql(ANSWER_QUIZ, { input }).set('x-forwarded-for', '203.0.113.60');

    it('keeps an answer per visit and building, and answers the tally', async () => {
      await answerQuiz({
        ...good,
        visitId: visit(1),
        choice: 'b19j7udl',
      }).expect(200);
      const second = await answerQuiz({
        ...good,
        visitId: visit(2),
        choice: 'b1abc',
      }).expect(200);
      expect(answer(second).data.answerQuiz).toEqual({
        answers: 2,
        picks: [
          { choice: 'b19j7udl', count: 1 },
          { choice: 'b1abc', count: 1 },
        ],
      });
      // the first visit again, with another pick: nothing changes
      const again = await answerQuiz({
        ...good,
        visitId: visit(1),
        choice: 'b1abc',
      }).expect(200);
      expect(answer(again).data.answerQuiz.answers).toBe(2);
      const rows = await prisma.quizAnswer.findMany({
        orderBy: { visitId: 'asc' },
      });
      expect(rows.map((row) => [row.visitId, row.choice])).toEqual([
        [visit(1), 'b19j7udl'],
        [visit(2), 'b1abc'],
      ]);
    });

    it('answers the tally without keeping an answer that names no visit', async () => {
      await answerQuiz({
        ...good,
        visitId: visit(1),
        choice: 'b19j7udl',
      }).expect(200);
      const res = await answerQuiz({ ...good, choice: 'b1abc' }).expect(200);
      expect(answer(res).data.answerQuiz).toEqual({
        answers: 1,
        picks: [{ choice: 'b19j7udl', count: 1 }],
      });
      expect(await prisma.quizAnswer.count()).toBe(1);
    });

    it('counts only the names the page offered, when it says which', async () => {
      await answerQuiz({ ...good, visitId: visit(1), choice: 'zzz' }).expect(
        200,
      );
      const res = await answerQuiz({
        ...good,
        visitId: visit(2),
        choice: 'b19j7udl',
        choices: ['b1abc', 'b19j7udl', 'b2', 'b3'],
      }).expect(200);
      expect(answer(res).data.answerQuiz).toEqual({
        answers: 2,
        picks: [{ choice: 'b19j7udl', count: 1 }],
      });
    });

    it('tallies each difficulty apart, and takes a missing one as hard', async () => {
      await answerQuiz({
        ...good,
        visitId: visit(1),
        choice: 'b19j7udl',
      }).expect(200);
      const easy = await answerQuiz({
        ...good,
        visitId: visit(1),
        choice: 'b1abc',
        level: 'EASY',
      }).expect(200);
      expect(answer(easy).data.answerQuiz).toEqual({
        answers: 1,
        picks: [{ choice: 'b1abc', count: 1 }],
      });
      const rows = await prisma.quizAnswer.findMany({
        orderBy: { level: 'asc' },
      });
      expect(rows.map((row) => row.level)).toEqual(['EASY', 'HARD']);
      // a difficulty the schema does not know never reaches the resolver
      await answerQuiz({
        ...good,
        visitId: visit(2),
        choice: 'b1',
        level: 'IMPOSSIBLE',
      }).expect(400);
    });

    it('refuses names offered that are too many, or leave out the pick', async () => {
      const input = { ...good, visitId: visit(1), choice: 'b19j7udl' };
      for (const choices of [
        ['b19j7udl', 'b1', 'b2', 'b3', 'b4'],
        ['b1', 'b2', 'b3', 'b4'],
        ['b19j7udl', 'b19j7udl'],
      ]) {
        const res = await answerQuiz({ ...input, choices }).expect(200);
        expect(answer(res).errors?.[0].extensions.code).toBe('BAD_REQUEST');
      }
      expect(await prisma.quizAnswer.count()).toBe(0);
    });

    it('refuses a visit, a world, a building or a language that is not one', async () => {
      const input = { ...good, visitId: visit(1), choice: 'b19j7udl' };
      for (const bad of [
        { ...input, visitId: 'me' },
        { ...input, world: 'Tiny NYC' },
        { ...input, sightId: 'B<script>' },
        { ...input, choice: '' },
        { ...input, locale: 'fr-FR' },
      ]) {
        const res = await answerQuiz(bad).expect(200);
        expect(answer(res).errors?.[0].extensions.code).toBe('BAD_REQUEST');
      }
      expect(await prisma.quizAnswer.count()).toBe(0);
    });
  });

  describe('telling donors they are in the hall of fame', () => {
    const SITE = 'https://example.com';
    const gift = (
      id: string,
      amount: number,
      email: string | null,
      locale: string,
      name?: string,
      city = 'Lisbon',
      currency = 'usd',
    ) =>
      webhook({
        id,
        amount,
        email,
        currency,
        metadata: {
          app: 'tinyworlds',
          world: 'tinynyc',
          locale,
          ...(city ? { city } : {}),
          ...(name ? { benefactor_name: name } : {}),
        },
      }).expect(200);
    /** The mails of this test so far. */
    let start = 0;
    beforeEach(() => {
      start = mailer.sent.length;
    });
    afterEach(() => {
      mailer.failWith = null;
    });
    /** The hall of fame mails this test sent: the ones that lead there. */
    const hallMails = () =>
      mailer.sent
        .slice(start)
        .filter((mail) => mail.html.includes(`${SITE}/hall-of-fame/`));
    /** Ana, named in Lisbon and unnamed in Porto; Bo, unnamed; a gift with no address. */
    const give = async () => {
      const before = mailer.sent.length;
      await gift('cs_h1', 1200, 'ana@example.com', 'en-US', 'Ana');
      await gift('cs_h2', 800, 'ana@example.com', 'pt-BR', undefined, 'Porto');
      await gift('cs_h3', 500, 'bo@example.com', 'es-ES');
      await gift('cs_h4', 700, null, 'en-US');
      // their thank-yous go out on their own: wait for them, so they are not counted later
      await vi.waitFor(() => expect(mailer.sent).toHaveLength(before + 3));
      start = mailer.sent.length;
    };
    const told = async () =>
      (
        await prisma.donor.findMany({
          where: { hallMailedAt: { not: null } },
          select: { email: true },
          orderBy: { email: 'asc' },
        })
      ).map((donor) => donor.email);

    it('says who would be told, and sends nothing', async () => {
      await give();
      const letters = await hallLetters(prisma, SITE);
      expect(
        letters.map(({ locale, cities, named, mail }) => ({
          to: mail.to,
          locale,
          cities,
          named,
        })),
      ).toEqual([
        // the language of her latest gift; named in one of her two cities
        { to: 'ana@example.com', locale: 'pt-BR', cities: 2, named: true },
        { to: 'bo@example.com', locale: 'es-ES', cities: 1, named: false },
      ]);
      expect(hallMails()).toEqual([]);
      expect(await told()).toEqual([]);
    });

    it('mails each donor once, with their cities and how they show in each', async () => {
      await give();
      const run = await announceHall(prisma, mailer, SITE);
      expect(run).toMatchObject({ letters: 2, failed: [], unsent: [] });
      expect(run.sent).toHaveLength(2);

      const [ana, bo] = hallMails();
      expect(ana.to).toBe('ana@example.com');
      expect(ana.subject).toBe('Você está no Hall da Fama do tinyworlds');
      // the city she gave most to first; named in one, not in the other
      expect(ana.text).toContain(
        `Lisbon como Ana: ${SITE}/hall-of-fame/lisbon/\n\nPorto como “Anônimo”: ${SITE}/hall-of-fame/porto/`,
      );
      // US$20 in all: her links show their pictures
      // (the sum is written the Brazilian way, with a space that does not break)
      expect(ana.text).toMatch(/Você doou US\$\s10 ou mais/);
      expect(bo.to).toBe('bo@example.com');
      expect(bo.subject).toBe('Estás en el Salón de la Fama de Lisbon');
      expect(bo.text).toContain('Lisbon como «Anónimo»');
      expect(bo.text).toMatch(/Hasta ahora has donado 5\sUS\$/);
      // each mail is about its own donor only
      expect(ana.text).not.toContain('bo@');
      expect(bo.html).not.toContain('Ana');
      expect(await told()).toEqual(['ana@example.com', 'bo@example.com']);

      // a second run tells nobody again
      const again = await announceHall(prisma, mailer, SITE);
      expect(again).toMatchObject({ letters: 0, sent: [] });
      expect(hallMails()).toHaveLength(2);

      // someone who gives later is told by the next run, and only them
      const before = mailer.sent.length;
      await gift('cs_h5', 300, 'cy@example.com', 'en-US', 'Cy');
      await vi.waitFor(() => expect(mailer.sent).toHaveLength(before + 1));
      const later = await announceHall(prisma, mailer, SITE);
      expect(later.sent).toHaveLength(1);
      expect(hallMails().at(-1)).toMatchObject({
        to: 'cy@example.com',
        subject: "You're in Lisbon's Hall of Fame",
      });
    });

    it('tells nobody who is in no hall: a hidden city, another currency, no city', async () => {
      const before = mailer.sent.length;
      await gift('cs_x1', 900, 'hid@example.com', 'en-US', 'Hid', 'Nowhere');
      await prisma.city.update({
        where: { slug: 'nowhere' },
        data: { hidden: true },
      });
      await gift(
        'cs_x2',
        5000,
        'eur@example.com',
        'en-US',
        'Eva',
        'Lisbon',
        'eur',
      );
      await gift('cs_x3', 400, 'pro@example.com', 'en-US', undefined, '');
      await vi.waitFor(() => expect(mailer.sent).toHaveLength(before + 3));
      expect(await hallLetters(prisma, SITE)).toEqual([]);
      const run = await announceHall(prisma, mailer, SITE);
      expect(run).toEqual({ letters: 0, sent: [], failed: [], unsent: [] });
    });

    it('gives a donor back when their mail fails, so the next run tries again', async () => {
      await give();
      const lines: string[] = [];
      mailer.failWith = new Error('550 mailbox unavailable');
      const run = await announceHall(prisma, mailer, SITE, (line) =>
        lines.push(line),
      );
      expect(run.sent).toEqual([]);
      expect(run.failed).toHaveLength(2);
      expect(run.unsent).toEqual([]);
      expect(await told()).toEqual([]);
      // the failures are told by donor id, never by address
      expect(lines).toHaveLength(2);
      expect(lines.join('\n')).not.toContain('@');

      mailer.failWith = null;
      const again = await announceHall(prisma, mailer, SITE);
      expect(again.sent).toHaveLength(2);
      expect(hallMails()).toHaveLength(2);
    });

    it('stops at the first failure when the mail server is away', async () => {
      await give();
      mailer.failWith = Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNECTION',
      });
      const tries = mailer.attempts;
      const run = await announceHall(prisma, mailer, SITE);
      expect(run.sent).toEqual([]);
      expect(run.failed).toHaveLength(1);
      expect(run.unsent).toHaveLength(1);
      // the second donor was never tried
      expect(mailer.attempts).toBe(tries + 1);
      expect(await told()).toEqual([]);
    });
  });

  describe("the owner's note to donors", () => {
    const SITE = 'https://example.com';
    const OWNER = {
      name: 'Robin',
      from: 'Robin from tinyworlds <robin@example.com>',
      whatsapp: '+1 555 010-0199',
    };
    const gift = (
      id: string,
      amount: number,
      email: string | null,
      locale: string,
      name?: string,
      city = 'Lisbon',
      currency = 'usd',
    ) =>
      webhook({
        id,
        amount,
        email,
        currency,
        metadata: {
          app: 'tinyworlds',
          world: 'tinynyc',
          locale,
          ...(city ? { city } : {}),
          ...(name ? { benefactor_name: name } : {}),
        },
      }).expect(200);
    /** The mails of this test so far. */
    let start = 0;
    beforeEach(() => {
      start = mailer.sent.length;
    });
    afterEach(() => {
      mailer.failWith = null;
    });
    /** The notes this test sent: the mails that are from the owner. */
    const notes = () =>
      mailer.sent.slice(start).filter((mail) => mail.from === OWNER.from);
    /** Ana, named, who gave to Lisbon and Porto; Bo, who gave no name; a gift with no address. */
    const give = async () => {
      const before = mailer.sent.length;
      await gift('cs_n1', 1200, 'ana@example.com', 'en-US', 'Ana');
      await gift('cs_n2', 800, 'ana@example.com', 'pt-BR', undefined, 'Porto');
      await gift('cs_n3', 500, 'bo@example.com', 'es-ES');
      await gift('cs_n4', 700, null, 'en-US');
      // their thank-yous go out on their own: wait for them, so they are not counted later
      await vi.waitFor(() => expect(mailer.sent).toHaveLength(before + 3));
      start = mailer.sent.length;
    };
    const written = async () =>
      (
        await prisma.donor.findMany({
          where: { noteMailedAt: { not: null } },
          select: { email: true },
          orderBy: { email: 'asc' },
        })
      ).map((donor) => donor.email);

    it('says who would get the note, and sends nothing', async () => {
      await give();
      const letters = await noteLetters(prisma, SITE, OWNER);
      expect(
        letters.map(({ locale, cities, named, mail }) => ({
          to: mail.to,
          locale,
          cities,
          named,
        })),
      ).toEqual([
        // the language of her latest gift
        { to: 'ana@example.com', locale: 'pt-BR', cities: 2, named: true },
        { to: 'bo@example.com', locale: 'es-ES', cities: 1, named: false },
      ]);
      expect(notes()).toEqual([]);
      expect(await written()).toEqual([]);
    });

    it('writes to each donor once, from the owner, about the cities they gave to', async () => {
      await give();
      const run = await sendNotes(prisma, mailer, SITE, OWNER);
      expect(run).toMatchObject({ letters: 2, failed: [], unsent: [] });
      expect(run.sent).toHaveLength(2);

      const [ana, bo] = notes();
      expect(ana.to).toBe('ana@example.com');
      expect(ana.subject).toBe('Um agradecimento por apoiar o tinyworlds');
      expect(ana.text.startsWith('Olá, Ana,\n\n')).toBe(true);
      // the city she gave most to first
      expect(ana.text).toContain('pelo que você doou para Lisbon e Porto.');
      expect(ana.text).toContain('+1 555 010-0199 (https://wa.me/15550100199)');
      expect(bo.to).toBe('bo@example.com');
      expect(bo.subject).toBe('Gracias por ayudar a construir Lisbon');
      expect(bo.text.startsWith('Hola:\n\n')).toBe(true);
      // each note is about its own donor only
      expect(bo.html).not.toContain('Ana');
      expect(bo.text).not.toContain('Porto');
      expect(await written()).toEqual(['ana@example.com', 'bo@example.com']);

      // a second run writes to nobody again
      const again = await sendNotes(prisma, mailer, SITE, OWNER);
      expect(again).toMatchObject({ letters: 0, sent: [] });
      expect(notes()).toHaveLength(2);

      // someone who gives later gets theirs from the next run, and only them
      const before = mailer.sent.length;
      await gift('cs_n5', 300, 'cy@example.com', 'en-US', 'Cy');
      await vi.waitFor(() => expect(mailer.sent).toHaveLength(before + 1));
      const later = await sendNotes(prisma, mailer, SITE, OWNER);
      expect(later.sent).toHaveLength(1);
      expect(notes().at(-1)).toMatchObject({
        to: 'cy@example.com',
        from: OWNER.from,
        subject: 'Thank you for helping build Lisbon',
      });
    });

    it('goes out whether or not the donor was told about the hall of fame, and the other way round', async () => {
      await give();
      await announceHall(prisma, mailer, SITE);
      expect(await written()).toEqual([]);
      const run = await sendNotes(prisma, mailer, SITE, OWNER);
      expect(run.sent).toHaveLength(2);
      expect(notes()).toHaveLength(2);

      // and a note keeps nobody from being told about the hall
      const before = mailer.sent.length;
      await gift('cs_n6', 300, 'cy@example.com', 'en-US', 'Cy');
      await vi.waitFor(() => expect(mailer.sent).toHaveLength(before + 1));
      await sendNotes(prisma, mailer, SITE, OWNER);
      expect((await announceHall(prisma, mailer, SITE)).sent).toHaveLength(1);
    });

    it('greets plainly a donor whose name an admin hid', async () => {
      await give();
      await prisma.donor.update({
        where: { email: 'ana@example.com' },
        data: { nameHidden: true },
      });
      const [ana] = await noteLetters(prisma, SITE, OWNER);
      expect(ana.named).toBe(false);
      expect(ana.mail.text.startsWith('Olá,\n\n')).toBe(true);
      expect(ana.mail.html).not.toContain('Ana');
    });

    it('writes to nobody who gave to no city the site shows: a hidden city, another currency, no city', async () => {
      const before = mailer.sent.length;
      await gift('cs_y1', 900, 'hid@example.com', 'en-US', 'Hid', 'Nowhere');
      await prisma.city.update({
        where: { slug: 'nowhere' },
        data: { hidden: true },
      });
      await gift(
        'cs_y2',
        5000,
        'eur@example.com',
        'en-US',
        'Eva',
        'Lisbon',
        'eur',
      );
      await gift('cs_y3', 400, 'pro@example.com', 'en-US', undefined, '');
      await vi.waitFor(() => expect(mailer.sent).toHaveLength(before + 3));
      expect(await noteLetters(prisma, SITE, OWNER)).toEqual([]);
      const run = await sendNotes(prisma, mailer, SITE, OWNER);
      expect(run).toEqual({ letters: 0, sent: [], failed: [], unsent: [] });
    });

    it('gives a donor back when their note fails, so the next run tries again', async () => {
      await give();
      const lines: string[] = [];
      mailer.failWith = new Error('550 mailbox unavailable');
      const run = await sendNotes(prisma, mailer, SITE, OWNER, (line) =>
        lines.push(line),
      );
      expect(run.sent).toEqual([]);
      expect(run.failed).toHaveLength(2);
      expect(await written()).toEqual([]);
      // the failures are told by donor id, never by address
      expect(lines).toHaveLength(2);
      expect(lines.join('\n')).not.toContain('@');

      mailer.failWith = null;
      const again = await sendNotes(prisma, mailer, SITE, OWNER);
      expect(again.sent).toHaveLength(2);
      expect(notes()).toHaveLength(2);
    });
  });

  describe('announcing a built city', () => {
    const gift = (
      id: string,
      amount: number,
      email: string | null,
      locale: string,
      name?: string,
    ) =>
      webhook({
        id,
        amount,
        email,
        metadata: {
          app: 'tinyworlds',
          city: 'Lisbon',
          world: 'tinynyc',
          locale,
          ...(name ? { benefactor_name: name } : {}),
        },
      }).expect(200);
    /** The mails of this test so far. */
    let start = 0;
    beforeEach(() => {
      start = mailer.sent.length;
    });
    /** The announcements this test sent: the mails that carry the world's share card. */
    const announcements = () =>
      mailer.sent
        .slice(start)
        .filter((mail) => mail.html.includes('/tinylis/og/tinylis.jpg'));
    const announce = (world: string) =>
      app.get(AnnounceService).announce(world);

    /** Lisbon's gifts (a goal of US$100 here), and their thank-yous gone out. */
    const giveToLisbon = async () => {
      const before = mailer.sent.length;
      await gift('cs_a1', 1200, 'ana@example.com', 'en-US', 'Ana');
      await gift('cs_b', 8800, 'bo@example.com', 'pt-BR');
      await gift('cs_a2', 3000, 'ana@example.com', 'es-ES', 'Ana');
      await gift('cs_c', 500, 'cy@example.com', 'en-US');
      await gift('cs_n', 700, null, 'en-US');
      await vi.waitFor(() => expect(mailer.sent).toHaveLength(before + 4));
    };
    const build = () =>
      prisma.city.update({
        where: { slug: 'lisbon' },
        data: { status: 'BUILT', worldId: 'tinylis' },
      });

    it('mails each donor of a built city once, in the language of their latest gift', async () => {
      await giveToLisbon();
      await build();
      expect(await announce('tinylis')).toEqual({
        kind: 'sent',
        world: 'tinylis',
        city: 'Lisbon',
        mailed: 3,
        failed: [],
        unsent: [],
      });
      const sent = announcements();
      expect(sent.map((mail) => mail.to).sort()).toEqual([
        'ana@example.com',
        'bo@example.com',
        'cy@example.com',
      ]);
      const to = (address: string) => sent.find((mail) => mail.to === address);
      expect(to('ana@example.com')).toMatchObject({
        subject: 'Lisbon ya está en el mapa. Ven a verla',
      });
      expect(to('ana@example.com')?.text).toContain(
        'Diste: 42\u00a0US$ · piedras 1–12',
      );
      expect(to('ana@example.com')?.text).toContain(
        'La construyeron: 2 fundadores y 2 benefactores',
      );
      expect(to('bo@example.com')?.subject).toBe(
        'Lisbon já está no mapa. Venha ver',
      );
      expect(to('bo@example.com')?.text).toContain(
        'Fundador Nº 2 · Pedra-Chave',
      );
      expect(to('cy@example.com')?.text).toContain(
        'Lisbon is on the map, and you helped keep it running.',
      );
      expect(to('cy@example.com')?.html).toContain(
        'href="https://example.com/tinylis/"',
      );
      // nobody's mail names anyone else
      for (const mail of sent)
        for (const other of ['ana@', 'bo@', 'cy@'])
          if (!mail.to.startsWith(other))
            expect(mail.html + mail.text).not.toContain(other);
      const lisbon = await prisma.city.findUniqueOrThrow({
        where: { slug: 'lisbon' },
      });
      expect(lisbon.builtAnnouncedAt).toBeInstanceOf(Date);

      // the second time, nothing
      expect(await announce('tinylis')).toEqual({
        kind: 'announced-before',
        world: 'tinylis',
        city: 'Lisbon',
        at: lisbon.builtAnnouncedAt,
      });
      expect(announcements()).toHaveLength(3);
    });

    it('sends nothing for a city not built yet, nor for a world no city has', async () => {
      await giveToLisbon();
      await prisma.city.update({
        where: { slug: 'lisbon' },
        data: { worldId: 'tinylis' },
      });
      expect(await announce('tinylis')).toEqual({
        kind: 'not-built',
        world: 'tinylis',
        city: 'Lisbon',
        status: 'FUNDED',
      });
      expect(await announce('tinynowhere')).toEqual({
        kind: 'unknown',
        world: 'tinynowhere',
      });
      expect(announcements()).toHaveLength(0);
      const lisbon = await prisma.city.findUniqueOrThrow({
        where: { slug: 'lisbon' },
      });
      expect(lisbon.builtAnnouncedAt).toBeNull();
    });

    /** The donors' ids, in the order the announcement mails them (oldest gift first). */
    const donorIds = async () => {
      const ids = [];
      for (const email of [
        'ana@example.com',
        'bo@example.com',
        'cy@example.com',
      ])
        ids.push(
          (await prisma.donor.findUniqueOrThrow({ where: { email } })).id,
        );
      return ids;
    };
    const announcedAt = async () =>
      (await prisma.city.findUniqueOrThrow({ where: { slug: 'lisbon' } }))
        .builtAnnouncedAt;
    /** A mail server that does not answer, as nodemailer reports it. */
    const away = () =>
      Object.assign(new Error('Connection timeout'), { code: 'ECONNECTION' });

    it('leaves the announcement open when no mail goes out, and the next run sends it', async () => {
      await giveToLisbon();
      await build();
      const [ana, bo, cy] = await donorIds();
      mailer.failWith = new Error('550 mailbox unavailable');
      try {
        expect(await announce('tinylis')).toEqual({
          kind: 'not-sent',
          world: 'tinylis',
          city: 'Lisbon',
          failed: [ana, bo, cy],
          unsent: [],
        });
      } finally {
        mailer.failWith = null;
      }
      expect(await announcedAt()).toBeNull();
      expect(await announce('tinylis')).toMatchObject({
        kind: 'sent',
        mailed: 3,
      });
      expect(announcements()).toHaveLength(3);
    });

    it('stops at a mail server that is away, instead of waiting on it for every donor', async () => {
      await giveToLisbon();
      await build();
      const [ana, bo, cy] = await donorIds();
      const before = mailer.attempts;
      mailer.failWith = away();
      try {
        expect(await announce('tinylis')).toEqual({
          kind: 'not-sent',
          world: 'tinylis',
          city: 'Lisbon',
          failed: [ana],
          unsent: [bo, cy],
        });
      } finally {
        mailer.failWith = null;
      }
      expect(mailer.attempts - before).toBe(1);
      expect(await announcedAt()).toBeNull();
    });

    it('keeps an announcement that went out in part, and names who missed it', async () => {
      await giveToLisbon();
      await build();
      const [, bo, cy] = await donorIds();
      const before = mailer.attempts;
      mailer.failWith = (attempt) => (attempt === before + 2 ? away() : null);
      try {
        expect(await announce('tinylis')).toEqual({
          kind: 'sent',
          world: 'tinylis',
          city: 'Lisbon',
          mailed: 1,
          failed: [bo],
          unsent: [cy],
        });
      } finally {
        mailer.failWith = null;
      }
      expect(await announcedAt()).toBeInstanceOf(Date);
      expect((await announce('tinylis')).kind).toBe('announced-before');
      expect(announcements().map((mail) => mail.to)).toEqual([
        'ana@example.com',
      ]);
    });

    it('reads everything before it claims the announcement', async () => {
      await giveToLisbon();
      await build();
      const before = mailer.attempts;
      vi.spyOn(app.get(BenefactorsService), 'giftsOf').mockRejectedValueOnce(
        new Error('the database is away'),
      );
      await expect(announce('tinylis')).rejects.toThrow('the database is away');
      expect(await announcedAt()).toBeNull();
      expect(mailer.attempts).toBe(before);
    });

    it('gives the claim back when anything throws once it is made', async () => {
      await giveToLisbon();
      await build();
      // an error that cannot even be described: logging it throws
      mailer.failWith = () =>
        new Proxy(new Error('odd'), {
          get: () => {
            throw new Error('an unreadable failure');
          },
        });
      try {
        await expect(announce('tinylis')).rejects.toThrow(
          'an unreadable failure',
        );
      } finally {
        mailer.failWith = null;
      }
      expect(await announcedAt()).toBeNull();
      expect((await announce('tinylis')).kind).toBe('sent');
    });

    it("after the donors' announcement, the CLI's list step mails the waiting", async () => {
      await giveToLisbon();
      const lisbon = await prisma.city.findUniqueOrThrow({
        where: { slug: 'lisbon' },
      });
      const [ana] = await donorIds();
      const dee = await prisma.donor.create({
        data: { email: 'dee@example.com' },
      });
      const eli = await prisma.donor.create({
        data: { email: 'eli@example.com' },
      });
      await prisma.listMember.createMany({
        data: [
          // on both lists: one mail
          { donorId: dee.id, cityId: lisbon.id, locale: 'pt-BR' },
          { donorId: dee.id, cityId: null, locale: 'pt-BR' },
          { donorId: eli.id, cityId: null, locale: 'en-US' },
          // a donor of the city: the donors' mail, and no other
          { donorId: ana, cityId: lisbon.id, locale: 'en-US' },
        ],
      });
      await build();
      // the site's files are not asked for: a world with no buildings, and a quiz
      const pickIn = vi
        .spyOn(app.get(SightsCatalog), 'pickIn')
        .mockResolvedValue({ sights: [], unread: false, quiz: true });
      try {
        expect((await announce('tinylis')).kind).toBe('sent');
        const lists = app.get(ListAnnounceService);
        const done = await lists.announce(['tinylis']);
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
          ],
          unread: [],
        });
        expect(describeListAnnouncement(done)).toEqual([
          'Lisbon (tinylis), its lists: 2 mailed, 0 failed. Its list is closed.',
        ]);
        expect(listsFellShort(done)).toBe(false);

        const listMails = mailer.sent
          .slice(start)
          .filter((mail) => mail.headers?.['List-Unsubscribe']);
        expect(listMails.map((mail) => mail.to).sort()).toEqual([
          'dee@example.com',
          'eli@example.com',
        ]);
        const toDee = listMails.find((mail) => mail.to === 'dee@example.com');
        expect(toDee?.subject).toBe('Lisbon já está no mapa. Venha ver');
        expect(toDee?.html).toContain('href="https://example.com/tinylis/"');
        expect(toDee?.html).toContain('Jogar Adivinhe o prédio');
        // Ana had her own mail about Lisbon (in the language of her latest gift), and only that one
        expect(
          mailer.sent
            .slice(start)
            .filter(
              (mail) =>
                mail.to === 'ana@example.com' &&
                mail.html.includes('/tinylis/og/tinylis.jpg'),
            )
            .map((mail) => mail.subject),
        ).toEqual(['Lisbon ya está en el mapa. Ven a verla']);
        // a mail of the donors' carries no list header
        expect(
          mailer.sent
            .slice(start)
            .some(
              (mail) =>
                mail.to === 'ana@example.com' &&
                mail.headers?.['List-Unsubscribe'],
            ),
        ).toBe(false);

        const after = await prisma.city.findUniqueOrThrow({
          where: { slug: 'lisbon' },
        });
        expect(after.listsStartedAt).toBeInstanceOf(Date);
        expect(after.listsAnnouncedAt).toBeInstanceOf(Date);
        expect(
          (await prisma.listNotice.findMany()).map((n) => n.donorId).sort(),
        ).toEqual([dee.id, eli.id].sort());
        // Lisbon's list has ended; new cities goes on
        expect(
          (await prisma.listMember.findMany()).map((m) => [
            m.donorId,
            m.cityId,
          ]),
        ).toEqual(
          expect.arrayContaining([
            [dee.id, null],
            [eli.id, null],
          ]),
        );
        expect(await prisma.listMember.count()).toBe(2);
        // the buildings, once per language
        expect(pickIn).toHaveBeenCalledTimes(2);

        // the next deploy sends nothing
        expect(await lists.announce(['tinylis'])).toEqual({
          cities: [],
          unread: [],
        });
        expect(
          mailer.sent
            .slice(start)
            .filter((mail) => mail.headers?.['List-Unsubscribe']),
        ).toHaveLength(2);
      } finally {
        pickIn.mockRestore();
      }
    });
  });

  describe('sight pictures', () => {
    it('answers 404 without a lasting cache header when the site has no such file', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sight-pictures/tinynone/abc123.png')
        .expect(404);
      expect(String(res.headers['cache-control'] ?? '')).not.toContain(
        'immutable',
      );
      await request(app.getHttpServer())
        .get('/api/sight-pictures/tinynone/not-a-hash.webp')
        .expect(404);
    });
  });
});
