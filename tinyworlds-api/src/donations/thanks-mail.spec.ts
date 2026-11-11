import type { StoneState } from '../mail/layout.js';
import type { GiftPlace } from './thanks-facts.js';
import { thanksMail, type ThanksFacts } from './thanks-mail.js';

const SITE = 'https://example.com';

/** São Paulo's 30 stones: 2 laid before, the donor's 3–12, the rest to come. */
const founding: GiftPlace = {
  stoneCount: 30,
  goalCents: 3000,
  raisedCents: 1200,
  stones: [
    'laid',
    'laid',
    ...Array<StoneState>(10).fill('mine'),
    ...Array<StoneState>(18).fill(null),
  ],
  founding: true,
  laid: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  founderNumber: 2,
  firstStone: false,
  keystone: false,
  listedAs: 'Ana from Recife',
  onFounders: true,
};

const facts = (over: Partial<ThanksFacts> = {}): ThanksFacts => ({
  locale: 'en-US',
  site: SITE,
  amountCents: 1000,
  inDollars: true,
  city: {
    name: 'São Paulo',
    status: 'PROPOSED',
    worldVisits: null,
    place: founding,
  },
  totalVisits: 16396,
  ...over,
});

const withPlace = (
  place: Partial<GiftPlace> | null,
  city: Partial<NonNullable<ThanksFacts['city']>> = {},
): Partial<ThanksFacts> => ({
  city: {
    name: 'São Paulo',
    status: 'PROPOSED',
    worldVisits: null,
    place: place && { ...founding, ...place },
    ...city,
  },
});

