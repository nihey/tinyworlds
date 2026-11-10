import {
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FakeMailer } from '../../test/fake-mailer.js';
import { FakePrisma } from '../../test/fake-prisma.js';
import type { Env } from '../config/env.js';
import {
  AuthService,
  hashToken,
  LINK_EVERY_MS,
  LINK_MINUTES,
  SESSION_DAYS,
} from './auth.service.js';

const ADMIN = 'admin@example.com';
const PAGE = 'https://example.com/admin/';
const SECRET = 'a-secret-for-the-tests-and-nothing-else';

beforeAll(() => Logger.overrideLogger(false));
afterEach(() => vi.useRealTimers());

function setup(admins: string[] = [ADMIN]) {
  const env = {
    ADMIN_EMAILS: admins,
    ALLOWED_ORIGINS: ['https://example.com', 'http://localhost:3000'],
  };
  const prisma = new FakePrisma();
  const mailer = new FakeMailer();
  const jwt = new JwtService({ secret: SECRET });
  const config = {
    get: (key: keyof typeof env) => env[key],
  } as unknown as ConfigService<Env, true>;
  const service = new AuthService(prisma.asService(), config, jwt, mailer);
  return { prisma, mailer, jwt, service, env };
}

describe('AuthService.linkTarget', () => {
  it('accepts a plain page of the site and nothing else', () => {
    const { service } = setup();
    expect(service.linkTarget(PAGE)).toBe(PAGE);
    for (const elsewhere of [
      'https://evil.test/admin/',
      'https://example.com/admin/?next=https://evil.test',
      'https://example.com/admin/#token=mine',
      'javascript:alert(1)',
    ])
      expect(() => service.linkTarget(elsewhere)).toThrow(BadRequestException);
  });
});

describe('AuthService.sendLink', () => {
  it("mails an admin a link to the page asked for, and keeps only the token's hash", async () => {
    const { service, mailer, prisma } = setup();
    expect(await service.sendLink(ADMIN, PAGE, 'en-US')).toBe(true);

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe(ADMIN);
    const token = mailer.token();
    expect(mailer.sent[0].text).toContain(`${PAGE}#token=${token}`);
    expect(mailer.sent[0].html).toContain(`${PAGE}#token=${token}`);

    expect(prisma.admins.map((admin) => admin.email)).toEqual([ADMIN]);
    expect(prisma.links).toHaveLength(1);
    expect(prisma.links[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(prisma.links)).not.toContain(token);
  });

  it('writes the mail in the language asked for', async () => {
    const { service, mailer } = setup();
    await service.sendLink(ADMIN, PAGE, 'pt-BR');
    expect(mailer.sent[0].subject).toBe('Seu link de acesso ao tinyworlds');
    expect(mailer.sent[0].text).toContain(`${LINK_MINUTES} minutos`);
  });

  it('takes the address however it is typed, and makes one account of it', async () => {
    vi.useFakeTimers();
    const { service, mailer, prisma } = setup();
    await service.sendLink('  Admin@Example.COM ', PAGE, 'en-US');
    vi.advanceTimersByTime(LINK_EVERY_MS + 1);
    await service.sendLink(ADMIN, PAGE, 'en-US');
    expect(mailer.sent.map((mail) => mail.to)).toEqual([ADMIN, ADMIN]);
    expect(prisma.admins).toHaveLength(1);
  });

  it('does nothing for an address that is not an admin', async () => {
    const { service, mailer, prisma } = setup();
    expect(await service.sendLink('someone@example.com', PAGE, 'en-US')).toBe(
      false,
    );
    expect(mailer.sent).toEqual([]);
    expect(prisma.admins).toEqual([]);
    expect(prisma.links).toEqual([]);
  });

  it('does nothing for anyone when there are no admins', async () => {
    const { service, mailer } = setup([]);
    expect(await service.sendLink(ADMIN, PAGE, 'en-US')).toBe(false);
    expect(mailer.sent).toEqual([]);
  });

  it('sends an admin one link a minute, however often it is asked', async () => {
    vi.useFakeTimers();
    const { service, mailer } = setup();
    expect(await service.sendLink(ADMIN, PAGE, 'en-US')).toBe(true);
    expect(await service.sendLink(ADMIN, PAGE, 'en-US')).toBe(false);
    vi.advanceTimersByTime(LINK_EVERY_MS - 1000);
    expect(await service.sendLink(ADMIN, PAGE, 'en-US')).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(await service.sendLink(ADMIN, PAGE, 'en-US')).toBe(true);
    expect(mailer.sent).toHaveLength(2);
  });

  it('forgets a link that could not be mailed, so the next try is not kept waiting', async () => {
    const { service, mailer, prisma } = setup();
    mailer.failWith = new Error('the mail server is away');
    expect(await service.sendLink(ADMIN, PAGE, 'en-US')).toBe(false);
    expect(prisma.links).toEqual([]);
    mailer.failWith = null;
    expect(await service.sendLink(ADMIN, PAGE, 'en-US')).toBe(true);
  });

  it('clears away the links that have expired', async () => {
    vi.useFakeTimers();
    const { service, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    vi.advanceTimersByTime(LINK_MINUTES * 60_000 + 1000);
    await service.sendLink(ADMIN, PAGE, 'en-US');
    expect(prisma.links).toHaveLength(1);
  });
});

describe('AuthService.verify', () => {
  it('trades a fresh link for a session that names the admin', async () => {
    const { service, mailer, jwt, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const session = await service.verify(mailer.token());

    expect(session.admin).toEqual({ id: prisma.admins[0].id, email: ADMIN });
    const payload = await jwt.verifyAsync<{
      sub: string;
      exp: number;
      iat: number;
    }>(session.accessToken);
    expect(payload.sub).toBe(prisma.admins[0].id);
    expect(payload.exp - payload.iat).toBe(SESSION_DAYS * 24 * 60 * 60);
    expect(prisma.admins[0].lastLoginAt).toBeInstanceOf(Date);
  });

  it('works once', async () => {
    const { service, mailer } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const token = mailer.token();
    await service.verify(token);
    await expect(service.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('gives one session when the same link is opened twice at once', async () => {
    const { service, mailer } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const token = mailer.token();
    const results = await Promise.allSettled([
      service.verify(token),
      service.verify(token),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
  });

  it('refuses a link past its time', async () => {
    vi.useFakeTimers();
    const { service, mailer } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    vi.advanceTimersByTime(LINK_MINUTES * 60_000 + 1);
    await expect(service.verify(mailer.token())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses a token it never sent', async () => {
    const { service } = setup();
    await expect(
      service.verify('not-a-token-this-api-ever-made'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses the link of someone who is no longer an admin', async () => {
    const { service, mailer, env } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    env.ADMIN_EMAILS = [];
    await expect(service.verify(mailer.token())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('AuthService.adminOf', () => {
  it('knows an admin by id for as long as their address is on the list', async () => {
    const { service, prisma, env } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const { id } = prisma.admins[0];
    expect(await service.adminOf(id)).toEqual({ id, email: ADMIN });
    expect(
      await service.adminOf('7a0d7d0e-3a55-4b0e-8f2a-0c1d2e3f4a5b'),
    ).toBeNull();
    env.ADMIN_EMAILS = ['someone-else@example.com'];
    expect(await service.adminOf(id)).toBeNull();
  });
});
