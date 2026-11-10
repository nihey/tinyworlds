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
}

type Step = { increment: number } | number | undefined;

const unique = (target: string): Error =>
  Object.assign(new Error(`Unique constraint failed on (${target})`), {
    code: 'P2002',
  });

/**
 * The few Prisma calls the donations code makes, over two arrays. A transaction that throws
 * leaves nothing behind, and unique columns refuse duplicates the way the database does.
 */
export class FakePrisma {
  cities: CityRow[] = [];
  donations: DonationRow[] = [];
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
      create: { slug: string; name: string; goalCents: number };
    }): Promise<CityRow> => {
      const found = this.cities.find((c) => c.slug === args.where.slug);
      return Promise.resolve(found ?? this.seedCity(args.create));
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
