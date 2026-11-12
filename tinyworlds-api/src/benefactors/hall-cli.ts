import { config } from 'dotenv';
import { validateEnv } from '../config/env.js';
import { announceHall, hallLetters, type HallLetter } from './hall-announce.js';
import { onceMain } from './once-cli.js';

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
 * should have gone out did not (`once-cli.ts`).
 */
config({ path: '.env', quiet: true });

const env = validateEnv(process.env);
await onceMain<HallLetter>(env, (prisma, mailer) => ({
  name: 'hall-cli',
  words: {
    would: 'would be told that they are in the hall of fame',
    told: 'Told {sent} of {letters} donors that they are in the hall of fame.',
    failed: 'The hall of fame mails failed',
  },
  letters: () => hallLetters(prisma, env.SITE_URL),
  describe: (letter) =>
    `${letter.locale}  ${letter.cities} ${letter.cities === 1 ? 'city' : 'cities'}  ${letter.named ? 'named' : 'anonymous'}`,
  send: (report) => announceHall(prisma, mailer, env.SITE_URL, report),
}));
