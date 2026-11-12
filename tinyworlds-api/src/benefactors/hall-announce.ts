import { LINKS_MAX, PICTURES_FROM_CENTS } from '../links/links.service.js';
import type { Mail, Mailer } from '../mail/mailer.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { hallMail } from './hall-mail.js';
import { mailOnce, unmailed, type OnceRun } from './once.js';

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
export type HallRun = OnceRun;

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
  const donors = await unmailed(prisma, 'hallMailedAt');
  return donors.map((donor) => ({
    donorId: donor.id,
    locale: donor.locale,
    cities: donor.cities.length,
    named: donor.cities.some((city) => city.named),
    mail: {
      to: donor.email,
      ...hallMail({
        locale: donor.locale,
        site,
        cities: donor.cities.map(({ slug, name, named }) => ({
          slug,
          name,
          named,
        })),
        name: donor.name,
        givenCents: donor.givenCents,
        picturesFromCents: PICTURES_FROM_CENTS,
        links: donor.links,
        linksMax: LINKS_MAX,
      }),
    },
  }));
}

/**
 * Tells every donor who has not been told that they are in the hall of fame: once each
 * (`mailOnce`: claimed before their mail goes out, given back when it does not, and a mail
 * server that is away stops the run). Failures are reported by donor id.
 */
export async function announceHall(
  prisma: PrismaService,
  mailer: Mailer,
  site: string,
  report: (line: string) => void = () => {},
): Promise<HallRun> {
  return mailOnce(
    prisma,
    mailer,
    'hallMailedAt',
    'The hall of fame mail',
    await hallLetters(prisma, site),
    report,
  );
}
