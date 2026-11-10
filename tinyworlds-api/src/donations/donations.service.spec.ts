import {
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FakePrisma } from '../../test/fake-prisma.js';
import {
  checkoutSession,
  FakeStripe,
  signedEvent,
  TEST_WEBHOOK_SECRET,
} from '../../test/fake-stripe.js';
import type { Env } from '../config/env.js';
import { FunnelService } from '../funnel/funnel.service.js';
import { DonationsService } from './donations.service.js';

const ENV = {
  STRIPE_WEBHOOK_SECRET: TEST_WEBHOOK_SECRET,
  STRIPE_PRICE_EN: 'price_en',
  STRIPE_PRICE_PT: 'price_pt',
  STRIPE_PRICE_ES: 'price_es',
  CITY_GOAL_CENTS: 10_000,
  ALLOWED_ORIGINS: ['https://example.com', 'http://localhost:3000'],
} as const;

beforeAll(() => Logger.overrideLogger(false));

function setup() {
  const prisma = new FakePrisma();
  const stripe = new FakeStripe();
  const config = {
    get: (key: keyof typeof ENV) => ENV[key],
  } as unknown as ConfigService<Env, true>;
  const service = new DonationsService(
    stripe,
    prisma.asService(),
    config,
    new FunnelService(prisma.asService()),
  );
  const deliver = (
    options: Parameters<typeof checkoutSession>[0],
    type?: string,
  ) => {
    const { body, signature } = signedEvent(checkoutSession(options), type);
    return service.handleWebhook(body, signature);
  };
  return { prisma, stripe, service, deliver };
}

const forCity = (city: string, world = 'tinynyc') => ({
  app: 'tinyworlds',
  city,
  world,
  locale: 'en-US',
});

