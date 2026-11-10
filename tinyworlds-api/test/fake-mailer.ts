import type { Mail, Mailer } from '../src/auth/mailer.js';

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

  /** The token the last mail's sign-in link carries. */
  token(): string {
    const found = /#token=([\w-]+)/.exec(this.sent.at(-1)?.text ?? '');
    if (!found) throw new Error('no sign-in link in the last mail');
    return found[1];
  }
}
