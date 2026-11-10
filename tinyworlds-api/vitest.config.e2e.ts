import { defineConfig } from 'vitest/config';

/** The e2e tests' database: its own, on the Postgres that docker-compose.yml starts. */
export const E2E_DATABASE_URL =
  'postgresql://tinyworlds:tinyworlds@localhost:5434/tinyworlds_test';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // the whole environment, so no .env file is involved; Stripe is faked (test/fake-stripe.ts)
    // and so is the mail
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: E2E_DATABASE_URL,
      STRIPE_SECRET_KEY: 'sk_test_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
      STRIPE_PRICE_EN: 'price_en',
      STRIPE_PRICE_PT: 'price_pt',
      STRIPE_PRICE_ES: 'price_es',
      CITY_GOAL_CENTS: '10000',
      ALLOWED_ORIGINS: 'https://example.com,http://localhost:3000',
      // one admin; the mail is kept by test/fake-mailer.ts instead of being sent
      ADMIN_EMAILS: 'admin@example.com',
      JWT_SECRET: 'a-secret-for-the-tests-and-nothing-else',
    },
    globalSetup: ['./test/global-setup.ts'],
    // one database, emptied between tests: one file at a time
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
