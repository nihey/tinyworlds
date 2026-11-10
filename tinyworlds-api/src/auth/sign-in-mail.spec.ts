import { LOCALES } from '../donations/locales.js';
import { signInMail } from './sign-in-mail.js';

describe('signInMail', () => {
  const link = 'https://example.com/admin/#token=abc-DEF_123';

  it('carries the link, and how long it lasts, in every language', () => {
    for (const locale of LOCALES) {
      const mail = signInMail(locale, link, 15);
      expect(mail.subject).toContain('tinyworlds');
      expect(mail.text).toContain(link);
      expect(mail.text).toContain('15');
      expect(mail.html).toContain(`href="${link}"`);
      expect(mail.html).toContain('15');
    }
  });

  it('never lets a link break out of its markup', () => {
    const mail = signInMail('en-US', 'https://example.com/"><b>&', 15);
    expect(mail.html).not.toContain('"><b>');
    expect(mail.html).toContain('&quot;&gt;&lt;b&gt;&amp;');
  });
});
