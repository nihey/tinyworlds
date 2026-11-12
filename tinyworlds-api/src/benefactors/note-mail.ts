import type { Env } from '../config/env.js';
import type { Locale } from '../donations/locales.js';
import { bold, escapeHtml, fill, fillHtml, markup } from '../mail/html.js';
import { buttons, heading, link, paragraph, shell } from '../mail/layout.js';
import type { Mail } from '../mail/mailer.js';

/**
 * The site's owner, as their note names them. None of it is in a tracked file: it is the
 * API's environment (OWNER_NAME, OWNER_MAIL_FROM, OWNER_WHATSAPP).
 */
export interface Owner {
  /** How they sign: "Robin". */
  name: string;
  /** Who the note is from: "Robin from tinyworlds <robin@example.com>". */
  from: string;
  /** Their WhatsApp number as they write it, country code first: "+1 555 010-0199". */
  whatsapp: string;
}

const OWNER_SETTINGS = [
  'OWNER_NAME',
  'OWNER_MAIL_FROM',
  'OWNER_WHATSAPP',
] as const;

/**
 * The owner the environment names, and which of their settings it lacks: there is an owner,
 * and so a note, only with all three.
 */
export function ownerOf(env: Pick<Env, (typeof OWNER_SETTINGS)[number]>): {
  owner: Owner | null;
  missing: string[];
} {
  const {
    OWNER_NAME: name,
    OWNER_MAIL_FROM: from,
    OWNER_WHATSAPP: whatsapp,
  } = env;
  return {
    owner: name && from && whatsapp ? { name, from, whatsapp } : null,
    missing: OWNER_SETTINGS.filter((setting) => !env[setting]),
  };
}

/** What the owner's note to one donor is made from. */
export interface NoteFacts {
  locale: Locale;
  /** The site's origin, for the wordmark. */
  site: string;
  owner: Owner;
  /** The cities the donor gave to, as the site names them: at least one. */
  cities: string[];
  /** How the donor is named; null for one who gave no name. */
  name: string | null;
}

interface Words {
  subjectOne: string;
  subjectMany: string;
  label: string;
  hello: string;
  helloPlain: string;
  thanks: string;
  why: string;
  tell: string;
  bye: string;
  button: string;
  footer: string;
}

const WORDS: Record<Locale, Words> = {
  'en-US': {
    subjectOne: 'Thank you for helping build {city}',
    subjectMany: 'Thank you for backing tinyworlds',
    label: 'A note from {owner}',
    hello: 'Hi {name},',
    helloPlain: 'Hi,',
    thanks:
      "I'm {owner}, the person behind tinyworlds. I wanted to thank you myself for what you gave to {cities}.",
    why: 'Gifts like yours decide which city gets built next, and they keep the cities already on the map online. Thank you for being part of it.',
    tell: "If there is anything you'd like to tell me, an idea, a city you'd love to see, something that looks wrong on a map, send me a message on WhatsApp: {whatsapp}.",
    bye: 'Thank you,',
    button: 'Message me on WhatsApp',
    footer: "You're getting this once, because you donated to tinyworlds.",
  },
  // the owner is not said to be a man or a woman: no "obrigado" or "obrigada"
  'pt-BR': {
    subjectOne: 'Um agradecimento por ajudar a construir {city}',
    subjectMany: 'Um agradecimento por apoiar o tinyworlds',
    label: 'Um recado de {owner}',
    hello: 'Olá, {name},',
    helloPlain: 'Olá,',
    thanks:
      'Sou {owner}, a pessoa por trás do tinyworlds. Quis agradecer pessoalmente pelo que você doou para {cities}.',
    why: 'Doações como a sua decidem qual cidade é construída em seguida e mantêm no ar as cidades que já estão no mapa. Agradeço por fazer parte disso.',
    tell: 'Se quiser me contar alguma coisa, uma ideia, uma cidade que você adoraria ver, algo que parece errado em um mapa, me mande uma mensagem no WhatsApp: {whatsapp}.',
    bye: 'Um abraço,',
    button: 'Falar comigo no WhatsApp',
    footer:
      'Você está recebendo isto uma única vez, porque doou para o tinyworlds.',
  },
  'es-ES': {
    subjectOne: 'Gracias por ayudar a construir {city}',
    subjectMany: 'Gracias por apoyar tinyworlds',
    label: 'Una nota de {owner}',
    hello: 'Hola, {name}:',
    helloPlain: 'Hola:',
    thanks:
      'Soy {owner}, la persona detrás de tinyworlds. Quería darte las gracias personalmente por lo que has donado a {cities}.',
    why: 'Donaciones como la tuya deciden qué ciudad se construye después y mantienen en línea las que ya están en el mapa. Gracias por formar parte de esto.',
    tell: 'Si quieres contarme algo, una idea, una ciudad que te encantaría ver, algo que se ve mal en un mapa, escríbeme por WhatsApp: {whatsapp}.',
    bye: 'Gracias,',
    button: 'Escríbeme por WhatsApp',
    footer: 'Recibes esto una sola vez, porque donaste a tinyworlds.',
  },
};

/** A chat with a WhatsApp number: its digits, country code first. */
export const whatsappChat = (number: string): string =>
  `https://wa.me/${number.replace(/\D/g, '')}`;

/**
 * The owner's own thank-you to a donor: who writes, thanks for the cities the donor gave to,
 * what gifts do, and the owner's WhatsApp for whatever the donor wants to say. It is from the
 * owner (`from`), not from the site, in the site's look, and goes out once per donor
 * (`note-announce.ts`).
 */
export function noteMail(f: NoteFacts): Omit<Mail, 'to'> {
  const w = WORDS[f.locale];
  const owner = f.owner.name;
  const chat = whatsappChat(f.owner.whatsapp);
  const subject =
    f.cities.length === 1
      ? fill(w.subjectOne, { city: f.cities[0] })
      : w.subjectMany;
  const hello =
    f.name === null ? w.helloPlain : fill(w.hello, { name: f.name });
  const cities = new Intl.ListFormat(f.locale, {
    style: 'long',
    type: 'conjunction',
  }).format(f.cities);
  const thanks = fill(w.thanks, { owner, cities });

  return {
    from: f.owner.from,
    subject,
    text:
      [
        hello,
        thanks,
        w.why,
        fill(w.tell, { whatsapp: `${f.owner.whatsapp} (${chat})` }),
        `${w.bye}\n${owner}`,
        w.footer,
      ].join('\n\n') + '\n',
    html: shell({
      locale: f.locale,
      title: subject,
      preheader: thanks,
      site: f.site,
      label: fill(w.label, { owner }),
      body: [
        heading(hello),
        paragraph(markup(escapeHtml(thanks))),
        paragraph(markup(escapeHtml(w.why))),
        paragraph(
          markup(fillHtml(w.tell, { whatsapp: link(f.owner.whatsapp, chat) })),
        ),
        paragraph(markup(`${escapeHtml(w.bye)}<br>${bold(owner).html}`)),
        buttons([{ label: w.button, href: chat }]),
      ].join(''),
      footer: [w.footer],
    }),
  };
}
