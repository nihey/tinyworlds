import { failureOf } from '../auth/auth.service.js';
import { COUNTED_CURRENCY } from '../donations/currency.js';
import { isLocale, type Locale } from '../donations/locales.js';
import { isServerFailure, type Mail, type Mailer } from '../mail/mailer.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * The mails a donor gets once, each named by the column that keeps when they had it: that they
 * are in the hall of fame (`hall-announce.ts`), and the owner's own note (`note-announce.ts`).
 * Both go to the same people, the donors with a place in a city's hall, and go out the same
 * way; neither depends on the other.
 */
export type Mark = 'hallMailedAt' | 'noteMailedAt';

const marked = (mark: Mark, at: Date | null) =>
  mark === 'hallMailedAt' ? { hallMailedAt: at } : { noteMailedAt: at };

/** A city a donor gave to. */
export interface CityGiven {
  slug: string;
  name: string;
  /** Whether the donor's name shows there. */
  named: boolean;
  /** What they gave to it, in US cents. */
  cents: number;
}

/** A donor with a place in a city's hall of fame, as a mail to them needs them. */
export interface Benefactor {
  id: string;
  email: string;
  /** How they are named; null for one who gave no name, or whose name an admin hid. */
  name: string | null;
  /** The language of their latest gift. */
  locale: Locale;
  /** The cities they gave to, the one they gave most to first. */
  cities: CityGiven[];
  /** Everything they gave, in US cents. */
  givenCents: number;
  /** How many links they have put beside their name. */
  links: number;
}

/**
 * The donors who have not had this mail yet (its column is null) and gave, in dollars, to a
 * city the site shows: the oldest donor first. A donor with no such gift is in no hall, and is
 * not among them.
 */
export async function unmailed(
  prisma: PrismaService,
  mark: Mark,
): Promise<Benefactor[]> {
  const donors = await prisma.donor.findMany({
    where: {
      ...marked(mark, null),
      donations: {
        some: { currency: COUNTED_CURRENCY, city: { hidden: false } },
      },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      email: true,
      displayName: true,
      nameHidden: true,
      _count: { select: { links: true } },
      donations: {
        where: { currency: COUNTED_CURRENCY },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          amountCents: true,
          listed: true,
          locale: true,
          city: { select: { slug: true, name: true, hidden: true } },
        },
      },
    },
  });

  return donors.map((donor) => {
    const name = donor.nameHidden ? null : donor.displayName;
    const byCity = new Map<string, CityGiven>();
    for (const gift of donor.donations) {
      if (!gift.city || gift.city.hidden) continue;
      const city = byCity.get(gift.city.slug) ?? {
        slug: gift.city.slug,
        name: gift.city.name,
        named: false,
        cents: 0,
      };
      city.cents += gift.amountCents;
      if (gift.listed && name !== null) city.named = true;
      byCity.set(city.slug, city);
    }
    // the gifts come oldest first: the last one's language is the donor's latest
    const latest = donor.donations.at(-1)?.locale;
    return {
      id: donor.id,
      email: donor.email,
      name,
      locale: isLocale(latest) ? latest : 'en-US',
      cities: [...byCity.values()].sort(
        (a, b) => b.cents - a.cents || (a.slug < b.slug ? -1 : 1),
      ),
      givenCents: donor.donations.reduce((sum, g) => sum + g.amountCents, 0),
      links: donor._count.links,
    };
  });
}

/** One donor's mail. */
export interface OnceLetter {
  donorId: string;
  mail: Mail;
}

/** What a run did, by donor id: never an address. */
export interface OnceRun {
  /** Donors who had not had the mail and have one coming. */
  letters: number;
  sent: string[];
  /** Tried and not sent: given back, so the next run tries again. */
  failed: string[];
  /** Not tried, because the mail server went away. */
  unsent: string[];
}

/**
 * Sends each donor their mail, once. A donor is claimed (the mark's column) before their mail
 * goes out, so two runs cannot both mail them, and given back if it does not, so the next run
 * tries again. A mail server that is away stops the run at its first failure instead of
 * waiting on it for every donor. Failures are reported by donor id; `what` names the mail in
 * them ("The hall of fame mail").
 */
export async function mailOnce(
  prisma: PrismaService,
  mailer: Mailer,
  mark: Mark,
  what: string,
  letters: OnceLetter[],
  report: (line: string) => void = () => {},
): Promise<OnceRun> {
  const run: OnceRun = {
    letters: letters.length,
    sent: [],
    failed: [],
    unsent: [],
  };
  for (const [i, letter] of letters.entries()) {
    const claimedAt = new Date();
    const { count } = await prisma.donor.updateMany({
      where: { id: letter.donorId, ...marked(mark, null) },
      data: marked(mark, claimedAt),
    });
    // another run has them
    if (count === 0) continue;
    try {
      await mailer.send(letter.mail);
      run.sent.push(letter.donorId);
    } catch (error) {
      await prisma.donor.updateMany({
        where: { id: letter.donorId, ...marked(mark, claimedAt) },
        data: marked(mark, null),
      });
      run.failed.push(letter.donorId);
      report(
        `${what} to donor ${letter.donorId} was not sent: ${failureOf(error)}`,
      );
      if (isServerFailure(error)) {
        run.unsent.push(...letters.slice(i + 1).map((l) => l.donorId));
        break;
      }
    }
  }
  return run;
}
