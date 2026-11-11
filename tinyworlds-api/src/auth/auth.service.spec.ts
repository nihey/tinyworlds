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
  CODE_TRIES,
  CODE_TRIES_PER_DAY,
  hashCode,
  hashToken,
  LINK_EVERY_MS,
  LINK_MINUTES,
  normalizeCode,
  SESSION_DAYS,
} from './auth.service.js';

const ADMIN = 'admin@example.com';
const PAGE = 'https://example.com/admin/';
const SECRET = 'a-secret-for-the-tests-and-nothing-else';

beforeAll(() => Logger.overrideLogger(false));
afterEach(() => vi.useRealTimers());

function setup(admins: string[] = [ADMIN], floorMs = 0) {
  const env = {
    ADMIN_EMAILS: admins,
    JWT_SECRET: SECRET,
    ALLOWED_ORIGINS: ['https://example.com', 'http://localhost:3000'],
  };
  const prisma = new FakePrisma();
  const mailer = new FakeMailer();
  const jwt = new JwtService({ secret: SECRET });
  const config = {
    get: (key: keyof typeof env) => env[key],
  } as unknown as ConfigService<Env, true>;
  const service = new AuthService(
    prisma.asService(),
    config,
    jwt,
    mailer,
    floorMs,
  );
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
    expect(mailer.sent[0].subject).toMatch(
      /^Seu código do tinyworlds: \d{3} \d{3}$/,
    );
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

describe('normalizeCode', () => {
  it('takes a code however it is pasted', () => {
    for (const raw of ['482 913', '482-913', ' 482913 '])
      expect(normalizeCode(raw)).toBe('482913');
    expect(normalizeCode('48291')).toBeNull();
    expect(normalizeCode('4829134')).toBeNull();
  });
});

describe('AuthService.verifyCode', () => {
  const codeOf = (mailer: FakeMailer) => mailer.code();
  const wrongOf = (code: string) => (code === '000000' ? '111111' : '000000');

  it('mails a code with the link, and keeps only its HMAC', async () => {
    const { service, mailer, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    expect(mailer.sent[0].subject).toMatch(/\d{3} \d{3}/);
    const code = codeOf(mailer);
    expect(prisma.links[0].codeHash).not.toBe(code);
    expect(prisma.links[0].codeHash).toBe(
      hashCode(SECRET, hashToken(mailer.token()), code),
    );
    expect(JSON.stringify(prisma.links)).not.toContain(code);
  });

  it('trades the right code for a session, once', async () => {
    const { service, mailer, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const code = codeOf(mailer);
    const session = await service.verifyCode('Admin@Example.com', code);
    expect(session.admin).toEqual({ id: prisma.admins[0].id, email: ADMIN });
    await expect(service.verifyCode(ADMIN, code)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('spends the link after five wrong codes, even for the right one after', async () => {
    const { service, mailer, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const code = codeOf(mailer);
    for (let i = 0; i < CODE_TRIES; i++)
      await expect(
        service.verifyCode(ADMIN, wrongOf(code)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.links[0].usedAt).toBeInstanceOf(Date);
    await expect(service.verifyCode(ADMIN, code)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.verify(mailer.token())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('a code spends the link, and the link spends the code', async () => {
    const first = setup();
    await first.service.sendLink(ADMIN, PAGE, 'en-US');
    await first.service.verifyCode(ADMIN, codeOf(first.mailer));
    await expect(
      first.service.verify(first.mailer.token()),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const second = setup();
    await second.service.sendLink(ADMIN, PAGE, 'en-US');
    await second.service.verify(second.mailer.token());
    await expect(
      second.service.verifyCode(ADMIN, codeOf(second.mailer)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a code for an address that is not an admin, the same way', async () => {
    const { service, mailer } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const code = codeOf(mailer);
    const error = await service
      .verifyCode('someone@example.com', code)
      .catch((e: unknown) => e);
    const bad = await service
      .verifyCode(ADMIN, wrongOf(code))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as Error).message).toBe((bad as Error).message);
  });

  it('signs in with the right code after four wrong ones, and the link is still unspent', async () => {
    const { service, mailer, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const code = codeOf(mailer);
    for (let i = 0; i < CODE_TRIES - 1; i++)
      await service.verifyCode(ADMIN, wrongOf(code)).catch(() => undefined);
    expect(prisma.links[0].usedAt).toBeNull();
    expect(prisma.links[0].attempts).toBe(CODE_TRIES - 1);
    await expect(service.verifyCode(ADMIN, code)).resolves.toBeDefined();
  });

  it('compares no more than five codes however many arrive at once', async () => {
    const { service, mailer, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const code = codeOf(mailer);
    const results = await Promise.allSettled([
      ...Array.from({ length: 20 }, () =>
        service.verifyCode(ADMIN, wrongOf(code)),
      ),
      service.verifyCode(ADMIN, code),
    ]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(prisma.links[0].attempts).toBeLessThanOrEqual(CODE_TRIES);
    await expect(service.verifyCode(ADMIN, code)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('never refuses sooner than the floor, for a stranger or an admin with a live link', async () => {
    const floor = 80;
    const { service, mailer } = setup([ADMIN], floor);
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const code = codeOf(mailer);
    for (const [address, tried] of [
      ['someone@example.com', code],
      [ADMIN, wrongOf(code)],
    ]) {
      const started = Date.now();
      await expect(service.verifyCode(address, tried)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(Date.now() - started).toBeGreaterThanOrEqual(floor - 5);
    }
  });

  it('allows an account only so many tries a day across its links, but the token still works', async () => {
    vi.useFakeTimers();
    const { service, mailer, prisma } = setup();
    for (let i = 0; i < CODE_TRIES_PER_DAY / CODE_TRIES; i++) {
      await service.sendLink(ADMIN, PAGE, 'en-US');
      const code = codeOf(mailer);
      for (let t = 0; t < CODE_TRIES; t++)
        await service.verifyCode(ADMIN, wrongOf(code)).catch(() => undefined);
      vi.advanceTimersByTime(LINK_EVERY_MS + 1);
    }
    await service.sendLink(ADMIN, PAGE, 'en-US');
    const fresh = prisma.links.at(-1);
    expect(fresh?.attempts).toBe(0);
    await expect(
      service.verifyCode(ADMIN, codeOf(mailer)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fresh?.attempts).toBe(0); // refused without claiming
    await expect(service.verify(mailer.token())).resolves.toBeDefined();
  });

  it('forgets tries older than a day', async () => {
    vi.useFakeTimers();
    const { service, mailer } = setup();
    for (let i = 0; i < CODE_TRIES_PER_DAY / CODE_TRIES; i++) {
      await service.sendLink(ADMIN, PAGE, 'en-US');
      const code = codeOf(mailer);
      for (let t = 0; t < CODE_TRIES; t++)
        await service.verifyCode(ADMIN, wrongOf(code)).catch(() => undefined);
      vi.advanceTimersByTime(LINK_EVERY_MS + 1);
    }
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    await service.sendLink(ADMIN, PAGE, 'en-US');
    await expect(
      service.verifyCode(ADMIN, codeOf(mailer)),
    ).resolves.toBeDefined();
  });

  it('refuses a code past its time', async () => {
    vi.useFakeTimers();
    const { service, mailer } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US');
    vi.advanceTimersByTime(LINK_MINUTES * 60_000 + 1);
    await expect(
      service.verifyCode(ADMIN, codeOf(mailer)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
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