describe('thanksMail', () => {
  it('tells a founding gift its stones, its badge, the bar and the explorers', () => {
    const { subject, text, html } = thanksMail(facts());
    expect(subject).toBe('You laid stones 3–12 of São Paulo');
    for (const part of [text, html]) {
      expect(part).toContain('São Paulo is 10 stones closer, because of you.');
      expect(part).toContain(
        'Your US$10 laid stones 3 to 12 of its 30. When the last one is in, I build it.',
      );
      expect(part).toContain('Founder No. 2');
      expect(part).toContain('US$12 of US$30 · 18 stones to go');
      expect(part).toContain('16,396');
      expect(part).toContain(
        'visits to the cities on tinyworlds so far. Once São Paulo is built, every one of its explorers walks streets you helped lay.',
      );
    }
    expect(html).toContain(`src="${SITE}/email/founding.png"`);
    expect(html).not.toContain('first-stone.png');
    // the grid: 30 stones, 10 of them the donor's
    expect(html.match(/bgcolor="#f7c21b" style="width:22px/g)).toHaveLength(10);
    expect(html).toContain('width="40%"');
    expect(html).toContain('role="img" aria-label="16,396"');
    expect(html).toContain(
      'You&#39;re on São Paulo&#39;s <b style="font-weight:700">Founding Benefactors</b> as <b style="font-weight:700">Ana from Recife</b>. You can change your name or hide it any time.',
    );
    expect(text).toContain(
      "You're on São Paulo's Founding Benefactors as Ana from Recife.",
    );
  });

  it('names a single stone, and the badges the donor holds', () => {
    const { subject, html, text } = thanksMail(
      facts(
        withPlace({
          laid: [1],
          firstStone: true,
          founderNumber: 1,
          stones: ['mine', ...Array<StoneState>(29).fill(null)],
          raisedCents: 100,
        }),
      ),
    );
    expect(subject).toBe('You laid stone 1 of São Paulo');
    expect(text).toContain('São Paulo is one stone closer, because of you.');
    expect(text).toContain('Your US$10 laid stone 1 of its 30.');
    expect(text).toContain('Founder No. 1 · First Stone');
    expect(html).toContain(`src="${SITE}/email/first-stone.png"`);
  });

  it('crowns the gift that lays the last stone', () => {
    const { subject, text, html } = thanksMail(
      facts(
        withPlace({
          laid: [28, 29, 30],
          keystone: true,
          raisedCents: 3000,
          stones: [
            ...Array<StoneState>(27).fill('laid'),
            ...Array<StoneState>(3).fill('mine'),
          ],
        }),
      ),
    );
    expect(subject).toBe('You laid the last stone of São Paulo');
    expect(text).toContain('You laid the last stone: São Paulo is funded.');
    expect(text).toContain('US$30 of US$30 · every stone is laid');
    expect(html).toContain(`src="${SITE}/email/keystone.png"`);
  });

  it('thanks a gift beyond the goal for keeping its city running', () => {
    const funded = thanksMail(
      facts(
        withPlace(
          { founding: false, laid: [], founderNumber: null, onFounders: false },
          { status: 'FUNDED' },
        ),
      ),
    );
    expect(funded.subject).toBe('Thank you for keeping São Paulo running');
    expect(funded.text).toContain(
      'São Paulo is funded, and your gift keeps it running',
    );
    expect(funded.text).toContain('Benefactor');
    expect(funded.text).toContain(
      "You're on São Paulo's Benefactors as Ana from Recife.",
    );
    expect(funded.html).not.toContain('stones to go');

    const built = thanksMail(
      facts(
        withPlace(
          { founding: false, laid: [], founderNumber: null, onFounders: false },
          { name: 'New York', status: 'BUILT', worldVisits: 15194 },
        ),
      ),
    );
    expect(built.subject).toBe('Thank you for keeping New York running');
    expect(built.text).toContain(
      'You keep New York running for its 15,194 explorers',
    );
    expect(built.text).toContain(
      "visits to the cities on tinyworlds so far. Every one of New York's explorers walks streets you keep open.",
    );
  });

  it('says so when the gift is anonymous', () => {
    const { text, html } = thanksMail(facts(withPlace({ listedAs: null })));
    expect(text).toContain(
      "You're anonymous here. Add your name on Your cities.",
    );
    expect(html).not.toContain('Ana from Recife');
  });

  it('sends a gift to no city to the cities to come, without the impact box', () => {
    const { subject, text, html } = thanksMail(facts({ city: null }));
    expect(subject).toBe('Thank you for your gift to tinyworlds');
    expect(text).toContain('Your gift goes to the cities to come.');
    expect(text).not.toContain('visits to the cities');
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('Founding Benefactors');
  });

  it('gives a gift in another currency a plain thank-you, with no stones and no bar', () => {
    const { subject, text, html } = thanksMail(
      facts({ ...withPlace(null), inDollars: false }),
    );
    expect(subject).toBe('Thank you for your gift towards São Paulo');
    expect(text).toContain('Thank you for your gift towards São Paulo.');
    expect(html).not.toContain('style="width:22px');
    expect(html).not.toContain('width="40%"');
    expect(html).not.toContain('founding.png');
    // the explorers are there all the same
    expect(text).toContain('16,396 visits to the cities');
    expect(text).not.toContain('US$');

    const elsewhere = thanksMail(facts({ city: null, inDollars: false }));
    expect(elsewhere.subject).toBe('Thank you for your gift to tinyworlds');
    expect(elsewhere.text).toContain("Your gift isn't tied to one city");
    expect(elsewhere.text).not.toContain('US$');
  });

  it('links to the donor’s cities and lets them tell a friend, from SITE_URL', () => {
    const { text, html } = thanksMail(
      facts({ site: 'https://www.example.com' }),
    );
    expect(html).toContain('href="https://www.example.com/me/"');
    expect(html).toContain('>See your cities</a>');
    expect(html).toContain('>Tell a friend</a>');
    const mailto = /href="(mailto:[^"]+)"/.exec(html)?.[1] ?? '';
    expect(decodeURIComponent(mailto.replace(/&amp;/g, '&'))).toContain(
      'https://www.example.com/',
    );
    expect(html).toContain('src="https://www.example.com/email/wordmark.png"');
    expect(text).toContain('See your cities: https://www.example.com/me/');
    expect(text).toContain('Stripe sends your payment receipt separately.');
    expect(html).toContain(
      'You&#39;re getting this because you donated to tinyworlds with this address.',
    );
  });

  it('never lets a name or a city out of its text', () => {
    const evil = '<script>alert(1)</script>';
    const { html, subject } = thanksMail(
      facts(withPlace({ listedAs: evil }, { name: `${evil}ville` })),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    // the subject is plain text: the mail library encodes it
    expect(subject).toContain(evil);
  });

  it('speaks Portuguese and Spanish', () => {
    const pt = thanksMail(facts({ locale: 'pt-BR' }));
    expect(pt.subject).toBe('Você assentou as pedras 3–12 de São Paulo');
    expect(pt.text).toContain(
      'São Paulo está 10 pedras mais perto, graças a você.',
    );
    expect(pt.text).toContain('US$ 12 de US$ 30 · faltam 18 pedras');
    expect(pt.text).toContain('16.396 visitas às cidades do tinyworlds');
    expect(pt.text).toContain('Fundador Nº 2');
    expect(pt.html).toContain('<html lang="pt-BR">');
    expect(pt.html).toContain('>Ver suas cidades</a>');

    const es = thanksMail(
      facts({ locale: 'es-ES', city: null, amountCents: 2550 }),
    );
    expect(es.subject).toBe('Gracias por tu donación a tinyworlds');
    expect(es.text).toContain('Tu donación va a las ciudades que vendrán.');
    expect(es.text).toContain('Tus 25,50 US$ no van a una sola ciudad');
    expect(es.html).toContain('>Ver tus ciudades</a>');
  });
});
