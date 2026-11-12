import type { Locale } from '../donations/locales.js';
import { fill, fillHtml, markup } from '../mail/html.js';
import { buttons, COLORS, heading, paragraph, shell } from '../mail/layout.js';
import { escapeHtml } from '../mail/html.js';
import type { Mail } from '../mail/mailer.js';
import { listHeaders, sightRowsHtml, sightRowsText } from './mail-parts.js';
import type { MailSight } from './sights-catalog.js';

export interface WelcomeFacts {
  locale: Locale;
  /** The site's origin (SITE_URL). */
  site: string;
  list: { kind: 'new' } | { kind: 'city'; name: string; slug: string };
  sights: MailSight[];
  leaveUrl: string;
  unsubscribeUrl: string;
}

interface Words {
  label: string;
  subject: string;
  subjectNew: string;
  heading: string;
  headingNew: string;
  text: string;
  textNew: string;
  while: string;
  see: string;
  explore: string;
  help: string;
  why: string;
  whyNew: string;
  leave: string;
}

const WORDS: Record<Locale, Words> = {
  'en-US': {
    label: "You're on the list",
    subject: "You're on the list for {city}",
    subjectNew: "You're on the list for new cities",
    heading: "We'll write the day {city} is built.",
    headingNew: "We'll write each time a new city is built.",
    text: "Your email is confirmed. When {city} is on the map, you'll get one email saying so, and that's all this list sends.",
    textNew:
      "Your email is confirmed. Each time a new city is on the map, you'll get one email saying so, and that's all this list sends.",
    while: 'While you wait: three buildings already on the map',
    see: 'See it on the map',
    explore: 'Explore the cities',
    help: 'Help build {city}',
    why: "You're getting this because you asked to hear when {city} is built.",
    whyNew:
      "You're getting this because you asked to hear when new cities are built.",
    leave: 'Leave this list',
  },
  'pt-BR': {
    label: 'Você está na lista',
    subject: 'Você está na lista de {city}',
    subjectNew: 'Você está na lista das novas cidades',
    heading: 'Escreveremos no dia em que {city} ficar pronta.',
    headingNew: 'Escreveremos cada vez que uma nova cidade ficar pronta.',
    text: 'Seu e-mail está confirmado. Quando {city} estiver no mapa, você receberá um e-mail avisando, e é só isso que esta lista envia.',
    textNew:
      'Seu e-mail está confirmado. Cada vez que uma nova cidade estiver no mapa, você receberá um e-mail avisando, e é só isso que esta lista envia.',
    while: 'Enquanto isso: três prédios que já estão no mapa',
    see: 'Ver no mapa',
    explore: 'Explorar as cidades',
    help: 'Ajudar a construir {city}',
    why: 'Você está recebendo isto porque pediu para saber quando {city} ficar pronta.',
    whyNew:
      'Você está recebendo isto porque pediu para saber quando novas cidades ficarem prontas.',
    leave: 'Sair desta lista',
  },
  'es-ES': {
    label: 'Estás en la lista',
    subject: 'Estás en la lista de {city}',
    subjectNew: 'Estás en la lista de las nuevas ciudades',
    heading: 'Te escribiremos el día en que {city} esté construida.',
    headingNew: 'Te escribiremos cada vez que se construya una nueva ciudad.',
    text: 'Tu correo está confirmado. Cuando {city} esté en el mapa, recibirás un correo avisándote, y eso es todo lo que envía esta lista.',
    textNew:
      'Tu correo está confirmado. Cada vez que una nueva ciudad esté en el mapa, recibirás un correo avisándote, y eso es todo lo que envía esta lista.',
    while: 'Mientras esperas: tres edificios que ya están en el mapa',
    see: 'Verlo en el mapa',
    explore: 'Explorar las ciudades',
    help: 'Ayudar a construir {city}',
    why: 'Recibes esto porque pediste que te avisáramos cuando se construyera {city}.',
    whyNew:
      'Recibes esto porque pediste que te avisáramos cuando se construyeran nuevas ciudades.',
    leave: 'Salir de esta lista',
  },
};

/**
 * The mail a visitor gets once their address is confirmed on a list: what the list sends (one
 * mail, the day the city is built), three buildings already on the map, and the way out.
 */
export function welcomeMail(f: WelcomeFacts): Omit<Mail, 'to'> {
  const w = WORDS[f.locale];
  const city = f.list.kind === 'city' ? f.list.name : null;
  const values = { city: city ?? '' };
  const subject = city ? fill(w.subject, values) : w.subjectNew;
  const title = city ? fill(w.heading, values) : w.headingNew;
  const intro = city ? fill(w.text, values) : w.textNew;
  const why = city ? fill(w.why, values) : w.whyNew;
  const explore = `${f.site}/#cities`;
  const help = `${f.site}/#ranking`;
  const helpLabel = fill(w.help, values);

  const text = [
    title,
    intro,
    f.sights.length ? `${w.while}\n\n${sightRowsText(f.sights, w.see)}` : '',
    `${w.explore}: ${explore}`,
    city ? `${helpLabel}: ${help}` : '',
    `${why}\n${w.leave}: ${f.leaveUrl}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const kick = `<div style="margin:20px 0 4px;font:700 11px/1.3 'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${COLORS.dim};">${escapeHtml(w.while)}</div>`;
  const leave = markup(
    `${escapeHtml(why)}<br><a href="${escapeHtml(f.leaveUrl)}" style="color:${COLORS.dim};text-decoration:underline;">${escapeHtml(w.leave)}</a>`,
  );

  return {
    subject,
    text: `${text}\n`,
    html: shell({
      locale: f.locale,
      title: subject,
      preheader: intro,
      site: f.site,
      label: w.label,
      body: [
        heading(title),
        paragraph(markup(fillHtml(city ? w.text : w.textNew, values))),
        f.sights.length ? kick + sightRowsHtml(f.sights, w.see) : '',
        buttons([
          { label: w.explore, href: explore },
          ...(city ? [{ label: helpLabel, href: help, ghost: true }] : []),
        ]),
      ].join(''),
      footer: [leave],
    }),
    headers: listHeaders(f.unsubscribeUrl),
  };
}
