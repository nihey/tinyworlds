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
    expect(env.CITY_GOAL_CENTS).toBe(3_000);
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

  it('needs nothing for signing in while there are no admins', () => {
    const env = validateEnv(base);
    expect(env.ADMIN_EMAILS).toEqual([]);
    expect(env.JWT_SECRET).toBeUndefined();
    expect(env.SMTP_PORT).toBe(587);
  });

  it('reads the admins as a tidy list of addresses', () => {
    const env = validateEnv({
      ...base,
      ADMIN_EMAILS: ' Admin@Example.com, other@example.com ,admin@example.com,',
      JWT_SECRET: 'x'.repeat(32),
    });
    expect(env.ADMIN_EMAILS).toEqual([
      'admin@example.com',
      'other@example.com',
    ]);
    expect(() =>
      validateEnv({ ...base, ADMIN_EMAILS: 'not-an-address' }),
    ).toThrow(/not an email address/);
  });

  it('refuses to start with an admin and no secret worth the name', () => {
    const admins = { ...base, ADMIN_EMAILS: 'admin@example.com' };
    expect(() => validateEnv(admins)).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...admins, JWT_SECRET: 'short' })).toThrow(
      /at least 32 characters/,
    );
    expect(
      validateEnv({ ...admins, JWT_SECRET: 'x'.repeat(32) }).JWT_SECRET,
    ).toHaveLength(32);
  });

  it('in production, refuses an admin without a mail server to send links through', () => {
    const admins = {
      ...base,
      NODE_ENV: 'production',
      ADMIN_EMAILS: 'admin@example.com',
      JWT_SECRET: 'x'.repeat(32),
    };
    expect(() => validateEnv(admins)).toThrow(/SMTP_HOST/);
    expect(() =>
      validateEnv({ ...admins, SMTP_HOST: 'smtp.example.com' }),
    ).toThrow(/MAIL_FROM/);
    const env = validateEnv({
      ...admins,
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      MAIL_FROM: 'tinyworlds <hello@example.com>',
    });
    expect(env.SMTP_PORT).toBe(465);
  });

  it('production needs a session secret and a mail server even without admins', () => {
    const production = { ...base, NODE_ENV: 'production' };
    expect(() => validateEnv(production)).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...production, JWT_SECRET: 'short' })).toThrow(
      /at least 32 characters/,
    );
    const secret = { ...production, JWT_SECRET: 'x'.repeat(32) };
    expect(() => validateEnv(secret)).toThrow(/SMTP_HOST/);
    expect(() =>
      validateEnv({ ...secret, SMTP_HOST: 'smtp.example.com' }),
    ).toThrow(/MAIL_FROM/);
    const env = validateEnv({
      ...secret,
      SMTP_HOST: 'smtp.example.com',
      MAIL_FROM: 'tinyworlds <hello@example.com>',
    });
    expect(env.ADMIN_EMAILS).toEqual([]);
    expect(env.NODE_ENV).toBe('production');
  });

  it('development needs neither', () => {
    for (const NODE_ENV of ['development', 'test']) {
      const env = validateEnv({ ...base, NODE_ENV });
      expect(env.JWT_SECRET).toBeUndefined();
      expect(env.SMTP_HOST).toBeUndefined();
      expect(env.MAIL_FROM).toBeUndefined();
    }
  });
});
