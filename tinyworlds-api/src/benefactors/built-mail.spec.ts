import { builtMail, type BuiltFacts } from './built-mail.js';

const SITE = 'https://example.com';

const founder: BuiltFacts = {
  locale: 'en-US',
  site: SITE,
  world: 'tinylax',
  city: 'Los Angeles',
  founderNumber: 1,
  firstStone: true,
  keystone: false,
  givenCents: 1200,
  stones: Array.from({ length: 12 }, (_, i) => i + 1),
  named: true,
  founders: 4,
  benefactors: 2,
};

describe('builtMail', () => {
  it('tells a founder they built the city, with its real share card', () => {
    const { subject, text, html } = builtMail(founder);
    expect(subject).toBe('Los Angeles is built. Come and see it');
    for (const part of [text, html]) {
      expect(part).toContain('Los Angeles is on the map, and you built it.');
      expect(part).toContain('Founder No. 1');
      expect(part).toContain('First Stone');
      expect(part).toContain('US$12 · stones 1–12');
      expect(part).toContain('4 founders and 2 benefactors');
    }
    expect(text).toContain(
      "The city you helped fund is done. It's open to everyone, from today.",
    );
    expect(html).toContain(
      'The city you helped fund is done. It&#39;s open to everyone, from today.',
    );
    expect(html).toContain(
      `src="${SITE}/tinylax/og/tinylax.jpg" width="560" height="294" alt="Los Angeles on tinyworlds"`,
    );
    expect(html).toContain(`src="${SITE}/email/founding.png"`);
    expect(html).toContain(`src="${SITE}/email/first-stone.png"`);
    expect(html).not.toContain('keystone.png');
    expect(html).toContain(`href="${SITE}/tinylax/"`);
    expect(html).toContain('>Explore Los Angeles</a>');
    expect(html).toContain('>Share it</a>');
    expect(text).toContain(`Explore Los Angeles: ${SITE}/tinylax/`);
    expect(html).toContain(
      'Your name and badges are on Los Angeles&#39;s benefactors, in About on its map.<br>You&#39;re getting this because you donated towards Los Angeles.',
    );
  });

  it('tells a benefactor they help keep it running', () => {
    const { text, html } = builtMail({
      ...founder,
      founderNumber: null,
      firstStone: false,
      givenCents: 500,
      stones: [],
      named: false,
      founders: 1,
      benefactors: 1,
    });
    expect(text).toContain(
      'Los Angeles is on the map, and you helped keep it running.',
    );
    expect(text).toContain('Benefactor');
    expect(text).not.toContain('Founder No.');
    expect(text).toContain('You gave: US$5\n');
    expect(text).toContain('Built by: 1 founder and 1 benefactor');
    expect(text).toContain(
      "You're on Los Angeles's benefactors as “anonymous”, in About on its map.",
    );
    expect(html).not.toContain('founding.png');
  });

  it('shares the world, not the front page', () => {
    const { html } = builtMail(founder);
    const share = /href="(mailto:[^"]+)"/.exec(html)?.[1] ?? '';
    const decoded = decodeURIComponent(share.replace(/&amp;/g, '&'));
    expect(decoded).toContain('subject=Los Angeles, as a pixel-art miniature');
    expect(decoded).toContain(`${SITE}/tinylax/`);
  });

  it('leaves out what it does not know: a gift in another currency, an empty list', () => {
    const { text } = builtMail({
      ...founder,
      founderNumber: null,
      givenCents: 0,
      stones: [],
      founders: 0,
      benefactors: 0,
    });
    expect(text).not.toContain('You gave');
    expect(text).not.toContain('Built by');
  });

  it('never lets a city or a name out of its text', () => {
    const { html } = builtMail({ ...founder, city: '<img src=x onerror=1>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
  });

  it('speaks Portuguese and Spanish', () => {
    const pt = builtMail({ ...founder, locale: 'pt-BR' });
    expect(pt.subject).toBe('Los Angeles já está no mapa. Venha ver');
    expect(pt.text).toContain(
      'Los Angeles está no mapa, e foi você quem construiu.',
    );
    expect(pt.text).toContain('Você deu: US$ 12 · pedras 1–12');
    expect(pt.text).toContain('Construída por: 4 fundadores e 2 benfeitores');
    expect(pt.text).toContain('Fundador Nº 1 · Pedra Fundamental');
    expect(pt.html).toContain('<html lang="pt-BR">');

    const es = builtMail({ ...founder, locale: 'es-ES', named: false });
    expect(es.subject).toBe('Los Angeles ya está en el mapa. Ven a verla');
    expect(es.text).toContain(
      'Los Angeles está en el mapa, y la construiste tú.',
    );
    expect(es.text).toContain(`Explorar Los Angeles: ${SITE}/tinylax/`);
    expect(es.text).toContain(
      'Estás entre los benefactores de Los Angeles como «anónimo», en «Acerca de este mapa».',
    );
  });
});
