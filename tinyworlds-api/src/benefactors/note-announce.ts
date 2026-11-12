import type { Mail, Mailer } from '../mail/mailer.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { noteMail, type Owner } from './note-mail.js';
import { mailOnce, unmailed, type OnceRun } from './once.js';

/** The owner's note to one donor. */
export interface NoteLetter {
  donorId: string;
  /** What the run prints of it: the language, how many cities, whether it greets by name. */
  locale: string;
  cities: number;
  named: boolean;
  mail: Mail;
}

/**
 * The owner's note for every donor who has not had it (`donors.note_mailed_at` is null) and
 * has a place in a city's hall: thanks for the cities they gave to, the one they gave most to
 * first, by their name when they have one to show, in the language of their latest gift.
 */
export async function noteLetters(
  prisma: PrismaService,
  site: string,
  owner: Owner,
): Promise<NoteLetter[]> {
  const donors = await unmailed(prisma, 'noteMailedAt');
  return donors.map((donor) => ({
    donorId: donor.id,
    locale: donor.locale,
    cities: donor.cities.length,
    named: donor.name !== null,
    mail: {
      to: donor.email,
      ...noteMail({
        locale: donor.locale,
        site,
        owner,
        cities: donor.cities.map((city) => city.name),
        name: donor.name,
      }),
    },
  }));
}

/** Sends the owner's note to every donor who has not had it: once each (`mailOnce`). */
export async function sendNotes(
  prisma: PrismaService,
  mailer: Mailer,
  site: string,
  owner: Owner,
  report: (line: string) => void = () => {},
): Promise<OnceRun> {
  return mailOnce(
    prisma,
    mailer,
    'noteMailedAt',
    "The owner's note",
    await noteLetters(prisma, site, owner),
    report,
  );
}
