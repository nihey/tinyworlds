import type { Locale } from '../donations/locales.js';
import { heldBadges, type Held } from '../mail/badges.js';
import { formatUsd, stoneRanges } from '../mail/format.js';
import { fill, fillHtml, markup } from '../mail/html.js';
import {
  buttons,
  facts,
  heading,
  mailto,
  paragraph,
  shell,
} from '../mail/layout.js';
import type { Mail } from '../mail/mailer.js';

/** What the announcement tells one donor about the city they helped build. */
export interface BuiltFacts extends Held {
  /** The language of their latest gift to the city. */
  locale: Locale;
  /** The site's origin (SITE_URL), for every link and picture. */
  site: string;
  /** The world's id: its path, and its share card's name. */
  world: string;
  city: string;
  /** What they gave the city in US cents, and the stones it laid. */
  givenCents: number;
  stones: number[];
  /** Their name shows on the city's list. */
  named: boolean;
  /** The rows of the city's public list. */
  founders: number;
  benefactors: number;
}

interface Words {
  label: string;
  subject: string;
  founderHeading: string;
  benefactorHeading: string;
  text: string;
  gave: string;
  stoneOne: string;
  stoneMany: string;
  builtBy: string;
  foundersOne: string;
  foundersMany: string;
  benefactorsOne: string;
  benefactorsMany: string;
  and: string;
  explore: string;
  share: string;
  shareSubject: string;
  shareBody: string;
  named: string;
  anonymous: string;
  /** For a donor with no gift in dollars, who is on no list. */
  unlisted: string;
  why: string;
  alt: string;
}

const WORDS: Record<Locale, Words> = {
  'en-US': {
    label: 'Now on the map',
    subject: '{city} is built. Come and see it',
    founderHeading: '{city} is on the map, and you built it.',
    benefactorHeading: '{city} is on the map, and you helped keep it running.',
    text: "The city you helped fund is done. It's open to everyone, from today.",
    gave: 'You gave',
    stoneOne: '{amount} · stone {ranges}',
    stoneMany: '{amount} · stones {ranges}',
    builtBy: 'Built by',
    foundersOne: '1 founder',
    foundersMany: '{n} founders',
    benefactorsOne: '1 benefactor',
    benefactorsMany: '{n} benefactors',
    and: '{a} and {b}',
    explore: 'Explore {city}',
    share: 'Share it',
    shareSubject: '{city}, as a pixel-art miniature',
    shareBody:
      '{city} is on tinyworlds now: the whole city as a pixel-art miniature, free to explore street by street.',
    named:
      "Your name and badges are on {city}'s benefactors, in About on its map.",
    anonymous:
      "You're on {city}'s benefactors as “anonymous”, in About on its map.",
    unlisted: "{city}'s benefactors are in About on its map.",
    why: "You're getting this because you donated towards {city}.",
    alt: '{city} on tinyworlds',
  },
  'pt-BR': {
    label: 'Já no mapa',
    subject: '{city} já está no mapa. Venha ver',
    founderHeading: '{city} está no mapa, e foi você quem construiu.',
    benefactorHeading:
      '{city} está no mapa, e você ajuda a manter a cidade funcionando.',
    text: 'A cidade que você ajudou a financiar está pronta. Ela está aberta a todos, a partir de hoje.',
    gave: 'Você deu',
    stoneOne: '{amount} · pedra {ranges}',
    stoneMany: '{amount} · pedras {ranges}',
    builtBy: 'Construída por',
    foundersOne: '1 fundador',
    foundersMany: '{n} fundadores',
    benefactorsOne: '1 benfeitor',
    benefactorsMany: '{n} benfeitores',
    and: '{a} e {b}',
    explore: 'Explorar {city}',
    share: 'Compartilhar',
    shareSubject: '{city}, em miniatura de pixel art',
    shareBody:
      '{city} agora está no tinyworlds: a cidade inteira como uma miniatura em pixel art, para explorar rua por rua, de graça.',
    named:
      'Seu nome e suas insígnias estão entre os benfeitores de {city}, em “Sobre este mapa”.',
    anonymous:
      'Você está entre os benfeitores de {city} como “anônimo”, em “Sobre este mapa”.',
    unlisted: 'Os benfeitores de {city} estão em “Sobre este mapa”.',
    why: 'Você está recebendo isto porque doou para {city}.',
    alt: '{city} no tinyworlds',
  },
  'es-ES': {
    label: 'Ya en el mapa',
    subject: '{city} ya está en el mapa. Ven a verla',
    founderHeading: '{city} está en el mapa, y la construiste tú.',
    benefactorHeading:
      '{city} está en el mapa, y tú ayudas a mantenerla en marcha.',
    text: 'La ciudad que ayudaste a financiar está terminada. Desde hoy está abierta a todos.',
    gave: 'Diste',
    stoneOne: '{amount} · piedra {ranges}',
    stoneMany: '{amount} · piedras {ranges}',
    builtBy: 'La construyeron',
    foundersOne: '1 fundador',
    foundersMany: '{n} fundadores',
    benefactorsOne: '1 benefactor',
    benefactorsMany: '{n} benefactores',
    and: '{a} y {b}',
    explore: 'Explorar {city}',
    share: 'Compartir',
    shareSubject: '{city}, en miniatura de pixel art',
    shareBody:
      '{city} ya está en tinyworlds: la ciudad entera como una miniatura de pixel art, para recorrer calle a calle, gratis.',
    named:
      'Tu nombre y tus insignias están entre los benefactores de {city}, en «Acerca de este mapa».',
    anonymous:
      'Estás entre los benefactores de {city} como «anónimo», en «Acerca de este mapa».',
    unlisted: 'Los benefactores de {city} están en «Acerca de este mapa».',
    why: 'Recibes esto porque donaste para {city}.',
    alt: '{city} en tinyworlds',
  },
};

