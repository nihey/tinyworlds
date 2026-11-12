import type { Locale } from '../donations/locales.js';
import { listBuiltMail, type ListBuiltFacts } from './list-built-mail.js';
import type { MailSight } from './sights-catalog.js';

const SITE = 'https://example.com';

const sight = (world: string, city: string, n: number): MailSight => ({
  world,
  id: `${world}-${n}`,
  name: `Building ${n} of ${city}`,
  city,
  text: `What Wikipedia says of building ${n}.`,
  mapUrl: `${SITE}/${world}/#38.8${n},-104.8${n},1`,
  picture: {
    src: `${SITE}/api/sight-pictures/${world}/h${n}.png`,
    width: 90,
    height: 100,
  },
});

type City = ListBuiltFacts['cities'][number];

const COS: City = {
  name: 'Colorado Springs',
  slug: 'colorado-springs',
  world: 'tinycos',
  quiz: true,
  sights: [1, 2, 3].map((n) => sight('tinycos', 'Colorado Springs', n)),
};
const TKF: City = {
  name: 'Truckee',
  slug: 'truckee',
  world: 'tinytkf',
  quiz: false,
  sights: [1, 2].map((n) => sight('tinytkf', 'Truckee', n)),
};
/** An imagined world: no lit buildings, no quiz, no city in the usual sense. */
const WINTERFELL: City = {
  name: 'Winterfell',
  slug: 'winterfell',
  world: 'tinywinterfell',
  quiz: false,
  sights: [],
};

const facts = (over: Partial<ListBuiltFacts> = {}): ListBuiltFacts => ({
  locale: 'en-US',
  site: SITE,
  cities: [COS],
  reason: { kind: 'city', name: 'Colorado Springs' },
  leaveUrl: `${SITE}/lists/leave/#t=abc`,
  unsubscribeUrl: `${SITE}/api/lists/unsubscribe?t=abc`,
  ...over,
});

const LOCALES: Locale[] = ['en-US', 'pt-BR', 'es-ES'];

