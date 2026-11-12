import {
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { FakeMailer } from '../../test/fake-mailer.js';
import { FakePrisma } from '../../test/fake-prisma.js';
import type { Env } from '../config/env.js';
import { ListsService } from '../lists/lists.service.js';
import type { SightsCatalog } from '../lists/sights-catalog.js';
import {
  AuthService,
  CODE_TRIES,
  CODE_TRIES_PER_DAY,
  failureOf,
  hashCode,
  hashToken,
  LINK_EVERY_MS,
  LINK_MINUTES,
  normalizeCode,
  SESSION_DAYS,
} from './auth.service.js';

const ADMIN = 'admin@example.com';
const DONOR = 'ana@example.com';
const PAGE = 'https://example.com/admin/';
const HOME = 'https://example.com/';
const SECRET = 'a-secret-for-the-tests-and-nothing-else';
const DAY_MS = 24 * 60 * 60 * 1000;

/** A donor row, with one gift unless told otherwise. */
function seedDonor(prisma: FakePrisma, email = DONOR, given = true) {
  const donor = { id: randomUUID(), email, displayName: null };
  prisma.donors.push(donor);
  if (given)
    prisma.donations.push({
      id: randomUUID(),
      stripeSessionId: `cs_${donor.id}`,
      stripePaymentIntentId: null,
      amountCents: 500,
      currency: 'usd',
      cityId: null,
      cityText: null,
      world: null,
      locale: null,
      visitId: null,
      donorId: donor.id,
      listed: false,
    });
  return donor;
}

beforeAll(() => Logger.overrideLogger(false));
afterEach(() => vi.useRealTimers());

function setup(admins: string[] = [ADMIN], floorMs = 0) {
  const env = {
    ADMIN_EMAILS: admins,
    JWT_SECRET: SECRET,
    ALLOWED_ORIGINS: ['https://example.com', 'http://localhost:3000'],
    SITE_URL: 'https://example.com',
  };
  const prisma = new FakePrisma();
  const mailer = new FakeMailer();
  const jwt = new JwtService({ secret: SECRET });
  const config = {
    get: (key: keyof typeof env) => env[key],
  } as unknown as ConfigService<Env, true>;
  const catalog = {
    pickAcross: () => Promise.resolve({ sights: [], unread: [] }),
  } as unknown as SightsCatalog;
  const lists = new ListsService(prisma.asService(), config, mailer, catalog);
  const service = new AuthService(
    prisma.asService(),
    config,
    jwt,
    mailer,
    floorMs,
    lists,
  );
  return { prisma, mailer, jwt, service, env, lists };
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
    expect(await service.sendLink(ADMIN, PAGE, 'en-US', 'admin')).toBe(true);

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
    await service.sendLink(ADMIN, PAGE, 'pt-BR', 'admin');
    expect(mailer.sent[0].subject).toMatch(
      /^Seu código do tinyworlds: \d{3} \d{3}$/,
    );
    expect(mailer.sent[0].text).toContain(`${LINK_MINUTES} minutos`);
  });

  it('takes the address however it is typed, and makes one account of it', async () => {
    vi.useFakeTimers();
    const { service, mailer, prisma } = setup();
    await service.sendLink('  Admin@Example.COM ', PAGE, 'en-US', 'admin');
    vi.advanceTimersByTime(LINK_EVERY_MS + 1);
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    expect(mailer.sent.map((mail) => mail.to)).toEqual([ADMIN, ADMIN]);
    expect(prisma.admins).toHaveLength(1);
  });

  it('does nothing for an address that is not an admin', async () => {
    const { service, mailer, prisma } = setup();
    expect(
      await service.sendLink('someone@example.com', PAGE, 'en-US', 'admin'),
    ).toBe(false);
    expect(mailer.sent).toEqual([]);
    expect(prisma.admins).toEqual([]);
    expect(prisma.links).toEqual([]);
  });

  it('does nothing for anyone when there are no admins', async () => {
    const { service, mailer } = setup([]);
    expect(await service.sendLink(ADMIN, PAGE, 'en-US', 'admin')).toBe(false);
    expect(mailer.sent).toEqual([]);
  });

  it('sends an admin one link a minute, however often it is asked', async () => {
    vi.useFakeTimers();
    const { service, mailer } = setup();
    expect(await service.sendLink(ADMIN, PAGE, 'en-US', 'admin')).toBe(true);
    expect(await service.sendLink(ADMIN, PAGE, 'en-US', 'admin')).toBe(false);
    vi.advanceTimersByTime(LINK_EVERY_MS - 1000);
    expect(await service.sendLink(ADMIN, PAGE, 'en-US', 'admin')).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(await service.sendLink(ADMIN, PAGE, 'en-US', 'admin')).toBe(true);
    expect(mailer.sent).toHaveLength(2);
  });

  it('forgets a link that could not be mailed, so the next try is not kept waiting', async () => {
    const { service, mailer, prisma } = setup();
    mailer.failWith = new Error('the mail server is away');
    expect(await service.sendLink(ADMIN, PAGE, 'en-US', 'admin')).toBe(false);
    expect(prisma.links).toEqual([]);
    mailer.failWith = null;
    expect(await service.sendLink(ADMIN, PAGE, 'en-US', 'admin')).toBe(true);
  });

  it('keeps a day of links, expired or not, and clears away older ones', async () => {
    vi.useFakeTimers();
    const { service, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    vi.advanceTimersByTime(LINK_MINUTES * 60_000 + 1000);
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    // the first has expired, but its tries still count towards the day
    expect(prisma.links).toHaveLength(2);
    vi.advanceTimersByTime(DAY_MS + 1000);
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    expect(prisma.links).toHaveLength(1);
  });
});

