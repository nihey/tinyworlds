import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../src/prisma/prisma.service.js';

export interface CityRow {
  id: string;
  slug: string;
  name: string;
  status: 'PROPOSED' | 'FUNDED' | 'BUILDING' | 'BUILT';
  goalCents: number;
  raisedCents: number;
  donationCount: number;
  worldId: string | null;
  hidden: boolean;
}

export interface DonationRow {
  id: string;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  amountCents: number;
  currency: string;
  cityId: string | null;
  cityText: string | null;
  world: string | null;
  locale: string | null;
  visitId: string | null;
  donorId: string | null;
  listed: boolean;
  /** Set by `create`, one millisecond after the last, so the order of gifts is the order made. */
  createdAt?: Date;
}

export interface DonorRow {
  id: string;
  email: string;
  displayName: string | null;
  nameHidden?: boolean;
  lastLoginAt?: Date | null;
}

export interface FunnelEventRow {
  visitId: string;
  step: 'VISIT' | 'DONATE_OPENED' | 'CHECKOUT_STARTED' | 'CHECKOUT_CANCELLED';
  world: string;
  locale: string | null;
  city: string | null;
  amountCents: number | null;
  /** Set by the code on a VISIT only; the database's own default otherwise. */
  createdAt?: Date;
  /** On a VISIT, when the page last said it was open; left out on rows from before. */
  lastSeenAt?: Date | null;
}

type FunnelEventKey = Pick<FunnelEventRow, 'visitId' | 'step' | 'world'>;

/** The conditions the code puts on funnel events, as Prisma spells them. */
interface FunnelEventWhere {
  step?: FunnelEventRow['step'];
  lastSeenAt?: { gte: Date };
}

export interface QuizAnswerRow {
  visitId: string;
  world: string;
  sightId: string;
  choice: string;
  locale: string | null;
}

export interface AdminRow {
  id: string;
  email: string;
  lastLoginAt: Date | null;
}

export interface MagicLinkRow {
  id: string;
  /** Exactly one of the two is set: whose link it is. */
  adminId: string | null;
  donorId: string | null;
  tokenHash: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/** The conditions the code puts on a link, as Prisma spells them. */
interface LinkWhere {
  id?: string;
  adminId?: string;
  usedAt?: null;
  expiresAt?: { lt?: Date; gt?: Date };
  createdAt?: { lt?: Date; gt?: Date };
  attempts?: { lt: number };
  admin?: { email: string };
  donorId?: string;
  donor?: { email: string };
}

/** A link with the account it belongs to, as a `select` of both relations gives it. */
type LinkWithOwner = MagicLinkRow & {
  admin: AdminRow | null;
  donor: DonorRow | null;
};

type Step = { increment: number } | number | undefined;

const unique = (target: string): Error =>
  Object.assign(new Error(`Unique constraint failed on (${target})`), {
    code: 'P2002',
  });

/**
 * The few Prisma calls the API makes, over a handful of arrays. A transaction that throws
 * leaves nothing behind, and unique columns refuse duplicates the way the database does.
 */
export class FakePrisma {
  cities: CityRow[] = [];
  donations: DonationRow[] = [];
  donors: DonorRow[] = [];
  events: FunnelEventRow[] = [];
  quizAnswers: QuizAnswerRow[] = [];
  admins: AdminRow[] = [];
  links: MagicLinkRow[] = [];
  /** Set to make the next write of a funnel step fail, the way a database that is away does. */
  failEvents: Error | null = null;
  /** Set to make the donor step of a donation fail, the way a database error would. */
  failDonors: Error | null = null;
  /**
   * Something another connection commits while the next transaction is under way (right after
   * its first read): a way to stage a race. Being committed elsewhere, it survives that
   * transaction's rollback.
   */
  commitDuringNextTransaction: (() => void) | null = null;
  private committedElsewhere: (() => void) | null = null;
  private lastCreatedAt = 0;

  /** A donation with its donor and its city, the way a `select` of both relations gives them. */
  private withRelations(row: DonationRow) {
    const donor = this.donors.find((d) => d.id === row.donorId);
    const city = this.cities.find((c) => c.id === row.cityId);
    return {
      ...row,
      donor: donor ? { ...donor, nameHidden: donor.nameHidden ?? false } : null,
      city: city ? { ...city } : null,
    };
  }

