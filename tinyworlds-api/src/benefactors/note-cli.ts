import { config } from 'dotenv';
import { validateEnv } from '../config/env.js';
import { noteLetters, sendNotes, type NoteLetter } from './note-announce.js';
import { ownerOf } from './note-mail.js';
import { onceMain } from './once-cli.js';

/**
 * Sends each donor the owner's own note, once: thanks for the cities they gave to, and the
 * owner's WhatsApp for whatever they want to say. It is from the owner, not from the site, so
 * it needs the owner in the environment (OWNER_NAME, OWNER_MAIL_FROM, OWNER_WHATSAPP) and says
 * which is missing when one is. Without `--send` it only says who would get it (donor ids,
 * languages and counts, never an address) and sends nothing.
 *
 *   node dist/benefactors/note-cli.js                    who would get it; nothing is sent
 *   node dist/benefactors/note-cli.js --preview <dir>    the same, and writes each note there
 *                                                        (<donor id>.html and .txt) to be read
 *   node dist/benefactors/note-cli.js --test-to <email>  sends the first of those notes to this
 *                                                        address instead; nobody is marked
 *   node dist/benefactors/note-cli.js --send             writes to every donor who has not had it
 *
 * (`npm run owner:note -- …` in the built image, `npm run owner:note:dev -- …` from a
 * checkout, through tsx.) Running `--send` again reaches only the donors a first run could
 * not, and those who have given since: it is the way to thank new donors. Exits 1 when a note
 * that should have gone out did not, 2 without an owner (`once-cli.ts`).
 */
config({ path: '.env', quiet: true });

const env = validateEnv(process.env);
const { owner, missing } = ownerOf(env);
if (!owner) {
  console.error(
    `The owner's note needs the owner: set ${missing.join(', ')} in the environment.`,
  );
  process.exit(2);
}
await onceMain<NoteLetter>(env, (prisma, mailer) => ({
  name: 'note-cli',
  words: {
    would: "would get the owner's note",
    told: "Sent the owner's note to {sent} of {letters} donors.",
    failed: "The owner's notes failed",
  },
  letters: () => noteLetters(prisma, env.SITE_URL, owner),
  describe: (letter) =>
    `${letter.locale}  ${letter.cities} ${letter.cities === 1 ? 'city' : 'cities'}  ${letter.named ? 'by name' : 'no name'}`,
  send: (report) => sendNotes(prisma, mailer, env.SITE_URL, owner, report),
}));
