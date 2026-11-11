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

export const mailerProvider: Provider = {
  provide: MAILER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): Mailer => {
    const host = config.get('SMTP_HOST', { infer: true });
    const from = config.get('MAIL_FROM', { infer: true });
    if (!host || !from)
      return new LogMailer(
        config.get('NODE_ENV', { infer: true }) === 'production',
      );
    const port = config.get('SMTP_PORT', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    const transport = createTransport({
      host,
      port,
      // 465 speaks TLS from the first byte; the others start plain and upgrade (STARTTLS)
      secure: port === 465,
      auth: user
        ? { user, pass: config.get('SMTP_PASSWORD', { infer: true }) ?? '' }
        : undefined,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
    return {
      send: async (mail) => {
        await transport.sendMail({ from, ...mail });
      },
    };
  },
};