  seedCity(over: Partial<CityRow> & { slug: string; name: string }): CityRow {
    const row: CityRow = {
      id: randomUUID(),
      status: 'PROPOSED',
      goalCents: 10_000,
      raisedCents: 0,
      donationCount: 0,
      worldId: null,
      hidden: false,
      ...over,
    };
    this.cities.push(row);
    return row;
  }

  city = {
    upsert: (args: {
      where: { slug: string };
      create: {
        slug: string;
        name: string;
        goalCents: number;
        status?: CityRow['status'];
        worldId?: string;
      };
      update?: { status?: CityRow['status']; worldId?: string };
    }): Promise<CityRow> => {
      const found = this.cities.find((c) => c.slug === args.where.slug);
      if (!found) return Promise.resolve(this.seedCity(args.create));
      if (args.update?.status) found.status = args.update.status;
      if (args.update?.worldId !== undefined)
        found.worldId = args.update.worldId;
      return Promise.resolve(found);
    },
    update: (args: {
      where: { id: string };
      data: {
        raisedCents?: Step;
        donationCount?: Step;
        status?: CityRow['status'];
      };
    }): Promise<CityRow> => {
      const row = this.cities.find((c) => c.id === args.where.id);
      if (!row) throw new Error('No such city');
      const step = (current: number, change: Step): number =>
        change === undefined
          ? current
          : typeof change === 'number'
            ? change
            : current + change.increment;
      row.raisedCents = step(row.raisedCents, args.data.raisedCents);
      row.donationCount = step(row.donationCount, args.data.donationCount);
      if (args.data.status) row.status = args.data.status;
      return Promise.resolve({ ...row });
    },
    findMany: (
      args: {
        where?: { hidden?: boolean; worldId?: { not: null } };
      } = {},
    ): Promise<CityRow[]> =>
      Promise.resolve(
        this.cities
          .filter(
            (c) =>
              (args.where?.hidden === undefined ||
                c.hidden === args.where.hidden) &&
              (args.where?.worldId === undefined || c.worldId !== null),
          )
          .map((c) => ({ ...c })),
      ),
  };

  donation = {
    /** By session id, or by id; with its donor and city. */
    findUnique: (args: {
      where: { stripeSessionId?: string; id?: string };
    }): Promise<ReturnType<FakePrisma['withRelations']> | null> => {
      const row = this.donations.find((d) =>
        args.where.id !== undefined
          ? d.id === args.where.id
          : d.stripeSessionId === args.where.stripeSessionId,
      );
      const found = row ? this.withRelations(row) : null;
      const commit = this.commitDuringNextTransaction;
      if (commit && this.inTransaction) {
        this.commitDuringNextTransaction = null;
        this.committedElsewhere = commit;
        commit();
      }
      return Promise.resolve(found);
    },
    /** Gifts with no donor yet (the backfill), or a city's gifts in one currency; in order made. */
    findMany: (args: {
      where: { donorId?: null; cityId?: string; currency?: string };
    }): Promise<ReturnType<FakePrisma['withRelations']>[]> =>
      Promise.resolve(
        this.donations
          .filter(
            (d) =>
              (args.where.donorId === undefined ||
                d.donorId === args.where.donorId) &&
              (args.where.cityId === undefined ||
                d.cityId === args.where.cityId) &&
              (args.where.currency === undefined ||
                d.currency === args.where.currency),
          )
          .map((d) => this.withRelations(d)),
      ),
    update: (args: {
      where: { id: string };
      data: { donorId: string };
    }): Promise<DonationRow> => {
      const row = this.donations.find((d) => d.id === args.where.id);
      if (!row) throw new Error('No such donation');
      row.donorId = args.data.donorId;
      return Promise.resolve({ ...row });
    },
    create: (args: {
      data: Omit<DonationRow, 'id' | 'donorId' | 'listed'> &
        Partial<Pick<DonationRow, 'donorId' | 'listed'>>;
    }): Promise<DonationRow> => {
      if (
        this.donations.some(
          (d) => d.stripeSessionId === args.data.stripeSessionId,
        )
      )
        throw unique('stripe_session_id');
      this.lastCreatedAt = Math.max(Date.now(), this.lastCreatedAt + 1);
      const row: DonationRow = {
        id: randomUUID(),
        donorId: null,
        listed: false,
        createdAt: new Date(this.lastCreatedAt),
        ...args.data,
      };
      this.donations.push(row);
      return Promise.resolve(row);
    },
  };