/** The share card's size in the mail: the card is 1200 × 630. */
const HERO = { width: 560, height: 294 };

/** Who built the city, as the public list counts its rows: "4 founders and 2 benefactors". */
function builtBy(w: Words, founders: number, benefactors: number): string {
  const count = (n: number, one: string, many: string) =>
    n === 1 ? one : fill(many, { n });
  const parts = [
    ...(founders ? [count(founders, w.foundersOne, w.foundersMany)] : []),
    ...(benefactors
      ? [count(benefactors, w.benefactorsOne, w.benefactorsMany)]
      : []),
  ];
  return parts.length === 2
    ? fill(w.and, { a: parts[0], b: parts[1] })
    : (parts[0] ?? '');
}

/**
 * The mail that tells a donor their city is on the map, right after its world is deployed: the
 * world's real share card, their badges, what they gave and who built it with them, and the
 * way in. A founder built it; a benefactor helps keep it running.
 */
export function builtMail(f: BuiltFacts): Omit<Mail, 'to'> {
  const w = WORDS[f.locale];
  const values = { city: f.city };
  const subject = fill(w.subject, values);
  const title = fill(
    f.founderNumber !== null ? w.founderHeading : w.benefactorHeading,
    values,
  );
  const worldUrl = `${f.site}/${f.world}/`;
  const held = heldBadges(f.site, f.locale, f);

  const rows: [string, string][] = [];
  if (f.givenCents > 0) {
    const amount = formatUsd(f.givenCents, f.locale);
    rows.push([
      w.gave,
      f.stones.length
        ? fill(f.stones.length === 1 ? w.stoneOne : w.stoneMany, {
            amount,
            ranges: stoneRanges(f.stones),
          })
        : amount,
    ]);
  }
  const by = builtBy(w, f.founders, f.benefactors);
  if (by) rows.push([w.builtBy, by]);

  const share = mailto(
    fill(w.shareSubject, values),
    `${fill(w.shareBody, values)}\n\n${worldUrl}`,
  );
  // only gifts in dollars are listed: a donor with none is on no list, named or not
  const where =
    f.givenCents === 0 ? w.unlisted : f.named ? w.named : w.anonymous;
  const footer = [fill(where, values), fill(w.why, values)];
  const explore = fill(w.explore, values);

  return {
    subject,
    text:
      [
        title,
        w.text,
        held.text,
        ...rows.map(([label, value]) => `${label}: ${value}`),
        `${explore}: ${worldUrl}`,
        footer.join('\n'),
      ].join('\n\n') + '\n',
    html: shell({
      locale: f.locale,
      title: subject,
      preheader: w.text,
      site: f.site,
      label: w.label,
      hero: {
        src: `${f.site}/${f.world}/og/${f.world}.jpg`,
        alt: fill(w.alt, values),
        ...HERO,
      },
      body: [
        heading(title),
        paragraph(markup(fillHtml(w.text))),
        held.html,
        rows.length ? facts(rows) : '',
        buttons([
          { label: explore, href: worldUrl },
          { label: w.share, href: share, ghost: true },
        ]),
      ].join(''),
      footer,
    }),
  };
}
