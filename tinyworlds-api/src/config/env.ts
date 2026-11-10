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

/** A setting that may be left out: an empty value counts as left out. */
const optional = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

/** A comma-separated list of email addresses, lower-cased. May be empty. */
const emails = z
  .string()
  .default('')
  .transform((value, ctx) => {
    const list: string[] = [];
    for (const entry of value.split(',')) {
      const email = entry.trim().toLowerCase();
      if (!email) continue;
      if (z.email().safeParse(email).success) list.push(email);
      else
        ctx.addIssue({
          code: 'custom',
          message: `"${email}" is not an email address`,
        });
    }
    return [...new Set(list)];
  });

/** The least a JWT secret may be: 32 characters. */
export const JWT_SECRET_MIN = 32;

const baseSchema = z.object({
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
  /**
   * Where the site is served from: the CORS allow-list, where a checkout may return to, and
   * where a sign-in link may lead.
   */
  ALLOWED_ORIGINS: origins,
  /** Who may sign in to the admin pages. Empty: nobody, and nothing below is needed. */
  ADMIN_EMAILS: emails,
  /** Signs the admins' sessions. */
  JWT_SECRET: optional,
  /** The mail server that sends the sign-in links, and the address they come from. */
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  MAIL_FROM: optional,
});

/**
 * Signing in is switched on by naming an admin, and then it has to be able to work: a secret to
 * sign sessions with, and in production a mail server to send the links through (elsewhere the
 * link is written to the log instead).
 */
export const envSchema = baseSchema.superRefine((env, ctx) => {
  if (env.ADMIN_EMAILS.length === 0) return;
  if ((env.JWT_SECRET ?? '').length < JWT_SECRET_MIN)
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message: `With ADMIN_EMAILS set, JWT_SECRET must be at least ${JWT_SECRET_MIN} characters`,
    });
  if (env.NODE_ENV !== 'production') return;
  for (const name of ['SMTP_HOST', 'MAIL_FROM'] as const)
    if (!env[name])
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: `With ADMIN_EMAILS set, ${name} is required in production: sign-in links go out by email`,
      });
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
