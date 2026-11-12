import {
  createMailer,
  isRecipientRefused,
  isServerFailure,
  type MailEnv,
} from './mailer.js';

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

/** An error as nodemailer makes one for a reply of the mail server's. */
const smtpError = (code: string, command: string, responseCode?: number) =>
  Object.assign(new Error('refused'), { code, command, responseCode });

describe('isRecipientRefused', () => {
  it('is a 5xx reply to the recipient: that address will never take the mail', () => {
    expect(isRecipientRefused(smtpError('EENVELOPE', 'RCPT TO', 550))).toBe(
      true,
    );
    expect(isRecipientRefused(smtpError('EENVELOPE', 'RCPT TO', 553))).toBe(
      true,
    );
  });

  it('is not a temporary reply (4xx), which may go through next time', () => {
    expect(isRecipientRefused(smtpError('EENVELOPE', 'RCPT TO', 450))).toBe(
      false,
    );
  });

  it('is not a refusal of the sender or of the message, which every mail would get', () => {
    expect(isRecipientRefused(smtpError('EENVELOPE', 'MAIL FROM', 550))).toBe(
      false,
    );
    expect(isRecipientRefused(smtpError('EMESSAGE', 'DATA', 554))).toBe(false);
  });

  it('is not the mail server failing, nor an error with no reply', () => {
    const auth = smtpError('EAUTH', 'AUTH PLAIN', 535);
    expect(isServerFailure(auth)).toBe(true);
    expect(isRecipientRefused(auth)).toBe(false);
    expect(isRecipientRefused(smtpError('ECONNECTION', 'CONN'))).toBe(false);
    expect(isRecipientRefused(new Error('550 mailbox unavailable'))).toBe(
      false,
    );
    expect(isRecipientRefused(null)).toBe(false);
  });
});
