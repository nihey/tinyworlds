import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { failureOf } from '../auth/auth.service.js';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';
import { createMailer, type Mailer } from '../mail/mailer.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OnceLetter, OnceRun } from './once.js';

/** A mail that donors get once, as its command needs it (hall-cli.ts, note-cli.ts). */
export interface OnceCommand<L extends OnceLetter> {
  /** The command, in its usage line: "hall-cli". */
  name: string;
  /** What it says of itself. */
  words: {
    /** After "<n> donors": "would be told that they are in the hall of fame". */
    would: string;
    /** What a send did, `{sent}` of `{letters}`. */
    told: string;
    /** Before what went wrong: "The hall of fame mails failed". */
    failed: string;
  };
  /** The donors who have the mail coming, each with their mail. */
  letters(): Promise<L[]>;
  /** What the dry run says of a letter after its donor's id; never an address. */
  describe(letter: L): string;
  /** Sends the mail to everyone who has it coming, once each; failures go to `report`. */
  send(report: (line: string) => void): Promise<OnceRun>;
}

/** Where a command prints and what it mails through. */
export interface OnceIo {
  mailer: Mailer;
  out(line: string): void;
  err(line: string): void;
}

/**
 * Runs such a command and answers its exit code. Without `--send` it only says who would get
 * the mail (donor ids, never an address) and sends nothing, so it is safe to run to see what a
 * send would do:
 *
 *   (nothing)          who would get the mail; nothing is sent
 *   --preview <dir>    the same, and writes each mail there (<donor id>.html and .txt)
 *   --test-to <email>  sends the first of those mails to this address instead; nobody is marked
 *   --send             mails every donor who has not had it
 *
 * 0 when all went well, 1 when a mail that should have gone out did not (or the run failed),
 * 2 for arguments it does not understand.
 */
export async function runOnce<L extends OnceLetter>(
  args: string[],
  command: OnceCommand<L>,
  io: OnceIo,
): Promise<number> {
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
    io.err(
      `usage: ${command.name} [--preview <dir>] [--test-to <email> | --send]   (nothing is sent without --send or --test-to)`,
    );
    return 2;
  }

  try {
    if (send) {
      const run = await command.send((line) => io.err(line));
      io.out(
        command.words.told
          .replace('{sent}', String(run.sent.length))
          .replace('{letters}', String(run.letters)),
      );
      for (const id of run.failed) io.out(`  not sent: ${id}`);
      for (const id of run.unsent) io.out(`  not tried: ${id}`);
      return run.failed.length + run.unsent.length > 0 ? 1 : 0;
    }

    const letters = await command.letters();
    io.out(
      `${letters.length} donors ${command.words.would} (nothing was sent):`,
    );
    for (const letter of letters)
      io.out(`  ${letter.donorId}  ${command.describe(letter)}`);
    if (preview !== null) {
      await mkdir(preview, { recursive: true });
      for (const { donorId, mail } of letters) {
        await writeFile(join(preview, `${donorId}.html`), mail.html);
        await writeFile(
          join(preview, `${donorId}.txt`),
          `Subject: ${mail.subject}\n\n${mail.text}`,
        );
      }
      io.out(`Their mails are in ${preview}.`);
    }
    if (testTo !== null) {
      const [first] = letters;
      if (!first) io.out('There is no mail to try: nobody is left to mail.');
      else {
        await io.mailer.send({ ...first.mail, to: testTo });
        io.out(
          `The mail of donor ${first.donorId} went to the address given instead; nobody was marked.`,
        );
      }
    }
    return 0;
  } catch (error) {
    // what went wrong, never an address
    io.err(`${command.words.failed}: ${failureOf(error)}`);
    return 1;
  }
}

/**
 * A command's whole run, from a shell: the database and the mail server the environment names
 * (without a mail server, in development, the mails go to the log), the process's own
 * arguments, and its exit code. The services are put together by hand, not by Nest, so tsx
 * (which emits no decorator metadata) can run it too.
 */
export async function onceMain<L extends OnceLetter>(
  env: Env,
  build: (prisma: PrismaService, mailer: Mailer) => OnceCommand<L>,
): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const mailer = createMailer(env);
  try {
    process.exitCode = await runOnce(
      process.argv.slice(2),
      build(prisma, mailer),
      {
        mailer,
        out: (line) => console.log(line),
        err: (line) => console.error(line),
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}
