import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import type { Env } from '../config/env.js';
import type { Locale } from '../donations/locales.js';
import { acceptReturnUrl } from '../donations/return-url.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MAILER, type Mailer } from './mailer.js';
import { sessionSecret } from './session-secret.js';
import { signInMail } from './sign-in-mail.js';

/** How long a sign-in link is good for. */
export const LINK_MINUTES = 15;
/** One link a minute per account, whoever asks: nobody fills a mailbox through this API. */
export const LINK_EVERY_MS = 60_000;
/** A sign-in code is this many digits. */
export const CODE_DIGITS = 6;
/** Wrong codes a link allows before it is spent. */
export const CODE_TRIES = 5;
/** Code tries one account gets in a rolling 24 hours, across all its links. */
export const CODE_TRIES_PER_DAY = 20;
/** The least a refused code try takes, so its timing says nothing about the address. */
export const REFUSAL_FLOOR_MS = 300;
/** Injection token for the refusal floor, so tests can shorten it. */
export const REFUSAL_FLOOR = Symbol('REFUSAL_FLOOR');
/** How long a session lasts before its owner signs in again. */
export const SESSION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The two kinds of account that sign in: an admin (an address on ADMIN_EMAILS) and a donor (any
 * address, to see what it gave). They share the links and codes, never the accounts: an address
 * that is both has one of each.
 */
export const PURPOSES = ['admin', 'donor'] as const;
export type Purpose = (typeof PURPOSES)[number];

export const isPurpose = (value: unknown): value is Purpose =>
  (PURPOSES as readonly unknown[]).includes(value);

/** An account as a route sees it. */
export interface Account {
  id: string;
  email: string;
}

/** Who a session belongs to: the kind of account, and which one. */
export interface SessionIdentity extends Account {
  kind: Purpose;
}

export interface Session {
  accessToken: string;
  expiresAt: Date;
  identity: SessionIdentity;
}

/** The column of `magic_links` that names an account of this kind. */
const linksOf = (kind: Purpose, id: string) =>
  kind === 'admin' ? { adminId: id } : { donorId: id };

/**
 * What went wrong, for the log, without the error's message: a mail server's refusal quotes the
 * address, and so may a database error quoting its query.
 */
export function failureOf(error: unknown): string {
  const { name, code, responseCode } = (error ?? {}) as Record<string, unknown>;
  return (
    [name, code, responseCode]
      .filter((part) => typeof part === 'string' || typeof part === 'number')
      .join(' ') || 'unknown error'
  );
}

/** What is kept of a link's token: enough to recognise it, not enough to use it. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** A code as typed or pasted ("482 913", "482-913"): its digits, or null if they are not six. */
export function normalizeCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length === CODE_DIGITS ? digits : null;
}

/** '482913' as '482 913', the way the mail shows it. */
export const formatCode = (code: string): string =>
  `${code.slice(0, 3)} ${code.slice(3)}`;

/** What is kept of a link's code: an HMAC keyed by the server's secret, never the code. */
export const hashCode = (
  secret: string,
  tokenHash: string,
  code: string,
): string =>
  createHmac('sha256', secret).update(`${tokenHash}:${code}`).digest('hex');

