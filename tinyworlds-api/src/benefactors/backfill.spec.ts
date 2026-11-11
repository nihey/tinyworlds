import { FakePrisma, type DonationRow } from '../../test/fake-prisma.js';
import { checkoutSession, FakeStripe } from '../../test/fake-stripe.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { backfillDonors } from './backfill.js';

const donation = (
  sessionId: string,
  over: Partial<DonationRow> = {},
): DonationRow => ({
  id: `d_${sessionId}`,
  stripeSessionId: sessionId,
  stripePaymentIntentId: null,
  amountCents: 500,
  currency: 'usd',
  cityId: null,
  cityText: null,
  world: null,
  locale: null,
  visitId: null,
  donorId: null,
  listed: false,
  ...over,
});

describe('backfillDonors', () => {
  let prisma: FakePrisma;
  let stripe: FakeStripe;
  let lines: string[];
  const run = () =>
    backfillDonors(prisma as unknown as PrismaService, stripe, (l) =>
      lines.push(l),
    );
  const session = (id: string, email: string | null) =>
    stripe.sessions.set(id, checkoutSession({ id, email }));

  beforeEach(() => {
    prisma = new FakePrisma();
    stripe = new FakeStripe();
    lines = [];
  });

  it("fills each donation's donor from Stripe, once", async () => {
    prisma.donations.push(
      donation('cs_1'),
      donation('cs_2'),
      donation('cs_3'),
      donation('cs_4', { donorId: 'already' }),
    );
    session('cs_1', 'Ana@Example.com ');
    session('cs_2', 'ana@example.com');
    session('cs_3', 'bo@example.com');
    expect(await run()).toEqual({ filled: 3, skipped: 0 });
    expect(prisma.donors.map((d) => d.email).sort()).toEqual([
      'ana@example.com',
      'bo@example.com',
    ]);
    const ana = prisma.donors.find((d) => d.email === 'ana@example.com');
    const bo = prisma.donors.find((d) => d.email === 'bo@example.com');
    expect(prisma.donations.map((d) => d.donorId)).toEqual([
      ana?.id,
      ana?.id,
      bo?.id,
      'already',
    ]);
    expect(await run()).toEqual({ filled: 0, skipped: 0 });
    expect(prisma.donors).toHaveLength(2);
  });

  it('skips a session without an email', async () => {
    prisma.donations.push(donation('cs_1'), donation('cs_2'));
    session('cs_1', null);
    session('cs_2', 'not an address');
    expect(await run()).toEqual({ filled: 0, skipped: 2 });
    expect(prisma.donors).toHaveLength(0);
    expect(prisma.donations.every((d) => d.donorId === null)).toBe(true);
  });

  it('leaves every gift unlisted, and prints counts only', async () => {
    prisma.donations.push(donation('cs_1'), donation('cs_2'));
    session('cs_1', 'ana@example.com');
    session('cs_2', 'bo@example.com');
    await run();
    expect(prisma.donations.map((d) => d.listed)).toEqual([false, false]);
    expect(lines.join('\n')).not.toContain('example.com');
    expect(lines.length).toBeGreaterThan(0);
  });
});