describe.each(['admin', 'donor'] as const)(
  "AuthService's daily cap on codes (%s)",
  (kind) => {
    const wrongOf = (code: string) => (code === '000000' ? '111111' : '000000');
    const address = kind === 'admin' ? ADMIN : DONOR;
    const page = kind === 'admin' ? PAGE : HOME;
    const prepare = () => {
      vi.useFakeTimers();
      const made = setup([ADMIN]);
      if (kind === 'donor') seedDonor(made.prisma);
      return made;
    };
    /** A day's worth of wrong codes, one link at a time, each link left to expire. */
    const spendTheDay = async ({
      service,
      mailer,
    }: ReturnType<typeof setup>) => {
      for (let i = 0; i < CODE_TRIES_PER_DAY / CODE_TRIES; i++) {
        expect(await service.sendLink(address, page, 'en-US', kind)).toBe(true);
        const code = mailer.code();
        for (let t = 0; t < CODE_TRIES; t++)
          await service
            .verifyCode(address, wrongOf(code), kind)
            .catch(() => undefined);
        vi.advanceTimersByTime(LINK_MINUTES * 60_000 + 1000);
      }
    };

    it('is not reset when the links it counts expire', async () => {
      const made = prepare();
      await spendTheDay(made);
      const { service, mailer, prisma } = made;
      expect(await service.sendLink(address, page, 'en-US', kind)).toBe(true);
      await expect(
        service.verifyCode(address, mailer.code(), kind),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.links.at(-1)?.attempts).toBe(0); // refused without comparing
      await expect(service.verify(mailer.token())).resolves.toBeDefined();
    });

    it('forgets links older than a day, and clears them away', async () => {
      const made = prepare();
      await spendTheDay(made);
      const { service, mailer, prisma } = made;
      vi.advanceTimersByTime(DAY_MS);
      expect(await service.sendLink(address, page, 'en-US', kind)).toBe(true);
      expect(prisma.links).toHaveLength(1);
      await expect(
        service.verifyCode(address, mailer.code(), kind),
      ).resolves.toBeDefined();
    });
  },
);

