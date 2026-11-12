import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { Env } from '../config/env.js';

export const MAILER = Symbol('MAILER');

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, such as List-Unsubscribe. */
  headers?: Record<string, string>;
  /** Who it is from, when that is not the site (MAIL_FROM): the owner's own note. */
  from?: string;
}

/** What the API needs of a mail server; tests replace it. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** How long the mail server may take before the attempt is given up. */
export const SMTP_TIMEOUT_MS = 10_000;

/**
 * No mail server: the message goes to the log instead, so signing in works on a developer's
 * machine with nothing set up. Never in production (the environment check refuses to start
 * without a mail server): there the link is a key to an account, and logs are read by more
 * people than mailboxes.
 */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mail');

  constructor(private readonly production: boolean) {}

  send(mail: Mail): Promise<void> {
    if (this.production)
      // not even the subject: it carries the code
      this.logger.error('No mail server is configured: a mail was not sent');
    else
      this.logger.log(
        `No mail server is configured, so here is the mail.\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}`,
      );
    return Promise.resolve();
  }
}

/**
 * The codes of a mail server that is away or refuses the connection itself (not one address):
 * every mail after such a failure would fail the same way, after the same wait.
 */
const SERVER_FAILURES = new Set([
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ESOCKET',
  'EDNS',
  'ETLS',
  'EAUTH',
  'EPROTOCOL',
]);

/** The mail server failed, not the mail: no use trying the next one now. */
export function isServerFailure(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && SERVER_FAILURES.has(code);
}

/** What the mailer is made from. */
export type MailEnv = Pick<
  Env,
  | 'NODE_ENV'
  | 'SMTP_HOST'
  | 'SMTP_PORT'
  | 'SMTP_USER'
  | 'SMTP_PASSWORD'
  | 'MAIL_FROM'
>;

/** How a mail server is reached. */
interface ServerOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

/** What the mailer asks of a connection to a mail server; tests hand it one of their own. */
export interface Transport {
  sendMail(mail: Mail & { from: string }): Promise<unknown>;
}

const connectSmtp = (options: ServerOptions): Transport =>
  createTransport(options);

/**
 * The mail server the environment names, or the log when it names none. Used by the app (as
 * MAILER) and by the commands that send mail outside it (announce-cli.ts). A mail goes out
 * from the site (MAIL_FROM) unless it says itself who it is from.
 */
export function createMailer(
  env: MailEnv,
  connect: (options: ServerOptions) => Transport = connectSmtp,
): Mailer {
  const { SMTP_HOST: host, MAIL_FROM: from, SMTP_PORT: port } = env;
  if (!host || !from) return new LogMailer(env.NODE_ENV === 'production');
  const user = env.SMTP_USER;
  const transport = connect({
    host,
    port,
    // 465 speaks TLS from the first byte; the others start plain and upgrade (STARTTLS)
    secure: port === 465,
    auth: user ? { user, pass: env.SMTP_PASSWORD ?? '' } : undefined,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  return {
    send: async (mail) => {
      await transport.sendMail({ ...mail, from: mail.from ?? from });
    },
  };
}

export const mailerProvider: Provider = {
  provide: MAILER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): Mailer =>
    createMailer({
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      SMTP_HOST: config.get('SMTP_HOST', { infer: true }),
      SMTP_PORT: config.get('SMTP_PORT', { infer: true }),
      SMTP_USER: config.get('SMTP_USER', { infer: true }),
      SMTP_PASSWORD: config.get('SMTP_PASSWORD', { infer: true }),
      MAIL_FROM: config.get('MAIL_FROM', { infer: true }),
    }),
};