/**
 * Signing in, without passwords, for admins and donors alike: an address asks for a link, the
 * link (and a code) arrives by email, and either is traded for a session (a JWT). An admin is
 * an address on ADMIN_EMAILS; anyone may sign in as a donor, to see what they gave (perhaps
 * nothing yet). Only admins' addresses get an admin's mail, and nothing in an answer says whose
 * they are, nor who has given.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(REFUSAL_FLOOR) private readonly refusalFloorMs: number,
  ) {}

  private isAdmin(email: string): boolean {
    return this.config.get('ADMIN_EMAILS', { infer: true }).includes(email);
  }

  /**
   * Where a sign-in link may lead: a plain page of the site itself, like a checkout's return.
   * Anything else would let the API mail someone a link to somewhere else.
   */
  linkTarget(returnUrl: string): string {
    const target = acceptReturnUrl(
      returnUrl,
      this.config.get('ALLOWED_ORIGINS', { infer: true }),
    );
    if (!target)
      throw new BadRequestException('returnUrl is not a page of this site');
    return target;
  }

  /**
   * The account an address signs in to for a purpose, or null: an admin's (made the first time
   * an address on ADMIN_EMAILS asks), or a donor's, which anyone may have (made the first time
   * the address asks; the gifts it makes, before or after, are its own).
   */
  private async accountFor(
    email: string,
    purpose: Purpose,
  ): Promise<{ id: string } | null> {
    if (purpose === 'donor') {
      try {
        return await this.prisma.donor.upsert({
          where: { email },
          create: { email },
          update: {},
          select: { id: true },
        });
      } catch (error) {
        // two first asks at once: the other one made the account
        if ((error as { code?: string } | null)?.code !== 'P2002') throw error;
        return this.prisma.donor.findUnique({
          where: { email },
          select: { id: true },
        });
      }
    }
    if (!this.isAdmin(email)) return null;
    return this.prisma.admin.upsert({
      where: { email },
      create: { email },
      update: {},
      select: { id: true },
    });
  }

  /**
   * Mails a sign-in link to the address if it has (or, as a donor, may have) an account of the
   * kind asked for, and does nothing otherwise: the caller is told the same either way, so the
   * API never says who the admins are. True when a mail went out.
   */
  async sendLink(
    address: string,
    target: string,
    locale: Locale,
    purpose: Purpose,
  ): Promise<boolean> {
    const email = address.trim().toLowerCase();
    const account = await this.accountFor(email, purpose);
    if (!account) return false;

    const owner = linksOf(purpose, account.id);
    const now = Date.now();
    // cleared by age, not by expiry: a link's tries count towards the account's day
    // (CODE_TRIES_PER_DAY) long after it expired, and must not leave with it
    await this.prisma.magicLink.deleteMany({
      where: { ...owner, createdAt: { lt: new Date(now - DAY_MS) } },
    });
    const recent = await this.prisma.magicLink.findFirst({
      where: { ...owner, createdAt: { gt: new Date(now - LINK_EVERY_MS) } },
      select: { id: true },
    });
    if (recent) return false;

    const token = randomBytes(32).toString('base64url');
    const code = randomInt(0, 10 ** CODE_DIGITS)
      .toString()
      .padStart(CODE_DIGITS, '0');
    const tokenHash = hashToken(token);
    const link = await this.prisma.magicLink.create({
      data: {
        ...owner,
        tokenHash,
        codeHash: hashCode(sessionSecret(this.config), tokenHash, code),
        expiresAt: new Date(now + LINK_MINUTES * 60_000),
      },
      select: { id: true },
    });
    try {
      await this.mailer.send({
        to: email,
        // in the fragment: it never reaches a server's log, nor the page's analytics
        ...signInMail(
          locale,
          `${target}#token=${token}`,
          code,
          LINK_MINUTES,
          purpose,
        ),
      });
    } catch (error) {
      // the account's id, never its address
      this.logger.error(
        `A sign-in link for ${purpose} ${account.id} could not be mailed: ${failureOf(error)}`,
      );
      // a link nobody received must not keep its owner waiting a minute for the next
      await this.prisma.magicLink.deleteMany({ where: { id: link.id } });
      return false;
    }
    return true;
  }

  private refused(): UnauthorizedException {
    return new UnauthorizedException(
      'This sign-in link has expired or was used',
    );
  }

  /** Whose a link is, if that account may still sign in. */
  private ownerOf(link: {
    admin: Account | null;
    donor: Account | null;
  }): SessionIdentity | null {
    if (link.admin)
      return this.isAdmin(link.admin.email)
        ? { kind: 'admin', id: link.admin.id, email: link.admin.email }
        : null;
    if (link.donor)
      return { kind: 'donor', id: link.donor.id, email: link.donor.email };
    return null;
  }

  /** Spends a link, once, and answers with the session it opens for its owner. */
  private async spend(linkId: string, who: SessionIdentity): Promise<Session> {
    const now = new Date();
    // in one statement, so two openings of the same link cannot both get a session
    const spent = await this.prisma.magicLink.updateMany({
      where: { id: linkId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (spent.count !== 1) throw this.refused();

    if (who.kind === 'admin')
      await this.prisma.admin.update({
        where: { id: who.id },
        data: { lastLoginAt: now },
      });
    else
      await this.prisma.donor.update({
        where: { id: who.id },
        data: { lastLoginAt: now },
      });
    return {
      accessToken: await this.jwt.signAsync(
        { sub: who.id, kind: who.kind },
        { expiresIn: `${SESSION_DAYS}d` },
      ),
      expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS),
      identity: who,
    };
  }

  /**
   * Trades a link's token for a session, an admin's or a donor's as the link is. A link works
   * once, and only while it is fresh.
   */
  async verify(token: string): Promise<Session> {
    const link = await this.prisma.magicLink.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        admin: { select: { id: true, email: true } },
        donor: { select: { id: true, email: true } },
      },
    });
    const who = link && this.ownerOf(link);
    if (!link || !who) throw this.refused();
    return this.spend(link.id, who);
  }

  /**
   * Trades the code from a mail for a session of the kind asked for: the same link, the same
   * single use. A wrong code counts against the link, which is spent at CODE_TRIES; an unknown
   * address, a stale link and a wrong code all answer alike.
   */
  async verifyCode(
    address: string,
    code: string,
    purpose: Purpose,
  ): Promise<Session> {
    const started = Date.now();
    try {
      return await this.tryCode(address, code, purpose);
    } catch (error) {
      // every refusal takes the same least time, whatever it cost to reach
      if (error instanceof UnauthorizedException) {
        const wait = this.refusalFloorMs - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }
      throw error;
    }
  }

  private async tryCode(
    address: string,
    code: string,
    purpose: Purpose,
  ): Promise<Session> {
    const email = address.trim().toLowerCase();
    // the same lookups whatever the address, so timing does not tell an account's from a
    // stranger's (and the floor in verifyCode covers what is left)
    const digits = normalizeCode(code) ?? '000000';
    const now = new Date();
    const link = await this.prisma.magicLink.findFirst({
      where: {
        ...(purpose === 'admin' ? { admin: { email } } : { donor: { email } }),
        usedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tokenHash: true,
        codeHash: true,
        admin: { select: { id: true, email: true } },
        donor: { select: { id: true, email: true } },
      },
    });
    const given = Buffer.from(
      hashCode(sessionSecret(this.config), link?.tokenHash ?? '', digits),
      'hex',
    );
    const expected = Buffer.from(link?.codeHash ?? '', 'hex');
    const account = link && (purpose === 'admin' ? link.admin : link.donor);
    if (!link || !account || normalizeCode(code) === null) throw this.refused();

    // an account's tries over a day, across its links. Parallel requests may overshoot this by
    // a few: the per-link claim below is the exact limit, this one only bounds the long run.
    const day = await this.prisma.magicLink.aggregate({
      where: {
        ...linksOf(purpose, account.id),
        createdAt: { gt: new Date(now.getTime() - DAY_MS) },
      },
      _sum: { attempts: true },
    });
    if ((day._sum.attempts ?? 0) >= CODE_TRIES_PER_DAY) throw this.refused();

    // a try is claimed before the code is compared, in one statement: however many tries run at
    // once, no more than CODE_TRIES of them are ever compared
    const claimed = await this.prisma.magicLink.updateMany({
      where: {
        id: link.id,
        usedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: CODE_TRIES },
      },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) throw this.refused();

    const right =
      expected.length === given.length && timingSafeEqual(expected, given);
    const who = this.ownerOf(link);
    if (!right || !who) {
      const after = await this.prisma.magicLink.findUnique({
        where: { id: link.id },
        select: { attempts: true },
      });
      if (after && after.attempts >= CODE_TRIES)
        await this.prisma.magicLink.updateMany({
          where: { id: link.id, usedAt: null },
          data: { usedAt: now },
        });
      throw this.refused();
    }
    return this.spend(link.id, who);
  }

  /**
   * The account a session names, if it may still sign in: an admin only while their address is
   * on ADMIN_EMAILS, a donor for as long as the row is there.
   */
  async identityOf(kind: Purpose, id: string): Promise<SessionIdentity | null> {
    const where = { where: { id }, select: { id: true, email: true } };
    if (kind === 'donor') {
      const donor = await this.prisma.donor.findUnique(where);
      return donor ? { kind, id: donor.id, email: donor.email } : null;
    }
    const admin = await this.prisma.admin.findUnique(where);
    return admin && this.isAdmin(admin.email)
      ? { kind, id: admin.id, email: admin.email }
      : null;
  }
}
