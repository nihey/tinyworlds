import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AMOUNT_MAX_CENTS,
  AMOUNT_MIN_CENTS,
  CreateDonationCheckoutInput,
} from './create-donation-checkout.input.js';

const good = {
  world: 'tinynyc',
  locale: 'en-US',
  returnUrl: 'https://example.com/tinynyc/',
};

/** The properties the validation pipe would refuse, with the reasons it would give. */
async function refused(input: Record<string, unknown>) {
  const errors = await validate(
    plainToInstance(CreateDonationCheckoutInput, input),
  );
  return Object.fromEntries(
    errors.map((error) => [
      error.property,
      Object.values(error.constraints ?? {}),
    ]),
  );
}

describe('CreateDonationCheckoutInput.amountCents', () => {
  it('is optional: without it the amount is chosen at Stripe', async () => {
    expect(await refused(good)).toEqual({});
    expect(await refused({ ...good, amountCents: null })).toEqual({});
    expect(await refused({ ...good, amountCents: undefined })).toEqual({});
  });

  it('accepts US$1 to US$10,000, both ends included', async () => {
    expect(AMOUNT_MIN_CENTS).toBe(100);
    expect(AMOUNT_MAX_CENTS).toBe(1_000_000);
    for (const amountCents of [100, 101, 500, 12_345, 999_999, 1_000_000]) {
      expect(await refused({ ...good, amountCents })).toEqual({});
    }
  });

  it('refuses less than a dollar, saying so', async () => {
    for (const amountCents of [99, 1, 0, -500]) {
      expect(await refused({ ...good, amountCents })).toEqual({
        amountCents: ['amountCents must be at least 100 (US$1)'],
      });
    }
  });

  it('refuses more than ten thousand dollars, saying so', async () => {
    for (const amountCents of [1_000_001, 5_000_000]) {
      expect(await refused({ ...good, amountCents })).toEqual({
        amountCents: ['amountCents must be at most 1000000 (US$10,000)'],
      });
    }
  });

  it('refuses anything that is not a whole number of cents', async () => {
    for (const amountCents of [500.5, '500', Number.NaN, Infinity, true]) {
      const reasons = (await refused({ ...good, amountCents })).amountCents;
      expect(reasons).toContain(
        'amountCents must be a whole number of US cents',
      );
    }
  });
});

describe('CreateDonationCheckoutInput.benefactorName', () => {
  it('is optional, trimmed, and at most 40 characters', async () => {
    expect(await refused({ ...good, benefactorName: '  Ana ' })).toEqual({});
    expect(await refused({ ...good, benefactorName: null })).toEqual({});
    expect(
      Object.keys(await refused({ ...good, benefactorName: 'a'.repeat(41) })),
    ).toEqual(['benefactorName']);
    expect(await refused({ ...good, benefactorName: 'a'.repeat(40) })).toEqual(
      {},
    );
  });
});
