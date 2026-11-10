import { z } from 'zod';

/** The origin of an http(s) URL, or null. */
function originOf(text: string): string | null {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/** A comma-separated list of origins, each reduced to scheme + host + port. */
const origins = z
  .string()
  .default('')
  .transform((value, ctx) => {
    const list: string[] = [];
    for (const entry of value.split(',')) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const origin = originOf(trimmed);
      if (origin) list.push(origin);
      else
        ctx.addIssue({
          code: 'custom',
          message: `"${trimmed}" is not an http(s) origin`,
        });
    }
    if (list.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Give at least one origin, e.g. http://localhost:3000',
      });
    }
    return list;
  });

const required = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1));

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: required,
  /** Creates Checkout sessions. */
  STRIPE_SECRET_KEY: required,
  /** Verifies what Stripe posts to /api/stripe/webhook. */
  STRIPE_WEBHOOK_SECRET: required,
  /** Pay-what-you-want prices, one per interface language. */
  STRIPE_PRICE_EN: required,
  STRIPE_PRICE_PT: required,
  STRIPE_PRICE_ES: required,
  /** What a city needs before it is built, in US cents. */
  CITY_GOAL_CENTS: z.coerce.number().int().positive().default(10_000),
  /** Where the site is served from: the CORS allow-list, and where a checkout may return to. */
  ALLOWED_ORIGINS: origins,
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
