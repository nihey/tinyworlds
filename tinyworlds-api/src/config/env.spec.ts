import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5434/db',
  STRIPE_SECRET_KEY: 'sk_test_example',
  STRIPE_WEBHOOK_SECRET: 'whsec_example',
  STRIPE_PRICE_EN: 'price_en',
  STRIPE_PRICE_PT: 'price_pt',
  STRIPE_PRICE_ES: 'price_es',
  ALLOWED_ORIGINS: 'http://localhost:3000',
};

describe('validateEnv', () => {
  it('fills in the defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CITY_GOAL_CENTS).toBe(10_000);
  });

  it('reduces every allowed origin to scheme, host and port', () => {
    const env = validateEnv({
      ...base,
      ALLOWED_ORIGINS:
        ' https://example.com/tinynyc/ , http://localhost:3000 ,',
    });
    expect(env.ALLOWED_ORIGINS).toEqual([
      'https://example.com',
      'http://localhost:3000',
    ]);
  });

  it('refuses to start without an origin, or with one that is not http(s)', () => {
    expect(() => validateEnv({ ...base, ALLOWED_ORIGINS: '' })).toThrow(
      /at least one origin/,
    );
    expect(() =>
      validateEnv({ ...base, ALLOWED_ORIGINS: 'example.com' }),
    ).toThrow(/not an http\(s\) origin/);
  });

  it('refuses to start without the Stripe settings', () => {
    for (const key of [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_EN',
      'STRIPE_PRICE_PT',
      'STRIPE_PRICE_ES',
      'DATABASE_URL',
    ]) {
      expect(() => validateEnv({ ...base, [key]: '  ' })).toThrow(key);
    }
  });

  it('reads the goal as whole cents', () => {
    expect(
      validateEnv({ ...base, CITY_GOAL_CENTS: '25000' }).CITY_GOAL_CENTS,
    ).toBe(25_000);
    expect(() => validateEnv({ ...base, CITY_GOAL_CENTS: '0' })).toThrow();
  });
});