/** The HTML as text: tags gone, the entities this module writes read back. */
const textOf = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('listBuiltMail', () => {
  it('one city, in English: the share card, the words of the mockup, three buildings and the way in', () => {
    const { subject, html, text } = listBuiltMail(facts());
    expect(subject).toBe('Colorado Springs is built. Come and see it');
    const shown = textOf(html);
    expect(shown).toContain('Now on the map');
    expect(shown).toContain('Colorado Springs is built. Come and see it.');
    expect(shown).toContain(
      'You asked to hear the day it was on the map: it is, from today, open to everyone.',
    );
    expect(shown).toContain('Three places to start');
    expect(html).toContain(
      `<img src="${SITE}/tinycos/og/tinycos.jpg" width="560" height="294" alt="Colorado Springs on tinyworlds"`,
    );
    for (const s of COS.sights) {
      expect(html).toContain(s.name);
      expect(html).toContain(`href="${s.mapUrl}"`);
      expect(text).toContain(s.name);
      expect(text).toContain(s.mapUrl);
    }
    expect(html.match(/See it on the map/g)).toHaveLength(3);
    expect(shown).toContain('Explore Colorado Springs');
    expect(html).toContain(`href="${SITE}/tinycos/"`);
    expect(shown).toContain(
      "You're getting this because you asked to hear when Colorado Springs was built.",
    );
    expect(text).toContain('Colorado Springs is built. Come and see it.');
    expect(text).toContain(`Explore Colorado Springs: ${SITE}/tinycos/`);
  });

  it('says it in Portuguese and in Spanish', () => {
    const pt = listBuiltMail(facts({ locale: 'pt-BR' }));
    expect(pt.subject).toBe('Colorado Springs já está no mapa. Venha ver');
    expect(pt.html).toContain('lang="pt-BR"');
    expect(textOf(pt.html)).toContain('Já no mapa');
    expect(textOf(pt.html)).toContain('Três lugares para começar');
    expect(textOf(pt.html)).toContain('Explorar Colorado Springs');
    expect(textOf(pt.html)).toContain('Jogar Adivinhe o prédio');
    expect(textOf(pt.html)).toContain('Sair desta lista');
    expect(pt.text).toContain(
      'Você está recebendo isto porque pediu para saber quando Colorado Springs entrasse no mapa.',
    );

    const es = listBuiltMail(facts({ locale: 'es-ES' }));
    expect(es.subject).toBe(
      'Colorado Springs ya está en el mapa. Ven a echar un vistazo',
    );
    expect(es.html).toContain('lang="es-ES"');
    expect(textOf(es.html)).toContain('Ya en el mapa');
    expect(textOf(es.html)).toContain('Tres lugares por donde empezar');
    expect(textOf(es.html)).toContain('Jugar a Adivina el edificio');
    expect(textOf(es.html)).toContain('Salir de esta lista');
    expect(es.text).toContain(
      'Recibes esto porque pediste saber cuándo llegaría Colorado Springs al mapa.',
    );
  });

  it('for new cities, the footer says so, in each language', () => {
    const say = {
      'en-US':
        "You're getting this because you asked to hear when new cities are built.",
      'pt-BR':
        'Você está recebendo isto porque pediu para saber quando novas cidades ficarem prontas.',
      'es-ES':
        'Recibes esto porque pediste que te avisáramos cuando se construyeran nuevas ciudades.',
    };
    for (const locale of LOCALES) {
      const mail = listBuiltMail(facts({ locale, reason: { kind: 'new' } }));
      expect(mail.text).toContain(say[locale]);
      expect(textOf(mail.html)).toContain(say[locale]);
    }
  });

  it('a city with fewer than three buildings says how many', () => {
    const two = listBuiltMail(facts({ cities: [TKF] }));
    expect(textOf(two.html)).toContain('Two places to start');
    expect(textOf(two.html)).not.toContain('Three places');
    const one = listBuiltMail(
      facts({ cities: [{ ...TKF, sights: TKF.sights.slice(0, 1) }] }),
    );
    expect(textOf(one.html)).toContain('A place to start');
  });

  it('several cities: one mail naming them all, each with its card, one building and its buttons', () => {
    const two = listBuiltMail(
      facts({ cities: [COS, TKF], reason: { kind: 'new' } }),
    );
    expect(two.subject).toBe(
      'Colorado Springs and Truckee are built. Come and see them',
    );
    expect(textOf(two.html)).toContain(
      'Colorado Springs and Truckee are built. Come and see them.',
    );
    expect(textOf(two.html)).toContain(
      'You asked to hear the day they were on the map: they are, from today, open to everyone.',
    );
    for (const city of [COS, TKF]) {
      expect(two.html).toContain(`${SITE}/${city.world}/og/${city.world}.jpg`);
      expect(two.html).toContain(`alt="${city.name} on tinyworlds"`);
      expect(two.html).toContain(city.sights[0].name);
      expect(two.html).not.toContain(city.sights[1].name);
      expect(two.text).toContain(city.sights[0].name);
      expect(two.text).not.toContain(city.sights[1].name);
      expect(textOf(two.html)).toContain(`Explore ${city.name}`);
      expect(two.text).toContain(
        `Explore ${city.name}: ${SITE}/${city.world}/`,
      );
    }
    expect(textOf(two.html)).not.toContain('places to start');

    const three = listBuiltMail(
      facts({ cities: [COS, TKF, WINTERFELL], reason: { kind: 'new' } }),
    );
    expect(three.subject).toBe(
      'Colorado Springs, Truckee and Winterfell are built. Come and see them',
    );
    expect(
      listBuiltMail(
        facts({
          locale: 'pt-BR',
          cities: [COS, TKF, WINTERFELL],
          reason: { kind: 'new' },
        }),
      ).subject,
    ).toBe(
      'Colorado Springs, Truckee e Winterfell já estão no mapa. Venha ver',
    );
    expect(
      listBuiltMail(
        facts({
          locale: 'es-ES',
          cities: [COS, TKF],
          reason: { kind: 'new' },
        }),
      ).subject,
    ).toBe(
      'Colorado Springs y Truckee ya están en el mapa. Ven a echar un vistazo',
    );
  });

  it('offers Guess the building only for a world with a quiz', () => {
    const quiz = listBuiltMail(facts());
    expect(quiz.html.match(/Play Guess the building/g)).toHaveLength(1);
    expect(quiz.text).toContain(`Play Guess the building: ${SITE}/tinycos/`);
    for (const locale of LOCALES) {
      const none = listBuiltMail(
        facts({
          locale,
          cities: [TKF],
          reason: { kind: 'city', name: 'Truckee' },
        }),
      );
      for (const part of [none.html, none.text])
        expect(part).not.toMatch(
          /Guess the building|Adivinhe o prédio|Adivina el edificio/,
        );
    }
    // with several cities, only beside the one that has it
    const both = listBuiltMail(
      facts({ cities: [COS, TKF], reason: { kind: 'new' } }),
    );
    expect(both.html.match(/Play Guess the building/g)).toHaveLength(1);
  });

  it('a world without buildings: its picture and its buttons, and never "the city"', () => {
    for (const locale of LOCALES) {
      const mail = listBuiltMail(
        facts({
          locale,
          cities: [WINTERFELL],
          reason: { kind: 'new' },
        }),
      );
      expect(mail.html).toContain(
        `${SITE}/tinywinterfell/og/tinywinterfell.jpg`,
      );
      expect(mail.html).toContain(`href="${SITE}/tinywinterfell/"`);
      expect(mail.html).not.toContain('/api/sight-pictures/');
      for (const part of [textOf(mail.html), mail.text]) {
        expect(part).toContain('Winterfell');
        expect(part).not.toMatch(/places to start|lugares para|lugares por/i);
        expect(part).not.toMatch(
          /the city|a cidade|la ciudad|this city|esta cidade|esta ciudad/i,
        );
      }
    }
    expect(
      listBuiltMail(facts({ cities: [WINTERFELL], reason: { kind: 'new' } }))
        .subject,
    ).toBe('Winterfell is built. Come and see it');
  });

  it('escapes what was typed: a city name with markup', () => {
    const name = '<script>alert(1)</script> & "Co"';
    const odd: City = {
      ...COS,
      name,
      sights: COS.sights.map((s) => ({ ...s, city: name })),
    };
    const mail = listBuiltMail(
      facts({ cities: [odd, TKF], reason: { kind: 'city', name } }),
    );
    const single = listBuiltMail(
      facts({ cities: [odd], reason: { kind: 'city', name } }),
    );
    for (const { html } of [mail, single]) {
      expect(html).not.toContain('<script>');
      expect(html).toContain(
        '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;',
      );
    }
    expect(single.text).toContain(name);
    expect(single.subject).toBe(`${name} is built. Come and see it`);
  });

  it('contains no emoji, in any language or shape', () => {
    for (const locale of LOCALES)
      for (const cities of [[COS], [WINTERFELL], [COS, TKF, WINTERFELL]])
        for (const reason of [
          { kind: 'new' } as const,
          { kind: 'city', name: 'Truckee' } as const,
        ]) {
          const mail = listBuiltMail(facts({ locale, cities, reason }));
          for (const part of [mail.subject, mail.text, mail.html])
            expect(part).not.toMatch(/\p{Extended_Pictographic}/u);
        }
  });

  it('has a text part, a leave link and the List-Unsubscribe headers', () => {
    const mail = listBuiltMail(facts());
    expect(mail.text).toContain(`Leave this list: ${SITE}/lists/leave/#t=abc`);
    expect(mail.html).toContain(`href="${SITE}/lists/leave/#t=abc"`);
    expect(textOf(mail.html)).toContain('Leave this list');
    expect(mail.headers).toEqual({
      'List-Unsubscribe': `<${SITE}/api/lists/unsubscribe?t=abc>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});