describe('DonationsService.createCheckout', () => {
  const input = {
    city: 'São Paulo',
    world: 'tinynyc',
    locale: 'en-US',
    returnUrl: 'https://example.com/tinynyc/',
  };

  it('asks Stripe for a pay-what-you-want donation and answers its page', async () => {
    const { service, stripe } = setup();
    const url = await service.createCheckout(input);
    expect(url).toBe('https://checkout.stripe.test/c/pay/cs_test_1');
    const metadata = {
      app: 'tinyworlds',
      world: 'tinynyc',
      locale: 'en-US',
      city: 'São Paulo',
    };
    expect(stripe.calls).toEqual([
      {
        mode: 'payment',
        line_items: [{ price: 'price_en', quantity: 1 }],
        submit_type: 'donate',
        locale: 'en',
        success_url: 'https://example.com/tinynyc/?donated=1',
        cancel_url: 'https://example.com/tinynyc/?donated=0',
        metadata,
        payment_intent_data: {
          description: 'Tiny Worlds donation — São Paulo',
          metadata,
        },
        custom_text: {
          submit: { message: 'Your donation counts toward São Paulo.' },
        },
      },
    ]);
  });

  it.each([
    ['en-US', 'en', 'price_en', 'Your donation counts toward Lisbon.'],
    ['pt-BR', 'pt-BR', 'price_pt', 'Sua doação conta para Lisbon.'],
    ['es-ES', 'es', 'price_es', 'Tu donación cuenta para Lisbon.'],
  ])(
    'uses the price, language and wording of %s',
    async (locale, stripeLocale, price, message) => {
      const { service, stripe } = setup();
      await service.createCheckout({ ...input, city: 'Lisbon', locale });
      expect(stripe.calls[0]).toMatchObject({
        locale: stripeLocale,
        line_items: [{ price, quantity: 1 }],
        metadata: { locale, city: 'Lisbon' },
        custom_text: { submit: { message } },
      });
    },
  );

  it.each([
    ['en-US', 'en', 'price_en', 'prod_en'],
    ['pt-BR', 'pt-BR', 'price_pt', 'prod_pt'],
    ['es-ES', 'es', 'price_es', 'prod_es'],
  ])(
    'charges the amount chosen on the site, on the product of %s',
    async (locale, stripeLocale, price, product) => {
      const { service, stripe } = setup();
      const url = await service.createCheckout({
        ...input,
        locale,
        amountCents: 2500,
      });
      expect(url).toBe('https://checkout.stripe.test/c/pay/cs_test_1');
      expect(stripe.priceLookups).toEqual([price]);
      const metadata = {
        app: 'tinyworlds',
        world: 'tinynyc',
        locale,
        city: 'São Paulo',
        amount_cents: '2500',
      };
      expect(stripe.calls[0]).toMatchObject({
        mode: 'payment',
        submit_type: 'donate',
        locale: stripeLocale,
        line_items: [
          {
            quantity: 1,
            price_data: { currency: 'usd', unit_amount: 2500, product },
          },
        ],
        success_url: 'https://example.com/tinynyc/?donated=1',
        cancel_url: 'https://example.com/tinynyc/?donated=0',
        metadata,
        payment_intent_data: {
          description: 'Tiny Worlds donation — São Paulo',
          metadata,
        },
      });
      // a set amount, so not the pay-what-you-want price as well
      expect(stripe.calls[0].line_items?.[0]).not.toHaveProperty('price');
    },
  );

  it('without an amount neither looks a product up nor mentions one', async () => {
    const { service, stripe } = setup();
    await service.createCheckout(input);
    await service.createCheckout({ ...input, amountCents: null });
    expect(stripe.priceLookups).toEqual([]);
    for (const call of stripe.calls) {
      expect(call.line_items).toEqual([{ price: 'price_en', quantity: 1 }]);
      expect(call.metadata).not.toHaveProperty('amount_cents');
    }
  });

  it("asks Stripe for each language's product once, however many donate", async () => {
    const { service, stripe } = setup();
    const give = (locale: string, amountCents: number) =>
      service.createCheckout({ ...input, locale, amountCents });
    // the first two at the same moment: still one lookup
    await Promise.all([give('en-US', 100), give('en-US', 500)]);
    await give('en-US', 1_000_000);
    await give('pt-BR', 700);
    await give('pt-BR', 900);
    await give('es-ES', 300);
    expect(stripe.priceLookups).toEqual(['price_en', 'price_pt', 'price_es']);
    expect(
      stripe.calls.map((call) => call.line_items?.[0].price_data?.unit_amount),
    ).toEqual([100, 500, 1_000_000, 700, 900, 300]);
  });

  it('answers 503 when the product cannot be looked up, and asks again next time', async () => {
    const { service, stripe } = setup();
    stripe.failWith = new Error('Stripe is down');
    await expect(
      service.createCheckout({ ...input, amountCents: 500 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(stripe.calls).toHaveLength(0);

    stripe.failWith = null;
    await service.createCheckout({ ...input, amountCents: 500 });
    expect(stripe.priceLookups).toEqual(['price_en']);
    expect(stripe.calls).toHaveLength(1);
  });

  it('leaves the city out when none is given, or the text names nothing', async () => {
    const { service, stripe } = setup();
    await service.createCheckout({ ...input, city: undefined });
    await service.createCheckout({ ...input, city: '   ' });
    await service.createCheckout({ ...input, city: '—!?' });
    for (const call of stripe.calls) {
      expect(call.metadata).toEqual({
        app: 'tinyworlds',
        world: 'tinynyc',
        locale: 'en-US',
      });
      expect(call.payment_intent_data?.description).toBe(
        'Tiny Worlds donation',
      );
      expect(call).not.toHaveProperty('custom_text');
    }
  });

  it('tidies the city before it goes to Stripe', async () => {
    const { service, stripe } = setup();
    await service.createCheckout({ ...input, city: '  Buenos \n  Aires ' });
    expect(stripe.calls[0].metadata?.city).toBe('Buenos Aires');
  });

  it('refuses to send the donor back anywhere but the site', async () => {
    const { service, stripe } = setup();
    for (const returnUrl of [
      'https://evil.test/tinynyc/',
      'https://example.com/tinynyc/?x=1',
      'https://example.com/tinynyc/#40,-74,1',
    ]) {
      await expect(
        service.createCheckout({ ...input, returnUrl }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(stripe.calls).toHaveLength(0);
  });

  it('carries the visit to Stripe and notes that it reached the checkout', async () => {
    const { service, stripe, prisma } = setup();
    const visitId = '0B0E7A52-6C1D-4F0A-9C55-2F1B8E3D4A10';
    await service.createCheckout({ ...input, amountCents: 2500, visitId });
    expect(stripe.calls[0].metadata).toMatchObject({
      visit_id: visitId.toLowerCase(),
    });
    expect(prisma.events).toEqual([
      {
        visitId: visitId.toLowerCase(),
        step: 'CHECKOUT_STARTED',
        world: 'tinynyc',
        locale: 'en-US',
        city: 'São Paulo',
        amountCents: 2500,
      },
    ]);
  });

  it('notes nothing without a visit, nor when Stripe refuses', async () => {
    const { service, stripe, prisma } = setup();
    await service.createCheckout(input);
    expect(stripe.calls[0].metadata).not.toHaveProperty('visit_id');
    stripe.failWith = new Error('Stripe is down');
    await expect(
      service.createCheckout({
        ...input,
        visitId: '0b0e7a52-6c1d-4f0a-9c55-2f1b8e3d4a10',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.events).toEqual([]);
  });

  it('still answers the checkout when the funnel cannot be written', async () => {
    const { service, prisma } = setup();
    prisma.failEvents = new Error('the database is away');
    await expect(
      service.createCheckout({
        ...input,
        visitId: '0b0e7a52-6c1d-4f0a-9c55-2f1b8e3d4a10',
      }),
    ).resolves.toMatch(/^https:\/\/checkout\.stripe\.test\//);
  });

  it('answers 503 when Stripe fails, so the site can fall back', async () => {
    const { service, stripe } = setup();
    stripe.failWith = new Error('Stripe is down');
    await expect(service.createCheckout(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('DonationsService.handleWebhook', () => {
  it('refuses a delivery that Stripe did not sign', async () => {
    const { service, prisma } = setup();
    const session = checkoutSession({ metadata: forCity('Paris') });
    const forged = signedEvent(session, undefined, 'whsec_somebody_else');
    await expect(
      service.handleWebhook(forged.body, forged.signature),
    ).rejects.toBeInstanceOf(BadRequestException);
    const real = signedEvent(session);
    await expect(
      service.handleWebhook(
        Buffer.from(`${real.body.toString()} `),
        real.signature,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.handleWebhook(real.body, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.donations).toHaveLength(0);
  });

  it('records a paid donation and moves its city', async () => {
    const { deliver, prisma } = setup();
    await deliver({ id: 'cs_1', amount: 4000, metadata: forCity('São Paulo') });
    expect(prisma.donations).toMatchObject([
      {
        stripeSessionId: 'cs_1',
        stripePaymentIntentId: 'pi_test_1',
        amountCents: 4000,
        currency: 'usd',
        cityText: 'São Paulo',
        world: 'tinynyc',
        locale: 'en-US',
      },
    ]);
    expect(prisma.cities).toMatchObject([
      {
        slug: 'sao-paulo',
        name: 'São Paulo',
        status: 'PROPOSED',
        goalCents: 10_000,
        raisedCents: 4000,
        donationCount: 1,
      },
    ]);
    expect(prisma.donations[0].cityId).toBe(prisma.cities[0].id);
  });

  it('changes nothing when Stripe sends the same event again', async () => {
    const { deliver, prisma } = setup();
    const options = {
      id: 'cs_1',
      amount: 4000,
      metadata: forCity('São Paulo'),
    };
    await deliver(options);
    await deliver(options);
    await deliver(options, 'checkout.session.async_payment_succeeded');
    expect(prisma.donations).toHaveLength(1);
    expect(prisma.cities[0]).toMatchObject({
      raisedCents: 4000,
      donationCount: 1,
    });
  });

  it('counts every spelling toward the same city, under the first name given', async () => {
    const { deliver, prisma } = setup();
    await deliver({ id: 'cs_1', amount: 100, metadata: forCity('São Paulo') });
    await deliver({ id: 'cs_2', amount: 200, metadata: forCity('sao paulo') });
    await deliver({ id: 'cs_3', amount: 300, metadata: forCity('SAO-PAULO') });
    expect(prisma.cities).toHaveLength(1);
    expect(prisma.cities[0]).toMatchObject({
      name: 'São Paulo',
      raisedCents: 600,
      donationCount: 3,
    });
  });

  it('turns a city FUNDED exactly when it reaches its goal', async () => {
    const { deliver, prisma } = setup();
    await deliver({ id: 'cs_1', amount: 4000, metadata: forCity('São Paulo') });
    await deliver({ id: 'cs_2', amount: 5999, metadata: forCity('São Paulo') });
    expect(prisma.cities[0]).toMatchObject({
      raisedCents: 9999,
      status: 'PROPOSED',
    });
    await deliver({ id: 'cs_3', amount: 1, metadata: forCity('São Paulo') });
    expect(prisma.cities[0]).toMatchObject({
      raisedCents: 10_000,
      status: 'FUNDED',
    });
    await deliver({ id: 'cs_4', amount: 500, metadata: forCity('São Paulo') });
    expect(prisma.cities[0]).toMatchObject({
      raisedCents: 10_500,
      status: 'FUNDED',
    });
  });

  it('never touches the status of a city being built or already built', async () => {
    const { deliver, prisma } = setup();
    prisma.seedCity({
      slug: 'new-york',
      name: 'New York',
      status: 'BUILT',
      worldId: 'tinynyc',
    });
    prisma.seedCity({
      slug: 'paris',
      name: 'Paris',
      status: 'BUILDING',
      raisedCents: 9000,
    });
    await deliver({
      id: 'cs_1',
      amount: 20_000,
      metadata: forCity('New York'),
    });
    await deliver({ id: 'cs_2', amount: 20_000, metadata: forCity('Paris') });
    expect(prisma.cities.map((c) => c.status)).toEqual(['BUILT', 'BUILDING']);
    expect(prisma.cities.map((c) => c.raisedCents)).toEqual([20_000, 29_000]);
  });

  it('stores a donation in another currency without counting it', async () => {
    const { deliver, prisma } = setup();
    await deliver({
      id: 'cs_1',
      amount: 50_000,
      currency: 'brl',
      metadata: forCity('Lisbon'),
    });
    expect(prisma.donations).toMatchObject([
      { amountCents: 50_000, currency: 'brl' },
    ]);
    expect(prisma.cities[0]).toMatchObject({
      slug: 'lisbon',
      raisedCents: 0,
      donationCount: 0,
      status: 'PROPOSED',
    });
    expect(prisma.donations[0].cityId).toBe(prisma.cities[0].id);
  });

  it('records a donation with no city without making one', async () => {
    const { deliver, prisma } = setup();
    await deliver({ id: 'cs_1', amount: 700 });
    expect(prisma.donations).toMatchObject([
      { cityId: null, cityText: null, amountCents: 700 },
    ]);
    expect(prisma.cities).toHaveLength(0);
  });

  it("reads a payment link's city field and client reference", async () => {
    const { deliver, prisma } = setup();
    await deliver({
      id: 'cs_link',
      amount: 1500,
      metadata: { app: 'tinyworlds', lang: 'pt' },
      cityField: 'Ribeirão Preto',
      clientReferenceId: 'tinyrao',
    });
    expect(prisma.cities[0]).toMatchObject({
      slug: 'ribeirao-preto',
      raisedCents: 1500,
    });
    expect(prisma.donations[0]).toMatchObject({
      world: 'tinyrao',
      locale: 'pt-BR',
    });
  });

  it('ignores other products, unpaid sessions and other kinds of event', async () => {
    const { deliver, prisma } = setup();
    await deliver({ id: 'cs_1', metadata: { app: 'fitbest', city: 'Paris' } });
    await deliver({
      id: 'cs_2',
      paymentStatus: 'unpaid',
      metadata: forCity('Paris'),
    });
    await deliver(
      { id: 'cs_3', metadata: forCity('Paris') },
      'checkout.session.expired',
    );
    await deliver(
      { id: 'cs_4', metadata: forCity('Paris') },
      'payment_intent.succeeded',
    );
    expect(prisma.donations).toHaveLength(0);
    expect(prisma.cities).toHaveLength(0);
  });

  it('survives the same event arriving twice at the same moment', async () => {
    const { service, prisma } = setup();
    const { body, signature } = signedEvent(
      checkoutSession({ id: 'cs_1', amount: 4000, metadata: forCity('Tokyo') }),
    );
    prisma.seedCity({ slug: 'tokyo', name: 'Tokyo' });
    // the other delivery commits between this one's check and its insert
    prisma.commitDuringNextTransaction = () => {
      const tokyo = prisma.cities[0];
      tokyo.raisedCents = 4000;
      tokyo.donationCount = 1;
      prisma.donations.push({
        id: 'the-other-delivery',
        stripeSessionId: 'cs_1',
        stripePaymentIntentId: 'pi_test_1',
        amountCents: 4000,
        currency: 'usd',
        cityId: tokyo.id,
        cityText: 'Tokyo',
        world: 'tinynyc',
        locale: 'en-US',
        visitId: null,
      });
    };
    await service.handleWebhook(body, signature);
    // this one backed out and added nothing of its own
    expect(prisma.donations.map((d) => d.id)).toEqual(['the-other-delivery']);
    expect(prisma.cities[0]).toMatchObject({
      raisedCents: 4000,
      donationCount: 1,
    });
  });

  it('tries again when two donors name the same new city at the same moment', async () => {
    const { service, prisma } = setup();
    const { body, signature } = signedEvent(
      checkoutSession({ id: 'cs_2', amount: 300, metadata: forCity('Osaka') }),
    );
    let raced = false;
    const upsert = prisma.city.upsert;
    prisma.city.upsert = (args) => {
      if (!raced) {
        // the other donor's transaction created the city first
        raced = true;
        return Promise.reject(
          Object.assign(new Error('Unique constraint failed on (slug)'), {
            code: 'P2002',
          }),
        );
      }
      return upsert(args);
    };
    await service.handleWebhook(body, signature);
    expect(prisma.donations).toHaveLength(1);
    expect(prisma.cities).toMatchObject([
      { slug: 'osaka', raisedCents: 300, donationCount: 1 },
    ]);
  });
});
