import type { Mail, Mailer } from '../src/mail/mailer.js';

/** A sign-in mail is the one that carries a link with a token. */
const isSignIn = (mail: Mail): boolean => /#token=[\w-]+/.test(mail.text);

/** Keeps the mail instead of sending it. */
export class FakeMailer implements Mailer {
  sent: Mail[] = [];
  /** Set to make the next mail fail the way a mail server that is away does. */
  failWith: Error | null = null;

  send(mail: Mail): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(mail);
    return Promise.resolve();
  }

  /**
   * The sign-in mails among those sent. Thank-you mails go out on their own after a donation is
   * recorded, so a test that waits for a sign-in mail counts these.
   */
  signIns(): Mail[] {
    return this.sent.filter(isSignIn);
  }

  /** The mails sent to an address that are not sign-in mails. */
  others(to?: string): Mail[] {
    return this.sent.filter(
      (mail) => !isSignIn(mail) && (to === undefined || mail.to === to),
    );
  }

  /** The token the last sign-in mail's link carries. */
  token(): string {
    const found = /#token=([\w-]+)/.exec(this.signIns().at(-1)?.text ?? '');
    if (!found) throw new Error('no sign-in link in the last sign-in mail');
    return found[1];
  }

  /** The 6-digit code the last sign-in mail's subject carries, without its space. */
  code(): string {
    const found = /(\d{3}) (\d{3})/.exec(this.signIns().at(-1)?.subject ?? '');
    if (!found) throw new Error('no sign-in code in the last sign-in mail');
    return found[1] + found[2];
  }
}
