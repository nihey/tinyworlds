import { LOCALES } from '../donations/locales.js';
import { noteMail, ownerOf, type NoteFacts } from './note-mail.js';

const OWNER = {
  name: 'Robin',
  from: 'Robin from tinyworlds <robin@example.com>',
  whatsapp: '+1 555 010-0199',
};

const facts = (over: Partial<NoteFacts> = {}): NoteFacts => ({
  locale: 'en-US',
  site: 'https://example.com',
  owner: OWNER,
  cities: ['São Paulo'],
  name: 'Ana Souza',
  ...over,
});

describe('noteMail', () => {
  it("thanks a donor of one city by name, for that city, in the owner's own words", () => {
    const mail = noteMail(facts());
    expect(mail.subject).toBe('Thank you for helping build São Paulo');
    expect(mail.text).toBe(
      [
        'Hi Ana Souza,',
        "I'm Robin, the person behind tinyworlds. I wanted to thank you myself for what you gave to São Paulo.",
        'Gifts like yours decide which city gets built next, and they keep the cities already on the map online. Thank you for being part of it.',
        "If there is anything you'd like to tell me, an idea, a city you'd love to see, something that looks wrong on a map, send me a message on WhatsApp: +1 555 010-0199 (https://wa.me/15550100199).",
        'Thank you,\nRobin',
        "You're getting this once, because you donated to tinyworlds.",
      ].join('\n\n') + '\n',
    );
    expect(mail.html).toContain('Hi Ana Souza,');
    expect(mail.html).toContain('A note from Robin');
  });

  it('comes from the owner, not from the site', () => {
    expect(noteMail(facts()).from).toBe(
      'Robin from tinyworlds <robin@example.com>',
    );
  });

  it("leads to a chat with the owner's number, shown as the owner writes it", () => {
    const { html } = noteMail(facts());
    // once in the sentence, once as the button
    expect(html.split('href="https://wa.me/15550100199"')).toHaveLength(3);
    expect(html).toContain('>+1 555 010-0199</a>');
    expect(html).toContain('Message me on WhatsApp');
  });

  it('greets a donor who gave no name plainly', () => {
    const mail = noteMail(facts({ name: null }));
    expect(mail.text.startsWith('Hi,\n\n')).toBe(true);
    expect(mail.html).not.toContain('Hi ,');
  });

  it('names every city of a donor of several', () => {
    const mail = noteMail(facts({ cities: ['Lisbon', 'Porto', 'Faro'] }));
    expect(mail.subject).toBe('Thank you for backing tinyworlds');
    expect(mail.text).toContain('what you gave to Lisbon, Porto, and Faro.');
  });

  it('escapes what donors typed', () => {
    const { html } = noteMail(
      facts({ name: '<b>Ana</b>', cities: ['Tom & Jerry'] }),
    );
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(html).not.toContain('<b>Ana</b>');
    expect(html).toContain('Tom &amp; Jerry');
  });

  it('is written in every language, with nothing left to fill in', () => {
    for (const locale of LOCALES)
      for (const over of [
        {},
        { name: null },
        { cities: ['Lisbon', 'Porto'] },
      ]) {
        const mail = noteMail(facts({ locale, ...over }));
        expect(mail.subject).not.toMatch(/\{\w+\}/);
        expect(mail.text).not.toMatch(/\{\w+\}/);
        expect(mail.html).not.toMatch(/\{\w+\}/);
        expect(mail.html).toContain(`<html lang="${locale}">`);
        // who writes, and how to answer, whatever the language
        expect(mail.text).toContain('Robin');
        expect(mail.text).toContain('https://wa.me/15550100199');
      }
  });

  it('joins the cities the way each language does', () => {
    const cities = ['Lisbon', 'Porto'];
    expect(noteMail(facts({ locale: 'pt-BR', cities })).text).toContain(
      'Lisbon e Porto',
    );
    expect(noteMail(facts({ locale: 'es-ES', cities })).text).toContain(
      'Lisbon y Porto',
    );
  });
});

describe('ownerOf', () => {
  const env = {
    OWNER_NAME: 'Robin',
    OWNER_MAIL_FROM: 'Robin from tinyworlds <robin@example.com>',
    OWNER_WHATSAPP: '+1 555 010-0199',
  };

  it('is the owner the environment names', () => {
    expect(ownerOf(env)).toEqual({ owner: OWNER, missing: [] });
  });

  it('says what the environment does not name, and gives no owner then', () => {
    expect(
      ownerOf({ ...env, OWNER_NAME: undefined, OWNER_WHATSAPP: undefined }),
    ).toEqual({ owner: null, missing: ['OWNER_NAME', 'OWNER_WHATSAPP'] });
  });
});
