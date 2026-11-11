import { LOCALES } from '../donations/locales.js';
import { signInMail } from './sign-in-mail.js';

describe('signInMail', () => {
  const link = 'https://example.com/admin/#token=abc-DEF_123';
  const site = 'https://example.com';
  const mail = (
    over: Partial<Parameters<typeof signInMail>[0]> = {},
  ): ReturnType<typeof signInMail> =>
    signInMail({
      locale: 'en-US',
      link,
      code: '482913',
      minutes: 15,
      purpose: 'admin',
      site,
      ...over,
    });

  it('carries the link, and how long it lasts, in every language', () => {
    for (const locale of LOCALES) {
      const { subject, text, html } = mail({ locale });
      expect(subject).toContain('tinyworlds');
      expect(text).toContain(link);
      expect(text).toContain('15');
      expect(html).toContain(`href="${link}"`);
      expect(html).toContain('15');
      expect(html).toContain(`<html lang="${locale}">`);
    }
  });

  it('puts the code in the subject and in both bodies, in every language', () => {
    for (const locale of LOCALES) {
      const { subject, text, html } = mail({ locale });
      expect(subject.endsWith('482 913')).toBe(true);
      expect(text).toContain('482 913');
      expect(html).toContain('482 913');
    }
  });

  it('keeps the subject as it was', () => {
    expect(mail().subject).toBe('Your tinyworlds code: 482 913');
    expect(mail({ locale: 'pt-BR' }).subject).toBe(
      'Seu código do tinyworlds: 482 913',
    );
    expect(mail({ locale: 'es-ES' }).subject).toBe(
      'Tu código de tinyworlds: 482 913',
    );
  });

  it('shows the code first and the button after it', () => {
    for (const purpose of ['admin', 'donor'] as const) {
      const { text, html } = mail({ purpose });
      expect(html.indexOf('>482 913</td>')).toBeLessThan(
        html.indexOf(`href="${link}"`),
      );
      expect(text.indexOf('482 913')).toBeLessThan(text.indexOf(link));
      expect(html).toContain('Type this code on the page you came from:');
    }
  });

  it('speaks to a donor of their cities, and to an admin of the admin pages', () => {
    const buttons = {
      'en-US': ['See your cities', 'Open the admin pages'],
      'pt-BR': ['Ver suas cidades', 'Abrir a administração'],
      'es-ES': ['Ver tus ciudades', 'Abrir la administración'],
    } as const;
    for (const locale of LOCALES) {
      const [forDonor, forAdmin] = buttons[locale];
      const donor = mail({ locale, purpose: 'donor' });
      expect(donor.html).toContain(`>${forDonor}</a>`);
      expect(donor.html).not.toContain(forAdmin);
      expect(donor.subject.endsWith('482 913')).toBe(true);
      const admin = mail({ locale, purpose: 'admin' });
      expect(admin.html).toContain(`>${forAdmin}</a>`);
      expect(admin.html).not.toContain(forDonor);
    }
  });

  it('says the code works once, and what to do with a mail nobody asked for', () => {
    const { text, html } = mail({ purpose: 'donor' });
    for (const line of [
      'The code and the button work once, for 15 minutes. Asked more than once? Use the newest mail.',
      "Didn't ask for this? Ignore it: nothing happens without the code or the button.",
    ]) {
      expect(text).toContain(line);
      expect(html).toContain(line.replace("'", '&#39;'));
    }
  });

  it("shows the site's own wordmark, with words for when pictures are blocked", () => {
    const { html } = mail({ site: 'https://www.example.com' });
    expect(html).toContain(
      'src="https://www.example.com/email/wordmark.png" width="105" height="21" alt="tinyworlds"',
    );
  });

  it('never lets a link break out of its markup', () => {
    const { html } = mail({ link: 'https://example.com/"><b>&' });
    expect(html).not.toContain('"><b>');
    expect(html).toContain('&quot;&gt;&lt;b&gt;&amp;');
  });
});
