import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { STRIPE } from '../src/donations/stripe.provider.js';
import { configureHttp } from '../src/http.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { checkoutSession, FakeStripe, signedEvent } from './fake-stripe.js';

const MILESTONES =
  '{ cityMilestones { slug name raisedCents goalCents donations status worldId } }';
const CHECKOUT =
  'mutation ($input: CreateDonationCheckoutInput!) { createDonationCheckout(input: $input) { url } }';

/** A GraphQL answer, as far as these tests read it. */
interface Answer {
  data: {
    cityMilestones: Record<string, unknown>[];
    createDonationCheckout: { url: string };
  };
  errors?: { message: string; extensions: { code: string } }[];
}

const answer = (res: { body: unknown }): Answer => res.body as Answer;

describe('the API over HTTP', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let stripe: FakeStripe;

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

  beforeAll(async () => {
    stripe = new FakeStripe();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STRIPE)
      .useValue(stripe)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureHttp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE donations, cities');
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
});
