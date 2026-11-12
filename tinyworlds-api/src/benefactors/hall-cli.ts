import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { failureOf } from '../auth/auth.service.js';
import { validateEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { createMailer } from '../mail/mailer.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { announceHall, hallLetters } from './hall-announce.js';

/**
 * Tells donors they are in the hall of fame, once each. Without `--send` it only says who would
 * be told (donor ids, languages and counts, never an address) and sends nothing, so it is safe
 * to run to see what a send would do.
 *
 *   node dist/benefactors/hall-cli.js                    who would be told; nothing is sent
 *   node dist/benefactors/hall-cli.js --preview <dir>    the same, and writes each mail there
 *                                                        (<donor id>.html and .txt) to be read
 *   node dist/benefactors/hall-cli.js --test-to <email>  sends the first of those mails to this
 *                                                        address instead; nobody is marked told
 *   node dist/benefactors/hall-cli.js --send             mails every donor not told yet
 *
 * (`npm run hall:announce -- …` in the built image, `npm run hall:announce:dev -- …` from a
 * checkout, through tsx.) Running `--send` again mails only the donors a first run could not
 * reach, and those who have given since. The environment is the API's own, checked the same
 * way; without a mail server (development) the mails go to the log. Exits 1 when a mail that
 * should have gone out did not.
 */
config({ path: '.env', quiet: true });

const args = process.argv.slice(2);
const valueOf = (flag: string): string | null => {
  const at = args.indexOf(flag);
  return at === -1 ? null : (args[at + 1] ?? '');
};
const send = args.includes('--send');
const preview = valueOf('--preview');
const testTo = valueOf('--test-to');
const known = new Set(['--send', '--preview', '--test-to']);
const unknown = args.filter(
  (arg, i) =>
    !known.has(arg) && !['--preview', '--test-to'].includes(args[i - 1]),
);
if (
  unknown.length > 0 ||
  preview === '' ||
  testTo === '' ||
  (testTo !== null && !/^[^\s@]+@[^\s@]+$/.test(testTo)) ||
  (send && testTo !== null)
) {
  console.error(
    'usage: hall-cli [--preview <dir>] [--test-to <email> | --send]   (nothing is sent without --send or --test-to)',
  );
  process.exit(2);
}

const env = validateEnv(process.env);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
}) as unknown as PrismaService;
const site = env.SITE_URL;
let shortfall = false;

try {
  if (send) {
    const run = await announceHall(prisma, createMailer(env), site, (line) =>
      console.error(line),
    );
    console.log(
      `Told ${run.sent.length} of ${run.letters} donors that they are in the hall of fame.`,
    );
    for (const id of run.failed) console.log(`  not sent: ${id}`);
    for (const id of run.unsent) console.log(`  not tried: ${id}`);
    shortfall = run.failed.length + run.unsent.length > 0;
  } else {
    const letters = await hallLetters(prisma, site);
    console.log(
      `${letters.length} donors would be told that they are in the hall of fame (nothing was sent):`,
    );
    for (const letter of letters)
      console.log(
        `  ${letter.donorId}  ${letter.locale}  ${letter.cities} ${letter.cities === 1 ? 'city' : 'cities'}  ${letter.named ? 'named' : 'anonymous'}`,
      );
    if (preview !== null) {
      await mkdir(preview, { recursive: true });
      for (const { donorId, mail } of letters) {
        await writeFile(join(preview, `${donorId}.html`), mail.html);
        await writeFile(
          join(preview, `${donorId}.txt`),
          `Subject: ${mail.subject}\n\n${mail.text}`,
        );
      }
      console.log(`Their mails are in ${preview}.`);
    }
    if (testTo !== null) {
      const [first] = letters;
      if (!first)
        console.log('There is no mail to try: nobody is left to tell.');
      else {
        await createMailer(env).send({ ...first.mail, to: testTo });
        console.log(
          `The mail of donor ${first.donorId} went to the address given instead; nobody was marked told.`,
        );
      }
    }
  }
} catch (error) {
  // what went wrong, never an address
  console.error(`The hall of fame mails failed: ${failureOf(error)}`);
  shortfall = true;
} finally {
  await prisma.$disconnect();
}
process.exitCode = shortfall ? 1 : 0;
