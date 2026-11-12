import type { Locale } from '../donations/locales.js';
import { escapeHtml, fill, fillHtml, markup } from '../mail/html.js';
import {
  buttons,
  COLORS,
  heading,
  paragraph,
  shell,
  type Button,
} from '../mail/layout.js';
import type { Mail } from '../mail/mailer.js';
import { listHeaders, sightRowsHtml, sightRowsText } from './mail-parts.js';
import type { MailSight } from './sights-catalog.js';

/** A world now on the map, as the mail shows it. */
export interface ListBuiltCity {
  /** The city's name, or the imagined world's: never called "the city" in the mail. */
  name: string;
  slug: string;
  /** The world's id: its path, and its share card's name. */
  world: string;
  /** It has Guess the building. */
  quiz: boolean;
  /** Its famous buildings to show: up to three when it is the only one, one each otherwise. */
  sights: MailSight[];
}

/** What the mail tells one person waiting on a list: the worlds built that they waited for. */
export interface ListBuiltFacts {
  /** The language of their newest membership among the reasons. */
  locale: Locale;
  /** The site's origin (SITE_URL). */
  site: string;
  /** Never empty. */
  cities: ListBuiltCity[];
  /** Why they get it: one city's list, or new cities (several reasons count as new cities). */
  reason: { kind: 'new' } | { kind: 'city'; name: string };
  leaveUrl: string;
  unsubscribeUrl: string;
}

interface Words {
  label: string;
  subjectOne: string;
  subjectMany: string;
  textOne: string;
  textMany: string;
  /** The section's label, by how many buildings it shows. */
  start: [one: string, two: string, three: string];
  see: string;
  explore: string;
  play: string;
  and: string;
  why: string;
  whyNew: string;
  leave: string;
  alt: string;
}

const WORDS: Record<Locale, Words> = {
  'en-US': {
    label: 'Now on the map',
    subjectOne: '{city} is built. Come and see it',
    subjectMany: '{cities} are built. Come and see them',
    textOne:
      'You asked to hear the day it was on the map: it is, from today, open to everyone.',
    textMany:
      'You asked to hear the day they were on the map: they are, from today, open to everyone.',
    start: ['A place to start', 'Two places to start', 'Three places to start'],
    see: 'See it on the map',
    explore: 'Explore {city}',
    play: 'Play Guess the building',
    and: '{a} and {b}',
    why: "You're getting this because you asked to hear when {city} was built.",
    whyNew:
      "You're getting this because you asked to hear when new cities are built.",
    leave: 'Leave this list',
    alt: '{city} on tinyworlds',
  },
  'pt-BR': {
    label: 'Já no mapa',
    subjectOne: '{city} já está no mapa. Venha ver',
    subjectMany: '{cities} já estão no mapa. Venha ver',
    textOne:
      'Você pediu para saber o dia em que chegasse ao mapa: chegou, e a partir de hoje qualquer pessoa pode dar uma volta por lá.',
    textMany:
      'Você pediu para saber o dia em que chegassem ao mapa: chegaram, e a partir de hoje qualquer pessoa pode dar uma volta por lá.',
    start: [
      'Um lugar para começar',
      'Dois lugares para começar',
      'Três lugares para começar',
    ],
    see: 'Ver no mapa',
    explore: 'Explorar {city}',
    play: 'Jogar Adivinhe o prédio',
    and: '{a} e {b}',
    why: 'Você está recebendo isto porque pediu para saber quando {city} entrasse no mapa.',
    whyNew:
      'Você está recebendo isto porque pediu para saber quando novas cidades ficarem prontas.',
    leave: 'Sair desta lista',
    alt: '{city} no tinyworlds',
  },
  'es-ES': {
    label: 'Ya en el mapa',
    subjectOne: '{city} ya está en el mapa. Ven a echar un vistazo',
    subjectMany: '{cities} ya están en el mapa. Ven a echar un vistazo',
    textOne:
      'Pediste saber el día en que llegara al mapa: ya ha llegado, y desde hoy cualquiera puede darse una vuelta por allí.',
    textMany:
      'Pediste saber el día en que llegaran al mapa: ya han llegado, y desde hoy cualquiera puede darse una vuelta por allí.',
    start: [
      'Un lugar por donde empezar',
      'Dos lugares por donde empezar',
      'Tres lugares por donde empezar',
    ],
    see: 'Verlo en el mapa',
    explore: 'Explorar {city}',
    play: 'Jugar a Adivina el edificio',
    and: '{a} y {b}',
    why: 'Recibes esto porque pediste saber cuándo llegaría {city} al mapa.',
    whyNew:
      'Recibes esto porque pediste saber cuándo se construyen nuevas ciudades.',
    leave: 'Salir de esta lista',
    alt: '{city} en tinyworlds',
  },
};

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/** The share card under the band: the card is 1200 × 630. */
const HERO = { width: 560, height: 294 };
/** A share card inside the card's padding, one per world when there are several. */
const CARD = { width: 520, height: 273 };

