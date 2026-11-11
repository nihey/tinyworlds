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
/** One link a minute per admin, whoever asks: nobody fills a mailbox through this API. */
export const LINK_EVERY_MS = 60_000;
/** A sign-in code is this many digits. */
export const CODE_DIGITS = 6;
/** Wrong codes a link allows before it is spent. */
export const CODE_TRIES = 5;
/** How long a session lasts before the admin signs in again. */
export const SESSION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Who a session belongs to. */
export interface AdminIdentity {
  id: string;
  email: string;
}

export interface Session {
  accessToken: string;
  expiresAt: Date;
  admin: AdminIdentity;
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
 * Signing in, for admins only and without passwords: an address on ADMIN_EMAILS asks for a
 * link, the link arrives by email, and opening it trades its token for a session (a JWT).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly jwt: JwtService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  private isAdmin(email: string): boolean {
    return this.config.get('ADMIN_EMAILS', { infer: true }).includes(email);
  }

  /**
   * Where a sign-in link may lead: a plain page of the site itself, like a checkout's return.
   * Anything else would let the API mail an admin a link to somewhere else.
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
   * Mails a sign-in link to the address if it is an admin's, and does nothing otherwise: the
   * caller is told the same either way, so the API never says who the admins are. The account
   * is made the first time its address asks. True when a mail went out.
   */
  async sendLink(
    address: string,
    target: string,
    locale: Locale,
  ): Promise<boolean> {
    const email = address.trim().toLowerCase();
    if (!this.isAdmin(email)) return false;

    const admin = await this.prisma.admin.upsert({
      where: { email },
      create: { email },
      update: {},
      select: { id: true },
    });
    const now = Date.now();
    await this.prisma.magicLink.deleteMany({
      where: { adminId: admin.id, expiresAt: { lt: new Date(now) } },
    });
    const recent = await this.prisma.magicLink.findFirst({
      where: {
        adminId: admin.id,
        createdAt: { gt: new Date(now - LINK_EVERY_MS) },
      },
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
        adminId: admin.id,
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
          'admin',
        ),
      });
    } catch (error) {
      this.logger.error(
        `A sign-in link could not be mailed: ${(error as Error).message}`,
      );
      // a link nobody received must not keep the admin waiting a minute for the next
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

  /** Spends a link, once, and answers with the session it opens. */
  private async spend(link: {
    id: string;
    admin: AdminIdentity;
  }): Promise<Session> {
    const now = new Date();
    // in one statement, so two openings of the same link cannot both get a session
    const spent = await this.prisma.magicLink.updateMany({
      where: { id: link.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (spent.count !== 1) throw this.refused();

    await this.prisma.admin.update({
      where: { id: link.admin.id },
      data: { lastLoginAt: now },
    });
    return {
      accessToken: await this.jwt.signAsync(
        { sub: link.admin.id },
        { expiresIn: `${SESSION_DAYS}d` },
      ),
      expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS),
      admin: { id: link.admin.id, email: link.admin.email },
    };
  }

  /** Trades a link's token for a session. A link works once, and only while it is fresh. */
  async verify(token: string): Promise<Session> {
    const link = await this.prisma.magicLink.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, admin: { select: { id: true, email: true } } },
    });
    if (!link || !this.isAdmin(link.admin.email)) throw this.refused();
    return this.spend(link);
  }

  /**
   * Trades the code from a mail for a session: the same link, the same single use. A wrong code
   * counts against the link, which is spent at CODE_TRIES; an unknown address, a stale link and
   * a wrong code all answer alike.
   */
  async verifyCode(address: string, code: string): Promise<Session> {
    const email = address.trim().toLowerCase();
    const digits = normalizeCode(code);
    if (!digits || !this.isAdmin(email)) throw this.refused();

    const now = new Date();
    const admin = await this.prisma.admin.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    const link =
      admin &&
      (await this.prisma.magicLink.findFirst({
        where: { adminId: admin.id, usedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, tokenHash: true, codeHash: true },
      }));
    if (!admin || !link) throw this.refused();

    const expected = Buffer.from(link.codeHash, 'hex');
    const given = Buffer.from(
      hashCode(sessionSecret(this.config), link.tokenHash, digits),
      'hex',
    );
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      const tried = await this.prisma.magicLink.update({
        where: { id: link.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      if (tried.attempts >= CODE_TRIES)
        await this.prisma.magicLink.updateMany({
          where: { id: link.id, usedAt: null },
          data: { usedAt: now },
        });
      throw this.refused();
    }
    return this.spend({ id: link.id, admin });
  }

  /** The admin a session names, if they still are one. */
  async adminOf(id: string): Promise<AdminIdentity | null> {
    const admin = await this.prisma.admin.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    return admin && this.isAdmin(admin.email)
      ? { id: admin.id, email: admin.email }
      : null;
  }
}
