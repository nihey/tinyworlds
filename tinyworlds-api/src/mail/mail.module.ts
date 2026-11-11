import { Module } from '@nestjs/common';
import { MAILER, mailerProvider } from './mailer.js';

/**
 * The mail server (or, in development, the log), for every module that sends mail: signing in,
 * the thank-you after a donation, and the announcement once a city is built. Tests replace
 * MAILER.
 */
@Module({ providers: [mailerProvider], exports: [MAILER] })
export class MailModule {}
