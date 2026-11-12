import { failureOf } from '../auth/auth.service.js';
import { COUNTED_CURRENCY } from '../donations/currency.js';
import { isLocale } from '../donations/locales.js';
import { LINKS_MAX, PICTURES_FROM_CENTS } from '../links/links.service.js';
import { isServerFailure, type Mail, type Mailer } from '../mail/mailer.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { hallMail, type HallCity } from './hall-mail.js';

/** One donor's mail about the hall of fame. */
export interface HallLetter {
  donorId: string;
  /** What the run prints of it: the language, how many cities, whether they are named. */
  locale: string;
  cities: number;
  named: boolean;
  mail: Mail;
}

/** What a run did, by donor id: never an address. */
export interface HallRun {
  /** Donors who had not been told and have a city's hall to be told about. */
  letters: number;
  sent: string[];
  /** Tried and not sent: given back, so the next run tries again. */
  failed: string[];
  /** Not tried, because the mail server went away. */
  unsent: string[];
}

/**
 * The mail for every donor who has not been told yet (`donors.hall_mailed_at` is null) and gave,
 * in dollars, to a city the site shows: the cities they are in the hall of, the one they gave
 * most to first, each with whether their name shows there; in the language of their latest
 * gift. A donor with no such gift is in no hall, and gets no mail.
 */
export async function hallLetters(
  prisma: PrismaService,
  site: string,
): Promise<HallLetter[]> {
  const donors = await prisma.donor.findMany({
    where: {
      hallMailedAt: null,
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
    const byCity = new Map<string, HallCity & { cents: number }>();
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
    const cities = [...byCity.values()].sort(
      (a, b) => b.cents - a.cents || (a.slug < b.slug ? -1 : 1),
    );
    // the gifts come oldest first: the last one's language is the donor's latest
    const latest = donor.donations.at(-1)?.locale;
    const locale = isLocale(latest) ? latest : 'en-US';
    const mail = hallMail({
      locale,
      site,
      cities: cities.map(({ slug, name: city, named }) => ({
        slug,
        name: city,
        named,
      })),
      name,
      givenCents: donor.donations.reduce((sum, g) => sum + g.amountCents, 0),
      picturesFromCents: PICTURES_FROM_CENTS,
      links: donor._count.links,
      linksMax: LINKS_MAX,
    });
    return {
      donorId: donor.id,
      locale,
      cities: cities.length,
      named: cities.some((city) => city.named),
      mail: { to: donor.email, ...mail },
    };
  });
}

/**
 * Tells every donor who has not been told that they are in the hall of fame: once each. A
 * donor is claimed (`hall_mailed_at`) before their mail goes out, so two runs cannot both mail
 * them, and given back if it does not, so the next run tries again. A mail server that is away
 * stops the run at its first failure instead of waiting on it for every donor. Failures are
 * reported by donor id.
 */
export async function announceHall(
  prisma: PrismaService,
  mailer: Mailer,
  site: string,
  report: (line: string) => void = () => {},
): Promise<HallRun> {
  const letters = await hallLetters(prisma, site);
  const run: HallRun = {
    letters: letters.length,
    sent: [],
    failed: [],
    unsent: [],
  };
  for (const [i, letter] of letters.entries()) {
    const claimedAt = new Date();
    const { count } = await prisma.donor.updateMany({
      where: { id: letter.donorId, hallMailedAt: null },
      data: { hallMailedAt: claimedAt },
    });
    // another run has them
    if (count === 0) continue;
    try {
      await mailer.send(letter.mail);
      run.sent.push(letter.donorId);
    } catch (error) {
      await prisma.donor.updateMany({
        where: { id: letter.donorId, hallMailedAt: claimedAt },
        data: { hallMailedAt: null },
      });
      run.failed.push(letter.donorId);
      report(
        `The hall of fame mail to donor ${letter.donorId} was not sent: ${failureOf(error)}`,
      );
      if (isServerFailure(error)) {
        run.unsent.push(...letters.slice(i + 1).map((l) => l.donorId));
        break;
      }
    }
  }
  return run;
}