  donor = {
    /** Like the database: it reads what was committed when the transaction began, inserts, and
     * a row committed elsewhere since then makes the insert violate the unique email. */
    upsert: (args: {
      where: { email: string };
      create: { email: string; displayName: string | null };
      update: Record<string, never>;
    }): Promise<DonorRow> => {
      if (this.failDonors) throw this.failDonors;
      const visible = (d: DonorRow) =>
        !this.inTransaction || this.donorsAtStart.has(d.id);
      const found = this.donors.find(
        (d) => d.email === args.where.email && visible(d),
      );
      if (found) return Promise.resolve({ ...found });
      if (this.donors.some((d) => d.email === args.create.email))
        throw unique('email');
      const row: DonorRow = { id: randomUUID(), ...args.create };
      this.donors.push(row);
      return Promise.resolve({ ...row });
    },
    update: (args: {
      where: { id: string };
      data: { displayName?: string; lastLoginAt?: Date };
    }): Promise<DonorRow> => {
      const row = this.donors.find((d) => d.id === args.where.id);
      if (!row) throw new Error('No such donor');
      if (args.data.displayName !== undefined)
        row.displayName = args.data.displayName;
      if (args.data.lastLoginAt !== undefined)
        row.lastLoginAt = args.data.lastLoginAt;
      return Promise.resolve({ ...row });
    },
    /** The one `where` the webhook asks: set a name only where there is none. */
    updateMany: (args: {
      where: { id: string; displayName: null };
      data: { displayName: string };
    }): Promise<{ count: number }> => {
      const row = this.donors.find(
        (d) => d.id === args.where.id && d.displayName === null,
      );
      if (row) row.displayName = args.data.displayName;
      return Promise.resolve({ count: row ? 1 : 0 });
    },
    findUnique: (args: { where: { id: string } }): Promise<DonorRow | null> => {
      const row = this.donors.find((d) => d.id === args.where.id);
      return Promise.resolve(row ? { ...row } : null);
    },
    /** The one `where` the API asks: an address, and optionally that it has given. */
    findFirst: (args: {
      where: { email: string; donations?: { some: Record<string, never> } };
    }): Promise<DonorRow | null> => {
      const row = this.donors.find(
        (d) =>
          d.email === args.where.email &&
          (args.where.donations === undefined ||
            this.donations.some((gift) => gift.donorId === d.id)),
      );
      return Promise.resolve(row ? { ...row } : null);
    },
    findMany: (): Promise<DonorRow[]> =>
      Promise.resolve(this.donors.map((d) => ({ ...d }))),
  };

  funnelEvent = {
    createMany: (args: {
      data: FunnelEventRow[];
      skipDuplicates?: boolean;
    }): Promise<{ count: number }> => {
      if (this.failEvents) return Promise.reject(this.failEvents);
      let count = 0;
      for (const row of args.data) {
        const there = this.events.some(
          (e) =>
            e.visitId === row.visitId &&
            e.step === row.step &&
            e.world === row.world,
        );
        if (there && !args.skipDuplicates)
          throw unique('visit_id, step, world');
        if (there) continue;
        this.events.push({ ...row });
        count++;
      }
      return Promise.resolve({ count });
    },
    upsert: (args: {
      where: { visitId_step_world: FunnelEventKey };
      create: FunnelEventRow;
      update: Partial<FunnelEventRow>;
    }): Promise<FunnelEventRow> => {
      if (this.failEvents) return Promise.reject(this.failEvents);
      const key = args.where.visitId_step_world;
      let row = this.events.find(
        (e) =>
          e.visitId === key.visitId &&
          e.step === key.step &&
          e.world === key.world,
      );
      if (row) Object.assign(row, args.update);
      else {
        row = { ...args.create };
        this.events.push(row);
      }
      return Promise.resolve({ ...row });
    },
    groupBy: (args: {
      by: ['world'];
      where: FunnelEventWhere;
      _count: { _all: true };
    }): Promise<{ world: string; _count: { _all: number } }[]> => {
      const { step, lastSeenAt } = args.where;
      const counts = new Map<string, number>();
      for (const e of this.events) {
        if (step !== undefined && e.step !== step) continue;
        if (lastSeenAt && !(e.lastSeenAt && e.lastSeenAt >= lastSeenAt.gte))
          continue;
        counts.set(e.world, (counts.get(e.world) ?? 0) + 1);
      }
      return Promise.resolve(
        [...counts].map(([world, n]) => ({ world, _count: { _all: n } })),
      );
    },
  };

