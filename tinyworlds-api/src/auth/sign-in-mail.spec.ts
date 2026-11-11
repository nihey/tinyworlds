import { LOCALES } from '../donations/locales.js';
import { signInMail } from './sign-in-mail.js';

describe('signInMail', () => {
  const link = 'https://example.com/admin/#token=abc-DEF_123';

  it('carries the link, and how long it lasts, in every language', () => {
    for (const locale of LOCALES) {
      const mail = signInMail(locale, link, '482913', 15, 'admin');
      expect(mail.subject).toContain('tinyworlds');
      expect(mail.text).toContain(link);
      expect(mail.text).toContain('15');
      expect(mail.html).toContain(`href="${link}"`);
      expect(mail.html).toContain('15');
    }
  });

  it('puts the code in the subject and in both bodies, in every language', () => {
    for (const locale of LOCALES) {
      const mail = signInMail(locale, link, '482913', 15, 'admin');
      expect(mail.subject.endsWith('482 913')).toBe(true);
      expect(mail.text).toContain('482 913');
      expect(mail.html).toContain('482 913');
    }
  });

  it('never lets a link break out of its markup', () => {
    const mail = signInMail(
      'en-US',
      'https://example.com/"><b>&',
      '482913',
      15,
      'admin',
    );
    expect(mail.html).not.toContain('"><b>');
    expect(mail.html).toContain('&quot;&gt;&lt;b&gt;&amp;');
  });
});
