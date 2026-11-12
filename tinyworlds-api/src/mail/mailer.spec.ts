import { createMailer, type MailEnv } from './mailer.js';

const ENV: MailEnv = {
  NODE_ENV: 'production',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: 587,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  MAIL_FROM: 'tinyworlds <site@example.com>',
};
const MAIL = {
  to: 'ana@example.com',
  subject: 'Hello',
  text: 'Hello',
  html: '<p>Hello</p>',
};

/** A mailer whose mail server only keeps what it is handed. */
const mailer = () => {
  const handed: { from?: string; to?: string }[] = [];
  const made = createMailer(ENV, () => ({
    sendMail: (mail) => {
      handed.push(mail);
      return Promise.resolve();
    },
  }));
  return { handed, made };
};

describe('createMailer', () => {
  it('sends a mail from the site', async () => {
    const { handed, made } = mailer();
    await made.send(MAIL);
    expect(handed).toEqual([
      { ...MAIL, from: 'tinyworlds <site@example.com>' },
    ]);
  });

  it('sends a mail that says who it is from in their name', async () => {
    const { handed, made } = mailer();
    await made.send({ ...MAIL, from: 'Robin <robin@example.com>' });
    expect(handed[0].from).toBe('Robin <robin@example.com>');
  });

  it('sends a mail that names nobody from the site all the same', async () => {
    const { handed, made } = mailer();
    await made.send({ ...MAIL, from: undefined });
    expect(handed[0].from).toBe('tinyworlds <site@example.com>');
  });
});