  quizAnswer = {
    createMany: (args: {
      data: QuizAnswerRow[];
      skipDuplicates?: boolean;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of args.data) {
        const there = this.quizAnswers.some(
          (a) =>
            a.visitId === row.visitId &&
            a.world === row.world &&
            a.sightId === row.sightId,
        );
        if (there && !args.skipDuplicates)
          throw unique('visit_id, world, sight_id');
        if (there) continue;
        this.quizAnswers.push({ ...row });
        count++;
      }
      return Promise.resolve({ count });
    },
    count: (args: {
      where: { world: string; sightId: string };
    }): Promise<number> =>
      Promise.resolve(
        this.quizAnswers.filter(
          (a) =>
            a.world === args.where.world && a.sightId === args.where.sightId,
        ).length,
      ),
    /** Only the shapes the quiz asks for: by choice, counted, within one building; the most picked first when taking some. */
    groupBy: (args: {
      by: ['choice'];
      where: { world: string; sightId: string; choice?: { in: string[] } };
      _count: { _all: true };
      take?: number;
    }): Promise<{ choice: string; _count: { _all: number } }[]> => {
      const counts = new Map<string, number>();
      for (const a of this.quizAnswers)
        if (
          a.world === args.where.world &&
          a.sightId === args.where.sightId &&
          (!args.where.choice || args.where.choice.in.includes(a.choice))
        )
          counts.set(a.choice, (counts.get(a.choice) ?? 0) + 1);
      const rows = [...counts]
        .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
        .map(([choice, n]) => ({ choice, _count: { _all: n } }));
      return Promise.resolve(
        args.take === undefined ? rows : rows.slice(0, args.take),
      );
    },
  };

  admin = {
    upsert: (args: {
      where: { email: string };
      create: { email: string };
    }): Promise<AdminRow> => {
      let row = this.admins.find((a) => a.email === args.where.email);
      if (!row) {
        row = { id: randomUUID(), email: args.create.email, lastLoginAt: null };
        this.admins.push(row);
      }
      return Promise.resolve({ ...row });
    },
    findUnique: (args: {
      where: { id?: string; email?: string };
    }): Promise<AdminRow | null> => {
      const row = this.admins.find((a) =>
        args.where.id !== undefined
          ? a.id === args.where.id
          : a.email === args.where.email,
      );
      return Promise.resolve(row ? { ...row } : null);
    },
    update: (args: {
      where: { id: string };
      data: { lastLoginAt: Date };
    }): Promise<AdminRow> => {
      const row = this.admins.find((a) => a.id === args.where.id);
      if (!row) throw new Error('No such admin');
      row.lastLoginAt = args.data.lastLoginAt;
      return Promise.resolve({ ...row });
    },
  };

  private withOwner(link: MagicLinkRow): LinkWithOwner {
    const admin = this.admins.find((a) => a.id === link.adminId);
    const donor = this.donors.find((d) => d.id === link.donorId);
    return {
      ...link,
      admin: admin ? { ...admin } : null,
      donor: donor ? { ...donor } : null,
    };
  }

  private linksWhere(where: LinkWhere): MagicLinkRow[] {
    return this.links.filter(
      (link) =>
        (where.id === undefined || link.id === where.id) &&
        (where.adminId === undefined || link.adminId === where.adminId) &&
        (where.donorId === undefined || link.donorId === where.donorId) &&
        (where.usedAt === undefined || link.usedAt === null) &&
        (where.expiresAt?.lt === undefined ||
          link.expiresAt < where.expiresAt.lt) &&
        (where.expiresAt?.gt === undefined ||
          link.expiresAt > where.expiresAt.gt) &&
        (where.createdAt?.lt === undefined ||
          link.createdAt < where.createdAt.lt) &&
        (where.createdAt?.gt === undefined ||
          link.createdAt > where.createdAt.gt) &&
        (where.attempts === undefined || link.attempts < where.attempts.lt) &&
        (where.admin === undefined ||
          this.admins.find((a) => a.id === link.adminId)?.email ===
            where.admin.email) &&
        (where.donor === undefined ||
          this.donors.find((d) => d.id === link.donorId)?.email ===
            where.donor.email),
    );
  }