describe('AuthService.verify', () => {
  it('trades a fresh link for a session that names the admin', async () => {
    const { service, mailer, jwt, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    const session = await service.verify(mailer.token());

    expect(session.identity).toEqual({
      kind: 'admin',
      id: prisma.admins[0].id,
      email: ADMIN,
    });
    const payload = await jwt.verifyAsync<{
      sub: string;
      kind: string;
      exp: number;
      iat: number;
    }>(session.accessToken);
    expect(payload.sub).toBe(prisma.admins[0].id);
    expect(payload.kind).toBe('admin');
    expect(payload.exp - payload.iat).toBe(SESSION_DAYS * 24 * 60 * 60);
    expect(prisma.admins[0].lastLoginAt).toBeInstanceOf(Date);
  });

  it('works once', async () => {
    const { service, mailer } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    const token = mailer.token();
    await service.verify(token);
    await expect(service.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('gives one session when the same link is opened twice at once', async () => {
    const { service, mailer } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
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
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
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
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    env.ADMIN_EMAILS = [];
    await expect(service.verify(mailer.token())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('failureOf', () => {
  it("says what failed without the message, which may quote someone's address", () => {
    const refused = Object.assign(
      new Error('550 5.1.1 <ana@example.com>: Recipient address rejected'),
      { code: 'EENVELOPE', responseCode: 550 },
    );
    expect(failureOf(refused)).toBe('Error EENVELOPE 550');
    expect(failureOf(new Error('ana@example.com'))).toBe('Error');
    expect(failureOf(undefined)).toBe('unknown error');
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
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
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
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    const code = codeOf(mailer);
    const session = await service.verifyCode(
      'Admin@Example.com',
      code,
      'admin',
    );
    expect(session.identity).toEqual({
      kind: 'admin',
      id: prisma.admins[0].id,
      email: ADMIN,
    });
    await expect(
      service.verifyCode(ADMIN, code, 'admin'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('spends the link after five wrong codes, even for the right one after', async () => {
    const { service, mailer, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    const code = codeOf(mailer);
    for (let i = 0; i < CODE_TRIES; i++)
      await expect(
        service.verifyCode(ADMIN, wrongOf(code), 'admin'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.links[0].usedAt).toBeInstanceOf(Date);
    await expect(
      service.verifyCode(ADMIN, code, 'admin'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.verify(mailer.token())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('a code spends the link, and the link spends the code', async () => {
    const first = setup();
    await first.service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    await first.service.verifyCode(ADMIN, codeOf(first.mailer), 'admin');
    await expect(
      first.service.verify(first.mailer.token()),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const second = setup();
    await second.service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    await second.service.verify(second.mailer.token());
    await expect(
      second.service.verifyCode(ADMIN, codeOf(second.mailer), 'admin'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a code for an address that is not an admin, the same way', async () => {
    const { service, mailer } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    const code = codeOf(mailer);
    const error = await service
      .verifyCode('someone@example.com', code, 'admin')
      .catch((e: unknown) => e);
    const bad = await service
      .verifyCode(ADMIN, wrongOf(code), 'admin')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as Error).message).toBe((bad as Error).message);
  });

  it('signs in with the right code after four wrong ones, and the link is still unspent', async () => {
    const { service, mailer, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    const code = codeOf(mailer);
    for (let i = 0; i < CODE_TRIES - 1; i++)
      await service
        .verifyCode(ADMIN, wrongOf(code), 'admin')
        .catch(() => undefined);
    expect(prisma.links[0].usedAt).toBeNull();
    expect(prisma.links[0].attempts).toBe(CODE_TRIES - 1);
    await expect(
      service.verifyCode(ADMIN, code, 'admin'),
    ).resolves.toBeDefined();
  });

  it('compares no more than five codes however many arrive at once', async () => {
    const { service, mailer, prisma } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    const code = codeOf(mailer);
    const results = await Promise.allSettled([
      ...Array.from({ length: 20 }, () =>
        service.verifyCode(ADMIN, wrongOf(code), 'admin'),
      ),
      service.verifyCode(ADMIN, code, 'admin'),
    ]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(prisma.links[0].attempts).toBeLessThanOrEqual(CODE_TRIES);
    await expect(
      service.verifyCode(ADMIN, code, 'admin'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('never refuses sooner than the floor, for a stranger or an admin with a live link', async () => {
    const floor = 80;
    const { service, mailer } = setup([ADMIN], floor);
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    const code = codeOf(mailer);
    for (const [address, tried] of [
      ['someone@example.com', code],
      [ADMIN, wrongOf(code)],
    ]) {
      const started = Date.now();
      await expect(
        service.verifyCode(address, tried, 'admin'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(Date.now() - started).toBeGreaterThanOrEqual(floor - 5);
    }
  });

  it('allows an account only so many tries a day across its links, but the token still works', async () => {
    vi.useFakeTimers();
    const { service, mailer, prisma } = setup();
    for (let i = 0; i < CODE_TRIES_PER_DAY / CODE_TRIES; i++) {
      await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
      const code = codeOf(mailer);
      for (let t = 0; t < CODE_TRIES; t++)
        await service
          .verifyCode(ADMIN, wrongOf(code), 'admin')
          .catch(() => undefined);
      vi.advanceTimersByTime(LINK_EVERY_MS + 1);
    }
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    const fresh = prisma.links.at(-1);
    expect(fresh?.attempts).toBe(0);
    await expect(
      service.verifyCode(ADMIN, codeOf(mailer), 'admin'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fresh?.attempts).toBe(0); // refused without claiming
    await expect(service.verify(mailer.token())).resolves.toBeDefined();
  });

  it('forgets tries older than a day', async () => {
    vi.useFakeTimers();
    const { service, mailer } = setup();
    for (let i = 0; i < CODE_TRIES_PER_DAY / CODE_TRIES; i++) {
      await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
      const code = codeOf(mailer);
      for (let t = 0; t < CODE_TRIES; t++)
        await service
          .verifyCode(ADMIN, wrongOf(code), 'admin')
          .catch(() => undefined);
      vi.advanceTimersByTime(LINK_EVERY_MS + 1);
    }
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    await expect(
      service.verifyCode(ADMIN, codeOf(mailer), 'admin'),
    ).resolves.toBeDefined();
  });

  it('refuses a code past its time', async () => {
    vi.useFakeTimers();
    const { service, mailer } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    vi.advanceTimersByTime(LINK_MINUTES * 60_000 + 1);
    await expect(
      service.verifyCode(ADMIN, codeOf(mailer), 'admin'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('AuthService.identityOf', () => {
  it('knows an admin by id for as long as their address is on the list', async () => {
    const { service, prisma, env } = setup();
    await service.sendLink(ADMIN, PAGE, 'en-US', 'admin');
    const { id } = prisma.admins[0];
    expect(await service.identityOf('admin', id)).toEqual({
      kind: 'admin',
      id,
      email: ADMIN,
    });
    expect(
      await service.identityOf('admin', '7a0d7d0e-3a55-4b0e-8f2a-0c1d2e3f4a5b'),
    ).toBeNull();
    env.ADMIN_EMAILS = ['someone-else@example.com'];
    expect(await service.identityOf('admin', id)).toBeNull();
  });

  it('knows a donor by id, and never as an admin', async () => {
    const { service, prisma } = setup([DONOR]);
    const donor = seedDonor(prisma);
    expect(await service.identityOf('donor', donor.id)).toEqual({
      kind: 'donor',
      id: donor.id,
      email: DONOR,
    });
    // the same address on ADMIN_EMAILS makes the donor's id no admin's
    expect(await service.identityOf('admin', donor.id)).toBeNull();
    expect(
      await service.identityOf('donor', '7a0d7d0e-3a55-4b0e-8f2a-0c1d2e3f4a5b'),
    ).toBeNull();
  });
});

describe('AuthService, for donors', () => {
  const codeOf = (mailer: FakeMailer) => mailer.code();
  const wrongOf = (code: string) => (code === '000000' ? '111111' : '000000');

  it('mails a donor who has given', async () => {
    const { service, mailer, prisma } = setup();
    const donor = seedDonor(prisma);
    expect(
      await service.sendLink(' Ana@Example.com ', HOME, 'en-US', 'donor'),
    ).toBe(true);
    expect(mailer.sent.map((mail) => mail.to)).toEqual([DONOR]);
    expect(mailer.sent[0].text).toContain(`${HOME}#token=${mailer.token()}`);
    expect(mailer.sent[0].text).toContain('Your cities are one step away.');
    expect(mailer.sent[0].html).toContain('See your cities');
    expect(prisma.links).toMatchObject([{ donorId: donor.id, adminId: null }]);
    expect(prisma.admins).toEqual([]);
  });

  it('mails anyone who asks as a donor, given or not, making the account the first time', async () => {
    const { service, mailer, prisma } = setup();
    seedDonor(prisma, 'nogift@example.com', false);
    expect(
      await service.sendLink('nogift@example.com', HOME, 'en-US', 'donor'),
    ).toBe(true);
    expect(
      await service.sendLink(' Someone@Example.com ', HOME, 'en-US', 'donor'),
    ).toBe(true);
    // an admin may look at their own giving too, as a donor
    expect(await service.sendLink(ADMIN, HOME, 'en-US', 'donor')).toBe(true);
    expect(mailer.sent.map((mail) => mail.to)).toEqual([
      'nogift@example.com',
      'someone@example.com',
      ADMIN,
    ]);
    expect(prisma.donors.map((donor) => donor.email).sort()).toEqual(
      ['nogift@example.com', 'someone@example.com', ADMIN].sort(),
    );
    expect(prisma.admins).toEqual([]);
  });

  it('still mails nobody for a donor asked as an admin', async () => {
    const { service, mailer, prisma } = setup();
    seedDonor(prisma);
    expect(await service.sendLink(DONOR, PAGE, 'en-US', 'admin')).toBe(false);
    expect(mailer.sent).toEqual([]);
    expect(prisma.links).toEqual([]);
    expect(prisma.admins).toEqual([]);
  });

  it('sends a donor one link a minute, as it does an admin', async () => {
    vi.useFakeTimers();
    const { service, mailer, prisma } = setup();
    seedDonor(prisma);
    expect(await service.sendLink(DONOR, HOME, 'en-US', 'donor')).toBe(true);
    expect(await service.sendLink(DONOR, HOME, 'en-US', 'donor')).toBe(false);
    vi.advanceTimersByTime(LINK_EVERY_MS + 1);
    expect(await service.sendLink(DONOR, HOME, 'en-US', 'donor')).toBe(true);
    expect(mailer.sent).toHaveLength(2);
  });

  it("a donor's link gives a donor session", async () => {
    const { service, mailer, prisma, jwt } = setup();
    const donor = seedDonor(prisma);
    await service.sendLink(DONOR, HOME, 'en-US', 'donor');
    const session = await service.verify(mailer.token());
    expect(session.identity).toEqual({
      kind: 'donor',
      id: donor.id,
      email: DONOR,
    });
    const payload = await jwt.verifyAsync<{ sub: string; kind: string }>(
      session.accessToken,
    );
    expect(payload).toMatchObject({ sub: donor.id, kind: 'donor' });
    expect(prisma.donors[0].lastLoginAt).toBeInstanceOf(Date);
    expect(prisma.admins).toEqual([]);
  });

  it("a donor's code gives a donor session, and only when asked as a donor", async () => {
    const { service, mailer, prisma } = setup([DONOR]);
    const donor = seedDonor(prisma);
    await service.sendLink(DONOR, HOME, 'en-US', 'donor');
    const code = codeOf(mailer);
    // the address is an admin's too, but this code is the donor's
    await expect(
      service.verifyCode(DONOR, code, 'admin'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const session = await service.verifyCode('ANA@example.com', code, 'donor');
    expect(session.identity).toEqual({
      kind: 'donor',
      id: donor.id,
      email: DONOR,
    });
    await expect(
      service.verifyCode(DONOR, code, 'donor'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("keeps an admin's and a donor's links apart when they share an address", async () => {
    const { service, mailer, prisma } = setup([DONOR]);
    seedDonor(prisma);
    await service.sendLink(DONOR, PAGE, 'en-US', 'admin');
    const adminCode = codeOf(mailer);
    // a minute per account, not per address: the donor's link goes out at once
    expect(await service.sendLink(DONOR, HOME, 'en-US', 'donor')).toBe(true);
    const donorCode = codeOf(mailer);
    expect(prisma.links).toHaveLength(2);
    const asAdmin = await service.verifyCode(DONOR, adminCode, 'admin');
    expect(asAdmin.identity.kind).toBe('admin');
    const asDonor = await service.verifyCode(DONOR, donorCode, 'donor');
    expect(asDonor.identity.kind).toBe('donor');
  });

  it("spends a donor's link after five wrong codes", async () => {
    const { service, mailer, prisma } = setup();
    seedDonor(prisma);
    await service.sendLink(DONOR, HOME, 'en-US', 'donor');
    const code = codeOf(mailer);
    for (let i = 0; i < CODE_TRIES; i++)
      await expect(
        service.verifyCode(DONOR, wrongOf(code), 'donor'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.links[0].usedAt).toBeInstanceOf(Date);
    await expect(
      service.verifyCode(DONOR, code, 'donor'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("counts a donor's code tries a day across the donor's links", async () => {
    vi.useFakeTimers();
    const { service, mailer, prisma } = setup();
    seedDonor(prisma);
    for (let i = 0; i < CODE_TRIES_PER_DAY / CODE_TRIES; i++) {
      await service.sendLink(DONOR, HOME, 'en-US', 'donor');
      const code = codeOf(mailer);
      for (let t = 0; t < CODE_TRIES; t++)
        await service
          .verifyCode(DONOR, wrongOf(code), 'donor')
          .catch(() => undefined);
      vi.advanceTimersByTime(LINK_EVERY_MS + 1);
    }
    await service.sendLink(DONOR, HOME, 'en-US', 'donor');
    await expect(
      service.verifyCode(DONOR, codeOf(mailer), 'donor'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.links.at(-1)?.attempts).toBe(0);
    await expect(service.verify(mailer.token())).resolves.toBeDefined();
  });

  it("refuses a donor's wrong code like a stranger's, and never sooner than the floor", async () => {
    const floor = 80;
    const { service, mailer, prisma } = setup([ADMIN], floor);
    seedDonor(prisma);
    await service.sendLink(DONOR, HOME, 'en-US', 'donor');
    const code = codeOf(mailer);
    const refusals: unknown[] = [];
    for (const [address, tried] of [
      ['someone@example.com', code],
      [DONOR, wrongOf(code)],
    ]) {
      const started = Date.now();
      refusals.push(
        await service
          .verifyCode(address, tried, 'donor')
          .catch((e: unknown) => e),
      );
      expect(Date.now() - started).toBeGreaterThanOrEqual(floor - 5);
    }
    expect(refusals[0]).toBeInstanceOf(UnauthorizedException);
    expect(refusals[1]).toBeInstanceOf(UnauthorizedException);
    expect((refusals[0] as Error).message).toBe((refusals[1] as Error).message);
  });
});

describe('AuthService, joining a list by signing in', () => {
  const ask = (
    s: ReturnType<typeof setup>,
    list: string,
    purpose: 'admin' | 'donor' = 'donor',
    email = DONOR,
  ) => s.service.sendLink(email, HOME, 'pt-BR', purpose, list);

  it("a donor's link asked with a list joins it when the link is opened", async () => {
    const s = setup();
    const lisbon = s.prisma.seedCity({ slug: 'lisbon', name: 'Lisbon' });
    await ask(s, 'lisbon');
    expect(s.prisma.links[0]).toMatchObject({
      joinList: 'lisbon',
      joinLocale: 'pt-BR',
    });
    expect(s.mailer.sent[0].text).toContain('Lisbon');
    expect(s.prisma.listMembers).toEqual([]);

    const session = await s.service.verify(s.mailer.token());
    expect(s.prisma.listMembers).toMatchObject([
      { donorId: session.identity.id, cityId: lisbon.id, locale: 'pt-BR' },
    ]);
  });

  it('joins new cities for "*", and when the code is typed instead', async () => {
    const s = setup();
    await ask(s, '*');
    expect(s.mailer.sent[0].subject).toMatch(/^Seu código/);
    const session = await s.service.verifyCode(DONOR, s.mailer.code(), 'donor');
    expect(s.prisma.listMembers).toMatchObject([
      { donorId: session.identity.id, cityId: null },
    ]);
  });

  it('a list for a built or unknown city is dropped: a plain sign-in, and spending joins nothing', async () => {
    const s = setup();
    s.prisma.seedCity({ slug: 'paris', name: 'Paris', status: 'BUILT' });
    s.prisma.seedCity({ slug: 'secret', name: 'Secret', hidden: true });
    vi.useFakeTimers();
    for (const list of ['paris', 'secret', 'nowhere']) {
      s.mailer.sent.length = 0;
      expect(await ask(s, list)).toBe(true);
      expect(s.prisma.links.at(-1)).toMatchObject({
        joinList: null,
        joinLocale: null,
      });
      await s.service.verify(s.mailer.token());
      vi.advanceTimersByTime(LINK_EVERY_MS + 1);
    }
    expect(s.prisma.listMembers).toEqual([]);
  });

  it("an admin's link ignores list", async () => {
    const s = setup();
    s.prisma.seedCity({ slug: 'lisbon', name: 'Lisbon' });
    await ask(s, 'lisbon', 'admin', ADMIN);
    expect(s.prisma.links[0].joinList).toBeNull();
    await s.service.verify(s.mailer.token());
    expect(s.prisma.listMembers).toEqual([]);
  });

  it('a city built between asking and opening: the sign-in succeeds and nothing is joined', async () => {
    const s = setup();
    const lisbon = s.prisma.seedCity({ slug: 'lisbon', name: 'Lisbon' });
    await ask(s, 'lisbon');
    lisbon.status = 'BUILT';
    const session = await s.service.verify(s.mailer.token());
    expect(session.identity.kind).toBe('donor');
    expect(s.prisma.listMembers).toEqual([]);
  });

  it('spending a joining link never fails because joining failed', async () => {
    const s = setup();
    s.prisma.seedCity({ slug: 'lisbon', name: 'Lisbon' });
    await ask(s, 'lisbon');
    vi.spyOn(s.lists, 'join').mockRejectedValue(new Error('down'));
    const session = await s.service.verify(s.mailer.token());
    expect(session.accessToken).toBeTruthy();
    expect(s.prisma.listMembers).toEqual([]);
  });
});
