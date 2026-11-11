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
}

export interface DonorRow {
  id: string;
  email: string;
  displayName: string | null;
  lastLoginAt?: Date | null;
}

export interface FunnelEventRow {
  visitId: string;
  step: 'VISIT' | 'DONATE_OPENED' | 'CHECKOUT_STARTED' | 'CHECKOUT_CANCELLED';
  world: string;
  locale: string | null;
  city: string | null;
  amountCents: number | null;
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
  admins: AdminRow[] = [];
  links: MagicLinkRow[] = [];
  /** Set to make the next write of a funnel step fail, the way a database that is away does. */
  failEvents: Error | null = null;
  /**
   * Something another connection commits while the next transaction is under way (right after
   * its first read): a way to stage a race. Being committed elsewhere, it survives that
   * transaction's rollback.
   */
  commitDuringNextTransaction: (() => void) | null = null;
  private committedElsewhere: (() => void) | null = null;

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
      args: { where?: { hidden?: boolean } } = {},
    ): Promise<CityRow[]> =>
      Promise.resolve(
        this.cities
          .filter(
            (c) =>
              args.where?.hidden === undefined ||
              c.hidden === args.where.hidden,
          )
          .map((c) => ({ ...c })),
      ),
  };

  donation = {
    findUnique: (args: {
      where: { stripeSessionId: string };
    }): Promise<DonationRow | null> => {
      const found =
        this.donations.find(
          (d) => d.stripeSessionId === args.where.stripeSessionId,
        ) ?? null;
      const commit = this.commitDuringNextTransaction;
      if (commit && this.inTransaction) {
        this.commitDuringNextTransaction = null;
        this.committedElsewhere = commit;
        commit();
      }
      return Promise.resolve(found);
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
      const row: DonationRow = {
        id: randomUUID(),
        donorId: null,
        listed: false,
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
