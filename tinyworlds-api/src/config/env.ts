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

/** Who a mail may be from: an address, or `Name <address>`. */
const SENDER =
  /^(?:[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+|[^<>]+ <[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>)$/;

/** A phone number with its country code, as someone writes it: "+1 555 010-0199". */
const isPhone = (text: string): boolean => {
  const digits = text.replace(/\D/g, '').length;
  return /^\+[\d\s().-]+$/.test(text) && digits >= 8 && digits <= 15;
};

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
  CITY_GOAL_CENTS: z.coerce.number().int().positive().default(3_000),
  /**
   * Where the site is served from: the CORS allow-list, where a checkout may return to, and
   * where a sign-in link may lead.
   */
  ALLOWED_ORIGINS: origins,
  /** Who may sign in to the admin pages. Empty: nobody. */
  ADMIN_EMAILS: emails,
  /** Signs the sessions, and keys the sign-in codes' HMAC. */
  JWT_SECRET: optional,
  /** The mail server that sends the sign-in links, and the address they come from. */
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  MAIL_FROM: optional,
  /**
   * The site's owner, for the note they send each donor once (benefactors/note-cli.ts): how
   * they sign it, who it is from (an address, or `Name <address>`: one the mail server may
   * send for), and their WhatsApp number as they write it, country code first. The note is
   * only sent with all three; nothing else needs them.
   */
  OWNER_NAME: optional,
  OWNER_MAIL_FROM: optional.refine(
    (from) => from === undefined || SENDER.test(from),
    'OWNER_MAIL_FROM must be an address, or "Name <address>"',
  ),
  OWNER_WHATSAPP: optional.refine(
    (number) => number === undefined || isPhone(number),
    'OWNER_WHATSAPP must be a phone number with its country code, such as "+1 555 010-0199"',
  ),
  /**
   * The site's origin, for every link and picture in a mail. Left out: the first of
   * ALLOWED_ORIGINS.
   */
  SITE_URL: optional.transform((value, ctx) => {
    if (value === undefined) return undefined;
    const origin = originOf(value);
    if (!origin)
      ctx.addIssue({
        code: 'custom',
        message: `"${value}" is not an http(s) origin`,
      });
    return origin ?? undefined;
  }),
});

/**
 * Signing in has to be able to work wherever someone can sign in. In production that is always
 * (donors sign in whether or not there are admins): a secret to sign sessions with, and a mail
 * server to send the links through. Elsewhere only naming an admin asks for the secret, and the
 * link is written to the log instead of mailed.
 */
export const envSchema = baseSchema
  .superRefine((env, ctx) => {
    const production = env.NODE_ENV === 'production';
    if (
      (production || env.ADMIN_EMAILS.length > 0) &&
      (env.JWT_SECRET ?? '').length < JWT_SECRET_MIN
    )
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: production
          ? `In production, JWT_SECRET must be at least ${JWT_SECRET_MIN} characters: donors sign in whether or not there are admins`
          : `With ADMIN_EMAILS set, JWT_SECRET must be at least ${JWT_SECRET_MIN} characters`,
      });
    if (!production) return;
    // the mails link people to the site and show its pictures: never over plain http
    const site = env.SITE_URL ?? env.ALLOWED_ORIGINS[0];
    if (site && !site.startsWith('https://'))
      ctx.addIssue({
        code: 'custom',
        path: ['SITE_URL'],
        message: `In production, SITE_URL (or, without it, the first of ALLOWED_ORIGINS) must be https: the mails link to it, and "${site}" is not`,
      });
    for (const name of ['SMTP_HOST', 'MAIL_FROM'] as const)
      if (!env[name])
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: `${name} is required in production: sign-in links go out by email`,
        });
  })
  .transform((env) => ({
    ...env,
    SITE_URL: env.SITE_URL ?? env.ALLOWED_ORIGINS[0],
  }));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
