import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { MAILER } from '../src/mail/mailer.js';
import { STRIPE } from '../src/donations/stripe.provider.js';
import { configureHttp } from '../src/http.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CACHE_MS, LIVE_MS } from '../src/visits/visits.service.js';
import { FakeMailer } from './fake-mailer.js';
import { checkoutSession, FakeStripe, signedEvent } from './fake-stripe.js';

const MILESTONES =
  '{ cityMilestones { slug name raisedCents goalCents donations status worldId } }';
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STRIPE)
      .useValue(stripe)
      .overrideProvider(MAILER)
      .useValue(mailer)
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
      'TRUNCATE donations, donors, cities, funnel_events, magic_links, quiz_answers',
    );
    stripe.calls = [];
    stripe.priceLookups = [];
  });

  afterAll(async () => {
    await app.close();
  });

  it('is alive under /api', async () => {
    const res = await graphql('{ health }').expect(200);
    expect(res.body).toEqual({ data: { health: 'ok' } });
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
        status: 'PROPOSED',
        worldId: null,
      },
      { slug: 'new-york', status: 'BUILT', worldId: 'tinynyc' },
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
    let clock = Date.now();
    const wait = (ms: number) => {
      clock += ms;
      vi.setSystemTime(clock);
    };

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
      slug name status worldId goalCents raisedCents stones
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
            founders: unknown[];
            benefactors: unknown[];
            stones: (number | null)[];
          };
        };
      };
      const city = body.data.cityBenefactors;
      expect(city.slug).toBe('lisbon');
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
              stones: (number | null)[];
            };
          };
        }
      ).data.cityBenefactors;
      expect(city.founders).toEqual([]);
      expect(city.benefactors).toEqual([]);
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
});
