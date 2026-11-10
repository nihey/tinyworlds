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
  adminId: string;
  tokenHash: string;
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
  createdAt?: { gt?: Date };
}

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
    create: (args: { data: Omit<DonationRow, 'id'> }): Promise<DonationRow> => {
      if (
        this.donations.some(
          (d) => d.stripeSessionId === args.data.stripeSessionId,
        )
      )
        throw unique('stripe_session_id');
      const row = { id: randomUUID(), ...args.data };
      this.donations.push(row);
      return Promise.resolve(row);
    },
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
    findUnique: (args: { where: { id: string } }): Promise<AdminRow | null> => {
      const row = this.admins.find((a) => a.id === args.where.id);
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

  private linksWhere(where: LinkWhere): MagicLinkRow[] {
    return this.links.filter(
      (link) =>
        (where.id === undefined || link.id === where.id) &&
        (where.adminId === undefined || link.adminId === where.adminId) &&
        (where.usedAt === undefined || link.usedAt === null) &&
        (where.expiresAt?.lt === undefined ||
          link.expiresAt < where.expiresAt.lt) &&
        (where.expiresAt?.gt === undefined ||
          link.expiresAt > where.expiresAt.gt) &&
        (where.createdAt?.gt === undefined ||
          link.createdAt > where.createdAt.gt),
    );
  }

  magicLink = {
    create: (args: {
      data: { adminId: string; tokenHash: string; expiresAt: Date };
    }): Promise<MagicLinkRow> => {
      if (this.links.some((l) => l.tokenHash === args.data.tokenHash))
        throw unique('token_hash');
      const row: MagicLinkRow = {
        id: randomUUID(),
        usedAt: null,
        createdAt: new Date(),
        ...args.data,
      };
      this.links.push(row);
      return Promise.resolve({ ...row });
    },
    findFirst: (args: { where: LinkWhere }): Promise<MagicLinkRow | null> =>
      Promise.resolve(this.linksWhere(args.where)[0] ?? null),
    findUnique: (args: {
      where: { tokenHash: string };
    }): Promise<(MagicLinkRow & { admin: AdminRow }) | null> => {
      const link = this.links.find((l) => l.tokenHash === args.where.tokenHash);
      const admin = link && this.admins.find((a) => a.id === link.adminId);
      return Promise.resolve(link && admin ? { ...link, admin } : null);
    },
    updateMany: (args: {
      where: LinkWhere;
      data: { usedAt: Date };
    }): Promise<{ count: number }> => {
      const found = this.linksWhere(args.where);
      for (const link of found) link.usedAt = args.data.usedAt;
      return Promise.resolve({ count: found.length });
    },
    deleteMany: (args: { where: LinkWhere }): Promise<{ count: number }> => {
      const gone = new Set(this.linksWhere(args.where));
      this.links = this.links.filter((link) => !gone.has(link));
      return Promise.resolve({ count: gone.size });
    },
  };

  private inTransaction = false;

  async $transaction<T>(run: (tx: FakePrisma) => Promise<T>): Promise<T> {
    const before = {
      cities: this.cities.map((c) => ({ ...c })),
      donations: this.donations.map((d) => ({ ...d })),
    };
    this.inTransaction = true;
    try {
      return await run(this);
    } catch (error) {
      this.cities = before.cities;
      this.donations = before.donations;
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