  magicLink = {
    aggregate: (args: {
      where: LinkWhere;
    }): Promise<{ _sum: { attempts: number | null } }> => {
      const found = this.linksWhere(args.where);
      return Promise.resolve({
        _sum: {
          attempts: found.length
            ? found.reduce((sum, l) => sum + l.attempts, 0)
            : null,
        },
      });
    },
    create: (args: {
      data: {
        adminId?: string;
        donorId?: string;
        tokenHash: string;
        codeHash: string;
        expiresAt: Date;
      };
    }): Promise<MagicLinkRow> => {
      if (this.links.some((l) => l.tokenHash === args.data.tokenHash))
        throw unique('token_hash');
      // the database's check: a link belongs to exactly one account
      if (
        (args.data.adminId === undefined) ===
        (args.data.donorId === undefined)
      )
        throw new Error('magic_links_one_owner');
      const row: MagicLinkRow = {
        id: randomUUID(),
        usedAt: null,
        attempts: 0,
        createdAt: new Date(),
        ...args.data,
        adminId: args.data.adminId ?? null,
        donorId: args.data.donorId ?? null,
      };
      this.links.push(row);
      return Promise.resolve({ ...row });
    },
    findFirst: (args: {
      where: LinkWhere;
      orderBy?: { createdAt: 'desc' };
    }): Promise<LinkWithOwner | null> => {
      const found = this.linksWhere(args.where);
      if (args.orderBy)
        found.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const link = found.at(0);
      return Promise.resolve(link ? this.withOwner(link) : null);
    },
    update: (args: {
      where: { id: string };
      data: { attempts: { increment: number } };
    }): Promise<MagicLinkRow> => {
      const link = this.links.find((l) => l.id === args.where.id);
      if (!link) throw new Error('no such link');
      link.attempts += args.data.attempts.increment;
      return Promise.resolve({ ...link });
    },
    findUnique: (args: {
      where: { tokenHash?: string; id?: string };
    }): Promise<LinkWithOwner | null> => {
      const link = this.links.find((l) =>
        args.where.id !== undefined
          ? l.id === args.where.id
          : l.tokenHash === args.where.tokenHash,
      );
      return Promise.resolve(link ? this.withOwner(link) : null);
    },
    updateMany: (args: {
      where: LinkWhere;
      data: { usedAt?: Date; attempts?: { increment: number } };
    }): Promise<{ count: number }> => {
      const found = this.linksWhere(args.where);
      for (const link of found) {
        if (args.data.usedAt) link.usedAt = args.data.usedAt;
        if (args.data.attempts) link.attempts += args.data.attempts.increment;
      }
      return Promise.resolve({ count: found.length });
    },
    deleteMany: (args: { where: LinkWhere }): Promise<{ count: number }> => {
      const gone = new Set(this.linksWhere(args.where));
      this.links = this.links.filter((link) => !gone.has(link));
      return Promise.resolve({ count: gone.size });
    },
  };

  private inTransaction = false;
  private donorsAtStart = new Set<string>();

  async $transaction<T>(run: (tx: FakePrisma) => Promise<T>): Promise<T> {
    const before = {
      cities: this.cities.map((c) => ({ ...c })),
      donations: this.donations.map((d) => ({ ...d })),
      donors: this.donors.map((d) => ({ ...d })),
    };
    this.donorsAtStart = new Set(this.donors.map((d) => d.id));
    this.inTransaction = true;
    try {
      return await run(this);
    } catch (error) {
      this.cities = before.cities;
      this.donations = before.donations;
      this.donors = before.donors;
      this.committedElsewhere?.();
      throw error;
    } finally {
      this.inTransaction = false;
      this.committedElsewhere = null;
    }
  }

  /** The fake, typed as the service the code under test asks for. */
  asService(): PrismaService {
    return this as unknown as PrismaService;
  }
}