/** Names as a list: "a", "a and b", "a, b and c". */
function joined(w: Words, names: string[]): string {
  if (names.length < 2) return names[0] ?? '';
  return fill(w.and, {
    a: names.slice(0, -1).join(', '),
    b: names[names.length - 1],
  });
}

const worldUrl = (site: string, world: string): string => `${site}/${world}/`;
const shareCard = (site: string, world: string): string =>
  `${site}/${world}/og/${world}.jpg`;

/** A world's buttons: Explore, and the quiz when it has one (the game is on the same map). */
function worldButtons(w: Words, site: string, city: ListBuiltCity): Button[] {
  const href = worldUrl(site, city.world);
  return [
    { label: fill(w.explore, { city: city.name }), href },
    ...(city.quiz ? [{ label: w.play, href, ghost: true }] : []),
  ];
}

const buttonsText = (list: Button[]): string =>
  list.map((b) => `${b.label}: ${b.href}`).join('\n');

/**
 * The mail the day a world someone waited for is on the map, for the people on its list or on
 * "new cities" who did not give to it (its donors get `builtMail`). One world: its share card,
 * up to three of its famous buildings, Explore and, with a quiz, Guess the building. Several:
 * one mail naming them all, each with its card, one building and its buttons. A world with no
 * buildings has its picture and buttons only, and the words never call it a city.
 */
export function listBuiltMail(f: ListBuiltFacts): Omit<Mail, 'to'> {
  const w = WORDS[f.locale];
  const one = f.cities.length === 1 ? f.cities[0] : null;
  const subject = one
    ? fill(w.subjectOne, { city: one.name })
    : fill(w.subjectMany, {
        cities: joined(
          w,
          f.cities.map((c) => c.name),
        ),
      });
  const title = `${subject}.`;
  const intro = one ? w.textOne : w.textMany;
  const why =
    f.reason.kind === 'city' ? fill(w.why, { city: f.reason.name }) : w.whyNew;
  const leave = markup(
    `${escapeHtml(why)}<br><a href="${escapeHtml(f.leaveUrl)}" style="color:${COLORS.dim};text-decoration:underline;">${escapeHtml(w.leave)}</a>`,
  );

  let body: string;
  let text: string[];
  if (one) {
    // the heading names the world: its buildings need no line saying where they are
    const sights = one.sights
      .slice(0, 3)
      .map((s) => ({ ...s, city: undefined }));
    const start = sights.length ? w.start[sights.length - 1] : '';
    const kick = `<div style="margin:20px 0 4px;font:700 11px/1.3 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${COLORS.dim};">${escapeHtml(start)}</div>`;
    const list = worldButtons(w, f.site, one);
    body =
      (sights.length ? kick + sightRowsHtml(sights, w.see) : '') +
      buttons(list);
    text = [
      ...(sights.length ? [`${start}\n\n${sightRowsText(sights, w.see)}`] : []),
      buttonsText(list),
    ];
  } else {
    // a block per world: its card, one building (which says whose it is) and its buttons
    const blocks = f.cities.map((city) => {
      const sights = city.sights
        .slice(0, 1)
        .map((s) => ({ ...s, city: s.city ?? city.name }));
      const list = worldButtons(w, f.site, city);
      const card = `<a href="${escapeHtml(worldUrl(f.site, city.world))}" style="display:block;text-decoration:none;"><img src="${escapeHtml(shareCard(f.site, city.world))}" width="${CARD.width}" height="${CARD.height}" alt="${escapeHtml(fill(w.alt, { city: city.name }))}" style="display:block;width:100%;max-width:${CARD.width}px;height:auto;border:0;outline:none;border-radius:8px;color:${COLORS.dim};font:14px/1.4 ${FONT};"></a>`;
      return {
        html: `<div style="margin:22px 0 0;padding:20px 0 0;border-top:1px solid ${COLORS.line};">${card}${sightRowsHtml(sights, w.see)}${buttons(list)}</div>`,
        text: [
          ...(sights.length ? [sightRowsText(sights, w.see)] : []),
          buttonsText(list),
        ].join('\n'),
      };
    });
    body = blocks.map((b) => b.html).join('');
    text = blocks.map((b) => b.text);
  }

  return {
    subject,
    text:
      [title, intro, ...text, `${why}\n${w.leave}: ${f.leaveUrl}`].join(
        '\n\n',
      ) + '\n',
    html: shell({
      locale: f.locale,
      title: subject,
      preheader: intro,
      site: f.site,
      label: w.label,
      ...(one
        ? {
            hero: {
              src: shareCard(f.site, one.world),
              alt: fill(w.alt, { city: one.name }),
              ...HERO,
            },
          }
        : {}),
      body: heading(title) + paragraph(markup(fillHtml(intro))) + body,
      footer: [leave],
    }),
    headers: listHeaders(f.unsubscribeUrl),
  };
}
