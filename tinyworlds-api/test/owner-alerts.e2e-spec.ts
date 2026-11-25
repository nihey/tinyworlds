import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureHttp } from '../src/http.js';
import { MAILER } from '../src/mail/mailer.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FakeMailer } from './fake-mailer.js';
import { checkoutSession, signedEvent } from './fake-stripe.js';

const OWNER = 'owner@example.com';
const BOT_URL = 'https://api.telegram.org/bot123456:fake-token/sendMessage';

describe('owner alerts from Stripe webhooks', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mailer = new FakeMailer();
  const telegram = vi.fn<typeof fetch>();
  const post = (
    session: Parameters<typeof checkoutSession>[0],
    type?: string,
  ) => {
    const { body, signature } = signedEvent(checkoutSession(session), type);
    return request(app.getHttpServer())
      .post('/api/stripe/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', signature)
      .send(body.toString())
      .expect(200);
  };

  beforeAll(async () => {
    vi.stubEnv('OWNER_ALERT_EMAIL', OWNER);
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456:fake-token');
    vi.stubEnv('TELEGRAM_CHAT_ID', '987654');
    vi.stubGlobal('fetch', telegram);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    configureHttp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.donation.deleteMany({
      where: { stripeSessionId: { startsWith: 'cs_alert_' } },
    });
    await prisma.city.deleteMany({ where: { slug: 'alert-test-city' } });
    await prisma.ownerAlert.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    mailer.sent = [];
    telegram.mockReset();
    telegram.mockImplementation(() =>
      Promise.resolve(Response.json({ ok: true })),
    );
  });

  it('alerts on confirmed amounts and the one funding transition, even with concurrent webhooks and replays', async () => {
    await prisma.city.create({
      data: {
        slug: 'alert-test-city',
        name: 'Alert Test City',
        goalCents: 3000,
        raisedCents: 2500,
      },
    });
    const metadata = { app: 'tinyworlds', city: 'Alert Test City' };
    const first = { id: 'cs_alert_first', amount: 500, metadata };
    const second = { id: 'cs_alert_second', amount: 500, metadata };

    await post({ ...first, paymentStatus: 'unpaid' });
    await post({ id: 'cs_alert_other_app', metadata: { app: 'other' } });
    await Promise.all([
      post(first, 'checkout.session.async_payment_succeeded'),
      post(first),
      post(second),
    ]);

    await vi.waitFor(
      async () => {
        expect(mailer.others(OWNER)).toHaveLength(3);
        expect(telegram).toHaveBeenCalledTimes(3);
        expect(await prisma.ownerAlert.count()).toBe(0);
      },
      { timeout: 7500 },
    );
    const subjects = mailer.others(OWNER).map(({ subject }) => subject);
    expect(
      subjects.filter((subject) => subject.includes('Payment received')),
    ).toHaveLength(2);
    expect(
      subjects.filter((subject) => subject.includes('Ready to build')),
    ).toHaveLength(1);
    expect(
      mailer
        .others(OWNER)
        .every(({ text }) => text.includes('Alert Test City')),
    ).toBe(true);
    expect(mailer.others(OWNER).some(({ text }) => text.includes('US$5'))).toBe(
      true,
    );
    expect(
      mailer.others(OWNER).some(({ text }) => text.includes('US$30')),
    ).toBe(true);
    for (const [url, options] of telegram.mock.calls) {
      expect(url).toBe(BOT_URL);
      expect(options?.method).toBe('POST');
      if (typeof options?.body !== 'string')
        throw new Error('Expected a Telegram JSON request');
      expect(JSON.parse(options.body)).toMatchObject({
        chat_id: '987654',
        text: expect.stringContaining('Alert Test City') as string,
      });
    }
  }, 12_000);

  it('retries a failed Telegram delivery without sending the email again', async () => {
    telegram.mockResolvedValueOnce(
      Response.json({ ok: false }, { status: 503 }),
    );
    await post({ id: 'cs_alert_retry', amount: 500, currency: 'jpy' });

    await vi.waitFor(
      async () => {
        expect(mailer.others(OWNER)).toHaveLength(1);
        const pending = await prisma.ownerAlert.findMany();
        expect(pending).toMatchObject([{ channel: 'TELEGRAM', attempts: 1 }]);
        const delay = pending[0].availableAt.getTime() - Date.now();
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(30_000);
      },
      { timeout: 7500 },
    );
    expect(mailer.others(OWNER)[0].text).toMatch(/JPY\s+500 received/);
    await prisma.ownerAlert.updateMany({ data: { availableAt: new Date() } });

    await vi.waitFor(
      async () => {
        expect(telegram).toHaveBeenCalledTimes(2);
        expect(await prisma.ownerAlert.count()).toBe(0);
      },
      { timeout: 7500 },
    );
    expect(mailer.others(OWNER)).toHaveLength(1);
  }, 17_000);
});
