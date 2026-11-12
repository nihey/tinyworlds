import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Mail } from '../mail/mailer.js';
import { runOnce, type OnceCommand } from './once-cli.js';
import type { OnceLetter, OnceRun } from './once.js';

type Letter = OnceLetter & { about: string };

const LETTERS: Letter[] = [
  {
    donorId: 'donor-1',
    about: 'en-US  1 city',
    mail: {
      to: 'ana@example.com',
      subject: 'For Ana',
      text: 'Hello Ana',
      html: '<p>Hello Ana</p>',
    },
  },
  {
    donorId: 'donor-2',
    about: 'pt-BR  2 cities',
    mail: {
      to: 'bo@example.com',
      from: 'Robin <robin@example.com>',
      subject: 'For Bo',
      text: 'Hello Bo',
      html: '<p>Hello Bo</p>',
    },
  },
];

/** A command over these letters, with what it printed, mailed and sent. */
const stage = (
  over: Partial<OnceCommand<Letter>> = {},
  run: OnceRun = {
    letters: 2,
    sent: ['donor-1', 'donor-2'],
    failed: [],
    unsent: [],
  },
) => {
  const out: string[] = [];
  const err: string[] = [];
  const mailed: Mail[] = [];
  let sends = 0;
  const command: OnceCommand<Letter> = {
    name: 'some-cli',
    words: {
      would: 'would be told the news',
      told: 'Told {sent} of {letters} donors the news.',
      failed: 'Telling the news failed',
    },
    letters: () => Promise.resolve(LETTERS),
    describe: (letter) => letter.about,
    send: (report) => {
      sends++;
      for (const id of run.failed) report(`not sent to donor ${id}`);
      return Promise.resolve(run);
    },
    ...over,
  };
  const io = {
    mailer: {
      send: (mail: Mail) => {
        mailed.push(mail);
        return Promise.resolve();
      },
    },
    out: (line: string) => void out.push(line),
    err: (line: string) => void err.push(line),
  };
  return {
    out,
    err,
    mailed,
    sends: () => sends,
    run: (...args: string[]) => runOnce(args, command, io),
  };
};

describe('runOnce', () => {
  it('says who would get the mail, by donor id, and sends nothing', async () => {
    const s = stage();
    expect(await s.run()).toBe(0);
    expect(s.out).toEqual([
      '2 donors would be told the news (nothing was sent):',
      '  donor-1  en-US  1 city',
      '  donor-2  pt-BR  2 cities',
    ]);
    expect(s.out.join('\n')).not.toContain('@');
    expect(s.mailed).toEqual([]);
    expect(s.sends()).toBe(0);
  });

  it('writes every mail into a folder to be read, and still sends nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'once-cli-'));
    try {
      const s = stage();
      expect(await s.run('--preview', dir)).toBe(0);
      expect((await readdir(dir)).sort()).toEqual([
        'donor-1.html',
        'donor-1.txt',
        'donor-2.html',
        'donor-2.txt',
      ]);
      expect(await readFile(join(dir, 'donor-2.html'), 'utf8')).toBe(
        '<p>Hello Bo</p>',
      );
      expect(await readFile(join(dir, 'donor-2.txt'), 'utf8')).toBe(
        'Subject: For Bo\n\nHello Bo',
      );
      expect(s.out.at(-1)).toBe(`Their mails are in ${dir}.`);
      expect(s.mailed).toEqual([]);
      expect(s.sends()).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('sends the first mail to the address given instead, and marks nobody', async () => {
    const s = stage();
    expect(await s.run('--test-to', 'owner@example.com')).toBe(0);
    expect(s.mailed).toEqual([{ ...LETTERS[0].mail, to: 'owner@example.com' }]);
    expect(s.sends()).toBe(0);
    expect(s.out.at(-1)).toBe(
      'The mail of donor donor-1 went to the address given instead; nobody was marked.',
    );
    expect(s.out.join('\n')).not.toContain('@');
  });

  it('keeps who a mail is from when it goes to the address given', async () => {
    const s = stage({ letters: () => Promise.resolve([LETTERS[1]]) });
    await s.run('--test-to', 'owner@example.com');
    expect(s.mailed).toEqual([
      {
        ...LETTERS[1].mail,
        to: 'owner@example.com',
        from: 'Robin <robin@example.com>',
      },
    ]);
  });

  it('says so when nobody is left and there is no mail to try', async () => {
    const s = stage({ letters: () => Promise.resolve([]) });
    expect(await s.run('--test-to', 'owner@example.com')).toBe(0);
    expect(s.mailed).toEqual([]);
    expect(s.out.at(-1)).toBe(
      'There is no mail to try: nobody is left to mail.',
    );
  });

  it('sends with --send, and says how many were reached', async () => {
    const s = stage();
    expect(await s.run('--send')).toBe(0);
    expect(s.sends()).toBe(1);
    expect(s.out).toEqual(['Told 2 of 2 donors the news.']);
  });

  it('names who was not reached, and exits 1 for it', async () => {
    const s = stage(
      {},
      {
        letters: 3,
        sent: ['donor-1'],
        failed: ['donor-2'],
        unsent: ['donor-3'],
      },
    );
    expect(await s.run('--send')).toBe(1);
    expect(s.out).toEqual([
      'Told 1 of 3 donors the news.',
      '  not sent: donor-2',
      '  not tried: donor-3',
    ]);
    // what went wrong with each, as the sending reports it
    expect(s.err).toEqual(['not sent to donor donor-2']);
  });

  it('refuses what it does not understand, and does nothing then', async () => {
    for (const args of [
      ['--sned'],
      ['--send', '--test-to', 'owner@example.com'],
      ['--test-to'],
      ['--test-to', 'not-an-address'],
      ['--preview'],
      ['extra'],
    ]) {
      const s = stage();
      expect(await s.run(...args)).toBe(2);
      expect(s.err).toEqual([
        'usage: some-cli [--preview <dir>] [--test-to <email> | --send]   (nothing is sent without --send or --test-to)',
      ]);
      expect(s.out).toEqual([]);
      expect(s.mailed).toEqual([]);
      expect(s.sends()).toBe(0);
    }
  });

  it('exits 1 when it fails, saying what went wrong and never an address', async () => {
    const away = () =>
      Promise.reject(
        Object.assign(new Error('no route to ana@example.com'), {
          code: 'ECONNECTION',
        }),
      );
    const sending = stage({ send: away });
    expect(await sending.run('--send')).toBe(1);
    expect(sending.err).toEqual(['Telling the news failed: Error ECONNECTION']);
    const listing = stage({ letters: away });
    expect(await listing.run()).toBe(1);
    expect(listing.err).toEqual(['Telling the news failed: Error ECONNECTION']);
    expect(listing.out).toEqual([]);
  });
});
