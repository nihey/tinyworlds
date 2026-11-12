import type { Locale } from '../donations/locales.js';
import { formatUsd } from '../mail/format.js';
import { fill, fillHtml, markup, type Markup } from '../mail/html.js';
import { buttons, heading, link, paragraph, shell } from '../mail/layout.js';
import type { Mail } from '../mail/mailer.js';

/** A city the donor gave to, as its hall of fame shows them. */
export interface HallCity {
  slug: string;
  name: string;
  /** Their name shows there (a listed gift, a name, not hidden); else they are "Anonymous". */
  named: boolean;
}

/** What the mail tells one donor about their place in the hall of fame. */
export interface HallFacts {
  /** The language of their latest gift. */
  locale: Locale;
  /** The site's origin (SITE_URL), for every link and picture. */
  site: string;
  /** Every city they gave to that the site shows, the one they gave most to first. Never empty. */
  cities: HallCity[];
  /** The name they show under, where they are named; null without one. */
  name: string | null;
  /** Everything they have given, in US cents, and what shows a link's picture. */
  givenCents: number;
  picturesFromCents: number;
  /** How many links they have put up, and how many they may. */
  links: number;
  linksMax: number;
}

/**
 * A city's hall of fame, as the site addresses it (tinyworlds-frontend `hallCityUrl`): a page of
 * its own for a plain slug, and a question to the hall of fame for any other.
 */
export const hallCityUrl = (site: string, slug: string): string =>
  /^[a-z0-9-]+$/.test(slug)
    ? `${site}/hall-of-fame/${slug}/`
    : `${site}/hall-of-fame/?city=${encodeURIComponent(slug)}`;

interface Words {
  label: string;
  subjectOne: string;
  subjectMany: string;
  headingOne: string;
  headingMany: string;
  text: string;
  /** Beside a city: how the donor is shown there. */
  asName: string;
  asAnonymous: string;
  /** What links are, for someone with none, and for someone who has some. */
  links: string;
  linksUp: string;
  /** Links go with a name: for a donor who is named nowhere. */
  needsName: string;
  picturesOn: string;
  picturesOff: string;
  seeCity: string;
  seeAll: string;
  add: string;
  why: string;
  alt: string;
}

const WORDS: Record<Locale, Words> = {
  'en-US': {
    label: 'Hall of Fame',
    subjectOne: "You're in {city}'s Hall of Fame",
    subjectMany: "You're in the tinyworlds Hall of Fame",
    headingOne: "You're in {city}'s Hall of Fame.",
    headingMany: "You're in the Hall of Fame of {n} cities.",
    text: 'Every city on tinyworlds now has a Hall of Fame: a page for the people who funded it. You are one of them, so you are on it, and on the Hall of Fame of all the cities together.',
    asName: 'as {name}',
    asAnonymous: 'as “Anonymous”',
    links:
      'You can put up to {max} links beside your name: your site, your shop, your profile. They are dofollow links: marked “dofollow”, never “nofollow”, so search engines follow them. Each is shown with its title and icon.',
    linksUp:
      'Your links are up beside your name. They are dofollow links: marked “dofollow”, never “nofollow”, so search engines follow them.',
    needsName:
      'Links go where your name goes, and for now you are listed as “Anonymous”: turn your name on for a city on Your cities first.',
    picturesOn:
      'You have given {from} or more, so your links show their pictures too.',
    picturesOff:
      'From {from} given in all, links show their pictures too. You have given {given} so far.',
    seeCity: "See {city}'s Hall of Fame",
    seeAll: 'See the Hall of Fame',
    add: 'Add your links',
    why: "You're getting this once, because you donated to tinyworlds.",
    alt: 'Cities of tinyworlds, side by side',
  },
  'pt-BR': {
    label: 'Hall da Fama',
    subjectOne: 'Você está no Hall da Fama de {city}',
    subjectMany: 'Você está no Hall da Fama do tinyworlds',
    headingOne: 'Você está no Hall da Fama de {city}.',
    headingMany: 'Você está no Hall da Fama de {n} cidades.',
    text: 'Cada cidade do tinyworlds agora tem um Hall da Fama: uma página para as pessoas que a financiaram. Você é uma delas, então está lá, e também no Hall da Fama de todas as cidades juntas.',
    asName: 'como {name}',
    asAnonymous: 'como “Anônimo”',
    links:
      'Você pode colocar até {max} links ao lado do seu nome: seu site, sua loja, seu perfil. São links dofollow: marcados como “dofollow”, nunca “nofollow”, para que os buscadores os sigam. Cada um aparece com seu título e seu ícone.',
    linksUp:
      'Seus links já estão ao lado do seu nome. São links dofollow: marcados como “dofollow”, nunca “nofollow”, para que os buscadores os sigam.',
    needsName:
      'Os links aparecem onde o seu nome aparece, e por enquanto você está na lista como “Anônimo”: ative antes o seu nome em uma cidade, em Suas cidades.',
    picturesOn:
      'Você doou {from} ou mais, então seus links mostram também as imagens.',
    picturesOff:
      'A partir de {from} doados no total, os links mostram também as imagens. Você doou {given} até agora.',
    seeCity: 'Ver o Hall da Fama de {city}',
    seeAll: 'Ver o Hall da Fama',
    add: 'Adicionar seus links',
    why: 'Você está recebendo isto uma única vez, porque doou para o tinyworlds.',
    alt: 'Cidades do tinyworlds, lado a lado',
  },
  'es-ES': {
    label: 'Salón de la Fama',
    subjectOne: 'Estás en el Salón de la Fama de {city}',
    subjectMany: 'Estás en el Salón de la Fama de tinyworlds',
    headingOne: 'Estás en el Salón de la Fama de {city}.',
    headingMany: 'Estás en el Salón de la Fama de {n} ciudades.',
    text: 'Cada ciudad de tinyworlds tiene ahora un Salón de la Fama: una página para las personas que la financiaron. Tú eres una de ellas, así que estás en él, y también en el Salón de la Fama de todas las ciudades juntas.',
    asName: 'como {name}',
    asAnonymous: 'como «Anónimo»',
    links:
      'Puedes poner hasta {max} enlaces junto a tu nombre: tu web, tu tienda, tu perfil. Son enlaces dofollow: marcados como «dofollow», nunca «nofollow», para que los buscadores los sigan. Cada uno aparece con su título y su icono.',
    linksUp:
      'Tus enlaces ya están junto a tu nombre. Son enlaces dofollow: marcados como «dofollow», nunca «nofollow», para que los buscadores los sigan.',
    needsName:
      'Los enlaces aparecen donde aparece tu nombre, y por ahora figuras como «Anónimo»: activa antes tu nombre en una ciudad, en Tus ciudades.',
    picturesOn:
      'Has donado {from} o más, así que tus enlaces muestran también sus imágenes.',
    picturesOff:
      'A partir de {from} donados en total, los enlaces muestran también sus imágenes. Hasta ahora has donado {given}.',
    seeCity: 'Ver el Salón de la Fama de {city}',
    seeAll: 'Ver el Salón de la Fama',
    add: 'Añadir tus enlaces',
    why: 'Recibes esto una sola vez, porque donaste a tinyworlds.',
    alt: 'Ciudades de tinyworlds, una al lado de otra',
  },
};

