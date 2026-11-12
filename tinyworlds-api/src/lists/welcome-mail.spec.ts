import type { Locale } from '../donations/locales.js';
import { welcomeMail, type WelcomeFacts } from './welcome-mail.js';
import type { MailSight } from './sights-catalog.js';

const SIGHTS: MailSight[] = [
  {
    world: 'tinynyc',
    id: 'a',
    name: 'Statue of Liberty',
    city: 'New York',
    text: 'A colossal sculpture on Liberty Island.',
    mapUrl: 'https://example.com/tinynyc/#40.68,-74.04,1',
    picture: {
      src: 'https://example.com/api/sight-pictures/tinynyc/abc.png',
      width: 80,
      height: 100,
    },
  },
  {
    world: 'tinypit',
    id: 'b',
    name: 'Cathedral of Learning',
    city: 'Pittsburgh',
    text: 'A 42-story skyscraper in Oakland.',
    mapUrl: 'https://example.com/tinypit/#40.44,-79.95,1',
    picture: {
      src: 'https://example.com/api/sight-pictures/tinypit/def.png',
      width: 70,
      height: 105,
    },
  },
];

const facts = (over: Partial<WelcomeFacts> = {}): WelcomeFacts => ({
  locale: 'en-US',
  site: 'https://example.com',
  list: { kind: 'city', name: 'Tokyo', slug: 'tokyo' },
  sights: SIGHTS,
  leaveUrl: 'https://example.com/lists/leave/#t=abc',
  unsubscribeUrl: 'https://example.com/api/lists/unsubscribe?t=abc',
  ...over,
});

const LOCALES: Locale[] = ['en-US', 'pt-BR', 'es-ES'];

describe('welcomeMail', () => {
  it("says the city's name in the heading and the footer, in each language", () => {
    const en = welcomeMail(facts());
    expect(en.subject).toBe("You're on the list for Tokyo");
    expect(en.html).toContain(
      "We'll write the day Tokyo is built.".replace("'", '&#39;'),
    );
    expect(en.html).toContain("You're on the list".replace("'", '&#39;'));
    expect(en.html).toContain(
      'You&#39;re getting this because you asked to hear when Tokyo is built.',
    );
    expect(en.html).toContain('Help build Tokyo');
    for (const locale of ['pt-BR', 'es-ES'] as const) {
      const mail = welcomeMail(facts({ locale }));
      expect(mail.subject).toContain('Tokyo');
      expect(mail.html).toContain(`lang="${locale}"`);
      expect(mail.text.match(/Tokyo/g)!.length).toBeGreaterThanOrEqual(3);
    }
    const pt = welcomeMail(facts({ locale: 'pt-BR' }));
    // "prédios", as the quiz says ("Adivinhe o prédio") and the sign does
    expect(pt.text).toContain(
      'Enquanto isso: três prédios que já estão no mapa',
    );
    const es = welcomeMail(facts({ locale: 'es-ES' }));
    expect(es.text).toContain(
      'Recibes esto porque pediste que te avisáramos cuando se construyera Tokyo.',
    );
  });

  it('new cities: says so, and has no Help-build button', () => {
    for (const locale of LOCALES) {
      const mail = welcomeMail(facts({ locale, list: { kind: 'new' } }));
      expect(mail.html).not.toContain('#ranking');
      expect(mail.text).not.toContain('#ranking');
    }
    const en = welcomeMail(facts({ list: { kind: 'new' } }));
    expect(en.text).toContain("We'll write each time a new city is built.");
    expect(en.text).toContain('when new cities are built.');
    expect(en.html).toContain('#cities');
    const es = welcomeMail(facts({ locale: 'es-ES', list: { kind: 'new' } }));
    expect(es.text).toContain(
      'Recibes esto porque pediste que te avisáramos cuando se construyeran nuevas ciudades.',
    );
  });

  it('each building has its picture with alt text, city, name, line and See it on the map link', () => {
    const { html, text } = welcomeMail(facts());
    expect(html).toContain(
      '<img src="https://example.com/api/sight-pictures/tinynyc/abc.png" width="80" height="100" alt="Statue of Liberty"',
    );
    for (const s of SIGHTS) {
      expect(html).toContain(s.city);
      expect(html).toContain(s.name);
      expect(html).toContain(s.text);
      expect(html).toContain(`href="${s.mapUrl}"`);
      expect(text).toContain(s.mapUrl);
    }
    expect(html.match(/See it on the map/g)).toHaveLength(2);
    expect(html).toContain(
      'While you wait: three buildings already on the map',
    );
  });

  it("with no buildings, no 'While you wait' section", () => {
    for (const locale of LOCALES) {
      const mail = welcomeMail(facts({ locale, sights: [] }));
      expect(mail.html).not.toContain(
        '<img src="https://example.com/api/sight',
      );
      expect(mail.html).not.toMatch(
        /While you wait|Enquanto isso|Mientras esperas/,
      );
      expect(mail.text).not.toMatch(
        /While you wait|Enquanto isso|Mientras esperas/,
      );
    }
  });

  it('escapes a city name with markup', () => {
    const name = '<script>alert(1)</script> & "Co"';
    const mail = welcomeMail(
      facts({ list: { kind: 'city', name, slug: 'x' } }),
    );
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;Co&quot;',
    );
    expect(mail.text).toContain(name);
  });

  it('has a text part and the List-Unsubscribe headers', () => {
    const mail = welcomeMail(facts());
    expect(mail.text).toContain('https://example.com/lists/leave/#t=abc');
    expect(mail.text).toContain('Leave this list');
    expect(mail.html).toContain(
      'href="https://example.com/lists/leave/#t=abc"',
    );
    expect(mail.headers).toEqual({
      'List-Unsubscribe': '<https://example.com/api/lists/unsubscribe?t=abc>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('contains no emoji', () => {
    for (const locale of LOCALES)
      for (const list of [
        { kind: 'new' } as const,
        { kind: 'city', name: 'Tokyo', slug: 'tokyo' } as const,
      ]) {
        const mail = welcomeMail(facts({ locale, list }));
        for (const part of [mail.subject, mail.text, mail.html])
          expect(part).not.toMatch(/\p{Extended_Pictographic}/u);
      }
  });
});
