import { LOCALES } from '../donations/locales.js';
import {
  CITIES_LISTED,
  hallCityUrl,
  hallMail,
  type HallFacts,
} from './hall-mail.js';

const facts = (over: Partial<HallFacts> = {}): HallFacts => ({
  locale: 'en-US',
  site: 'https://example.com',
  cities: [{ slug: 'sao-paulo', name: 'São Paulo', named: true }],
  name: 'Ana Souza',
  givenCents: 2500,
  picturesFromCents: 1000,
  links: 0,
  linksMax: 3,
  ...over,
});

describe('hallMail', () => {
  it('tells a donor of one city they are in its hall, under their name, with the way there', () => {
    const mail = hallMail(facts());
    expect(mail.subject).toBe("You're in São Paulo's Hall of Fame");
    expect(mail.text).toContain("You're in São Paulo's Hall of Fame.");
    expect(mail.text).toContain(
      'São Paulo as Ana Souza: https://example.com/hall-of-fame/sao-paulo/',
    );
    expect(mail.html).toContain(
      'href="https://example.com/hall-of-fame/sao-paulo/"',
    );
    expect(mail.html).toContain('as Ana Souza');
    // the way to add links, and the front page's share card on top
    expect(mail.html).toContain('href="https://example.com/me/"');
    expect(mail.html).toContain('https://example.com/og/tinyworlds.jpg');
  });

  it('promises what the site does: plain links that search engines follow', () => {
    const { text, html } = hallMail(facts());
    expect(text).toContain('up to 3 links');
    expect(text).toContain('search engines follow');
    expect(text).toContain('no “nofollow”');
    expect(html).toContain('no “nofollow”');
  });

  it('says whether the pictures show, and what is missing when they do not', () => {
    expect(hallMail(facts()).text).toContain(
      'You have given US$10 or more, so your links show their pictures too.',
    );
    expect(hallMail(facts({ givenCents: 600 })).text).toContain(
      'From US$10 given in all, links show their pictures too. You have given US$6 so far.',
    );
  });

  it('lists every city of a donor of several, each with how they show there', () => {
    const mail = hallMail(
      facts({
        cities: [
          { slug: 'sao-paulo', name: 'São Paulo', named: true },
          { slug: 'lisbon', name: 'Lisbon', named: false },
        ],
      }),
    );
    expect(mail.subject).toBe("You're in the tinyworlds Hall of Fame");
    expect(mail.text).toContain("You're in the Hall of Fame of 2 cities.");
    expect(mail.text).toContain(
      'São Paulo as Ana Souza: https://example.com/hall-of-fame/sao-paulo/',
    );
    expect(mail.text).toContain(
      'Lisbon as “Anonymous”: https://example.com/hall-of-fame/lisbon/',
    );
    expect(mail.text).toContain(
      'See the Hall of Fame: https://example.com/hall-of-fame/',
    );
    expect(mail.html).toContain(
      'href="https://example.com/hall-of-fame/lisbon/"',
    );
    expect(mail.html).toContain('href="https://example.com/hall-of-fame/"');
  });

  it('tells a donor who is named nowhere that links go with a name', () => {
    for (const over of [
      { name: null },
      { cities: [{ slug: 'lisbon', name: 'Lisbon', named: false }] },
    ]) {
      const mail = hallMail(facts(over));
      expect(mail.text).toContain('as “Anonymous”');
      // what links are is still said; what comes first is added
      expect(mail.text).toContain('up to 3 links');
      expect(mail.text).toContain('Links go where your name goes');
    }
  });

  it('does not invite someone whose links are already up to add them', () => {
    const mail = hallMail(facts({ links: 2 }));
    expect(mail.text).toContain('Your links are up beside your name.');
    expect(mail.text).not.toContain('up to 3 links');
  });

  it('escapes what donors typed', () => {
    const mail = hallMail(
      facts({
        name: '<b>Ana</b> & co',
        cities: [{ slug: 'x', name: 'A <i>city</i>', named: true }],
      }),
    );
    expect(mail.html).not.toContain('<b>Ana</b>');
    expect(mail.html).not.toContain('<i>city</i>');
    expect(mail.html).toContain('&lt;b&gt;Ana&lt;/b&gt; &amp; co');
  });

  it('names no more cities than it says, and never anyone else', () => {
    const many = Array.from({ length: CITIES_LISTED + 4 }, (_, i) => ({
      slug: `city-${i}`,
      name: `City ${i}`,
      named: true,
    }));
    const mail = hallMail(facts({ cities: many }));
    expect(mail.text).toContain(`Hall of Fame of ${many.length} cities`);
    expect(mail.text).toContain(`city-${CITIES_LISTED - 1}/`);
    expect(mail.text).not.toContain(`city-${CITIES_LISTED}/`);
    expect(mail.text).not.toContain('@');
  });

  it.each(LOCALES)('reads in %s with nothing left to fill in', (locale) => {
    for (const over of [
      {},
      { givenCents: 300 },
      { name: null },
      { links: 1 },
      {
        cities: [
          { slug: 'a', name: 'A', named: true },
          { slug: 'b', name: 'B', named: false },
        ],
      },
    ]) {
      const mail = hallMail(facts({ locale, ...over }));
      expect(mail.subject).not.toMatch(/\{\w+\}/);
      expect(mail.text).not.toMatch(/\{\w+\}/);
      expect(mail.html).not.toMatch(/\{\w+\}/);
      expect(mail.html).toContain(`<html lang="${locale}">`);
      expect(mail.text).toContain('https://example.com/me/');
      // the promise is made in every language
      expect(mail.text).toContain('nofollow');
    }
  });
});

describe('hallCityUrl', () => {
  it('is a page of its own for a plain slug, a question to the hall for any other', () => {
    expect(hallCityUrl('https://example.com', 'sao-paulo')).toBe(
      'https://example.com/hall-of-fame/sao-paulo/',
    );
    expect(hallCityUrl('https://example.com', '東京')).toBe(
      'https://example.com/hall-of-fame/?city=%E6%9D%B1%E4%BA%AC',
    );
  });
});