/** The front page's share card in the mail: the card is 1200 × 630. */
const HERO = { width: 560, height: 294 };

/** How many cities the mail lists by name; a donor of more is told the rest are in the hall. */
export const CITIES_LISTED = 8;

/**
 * The mail that tells a donor they are in the hall of fame: which cities' halls they are in and
 * how they are shown there, the way to each, and that they can put links beside their name
 * (dofollow links, which search engines follow), with what decides whether the pictures show.
 * It goes out once per donor (`hall-announce.ts`).
 */
export function hallMail(f: HallFacts): Omit<Mail, 'to'> {
  const w = WORDS[f.locale];
  const [first] = f.cities;
  const one = f.cities.length === 1;
  const subject = one
    ? fill(w.subjectOne, { city: first.name })
    : w.subjectMany;
  const title = one
    ? fill(w.headingOne, { city: first.name })
    : fill(w.headingMany, { n: f.cities.length });
  const hall = `${f.site}/hall-of-fame/`;
  const me = `${f.site}/me/`;
  const named = f.name !== null && f.cities.some((city) => city.named);
  const shownAs = (city: HallCity): string =>
    city.named && f.name !== null
      ? fill(w.asName, { name: f.name })
      : w.asAnonymous;
  const listed = f.cities.slice(0, CITIES_LISTED);

  const from = formatUsd(f.picturesFromCents, f.locale);
  // what links are is said to everyone; someone named nowhere is told what comes first
  const about = [
    f.links > 0 && named ? w.linksUp : fill(w.links, { max: f.linksMax }),
    ...(named ? [] : [w.needsName]),
  ];
  const pictures =
    f.givenCents >= f.picturesFromCents
      ? fill(w.picturesOn, { from })
      : fill(w.picturesOff, { from, given: formatUsd(f.givenCents, f.locale) });

  // each city is a link to its hall; the button leads to the one city's, or to all of them
  const see = one
    ? {
        label: fill(w.seeCity, { city: first.name }),
        href: hallCityUrl(f.site, first.slug),
      }
    : { label: w.seeAll, href: hall };
  const cityLinks: Markup = markup(
    listed
      .map(
        (city) =>
          `${link(city.name, hallCityUrl(f.site, city.slug)).html} ${fillHtml(shownAs(city))}`,
      )
      .join('<br>'),
  );
  const footer = [w.why];

  return {
    subject,
    text:
      [
        title,
        w.text,
        ...listed.map(
          (city) =>
            `${city.name} ${shownAs(city)}: ${hallCityUrl(f.site, city.slug)}`,
        ),
        ...(one ? [] : [`${w.seeAll}: ${hall}`]),
        ...about,
        pictures,
        `${w.add}: ${me}`,
        footer.join('\n'),
      ].join('\n\n') + '\n',
    html: shell({
      locale: f.locale,
      title: subject,
      preheader: w.text,
      site: f.site,
      label: w.label,
      hero: { src: `${f.site}/og/tinyworlds.jpg`, alt: w.alt, ...HERO },
      body: [
        heading(title),
        paragraph(markup(fillHtml(w.text))),
        paragraph(cityLinks),
        ...about.map((line) => paragraph(markup(fillHtml(line)))),
        paragraph(markup(fillHtml(pictures)), true),
        buttons([see, { label: w.add, href: me, ghost: true }]),
      ].join(''),
      footer,
    }),
  };
}
