import type { Locale } from '../donations/locales.js';
import { fill, fillHtml, markup } from '../mail/html.js';
import { buttons, codeBox, heading, paragraph, shell } from '../mail/layout.js';
import type { Mail } from '../mail/mailer.js';
import { formatCode, type Purpose } from './auth.service.js';

interface Words {
  /** `{code}` is the code, as '482 913'. Never changes: people search their mail for it. */
  subject: string;
  /** The line above the code. */
  codeLine: string;
  /** The line above the button. */
  orButton: string;
  /** The line above the link, in the plain-text part. */
  orLink: string;
  /** `{minutes}` is how long the link is good for. */
  once: string;
  ignore: string;
}

const WORDS: Record<Locale, Words> = {
  'en-US': {
    subject: 'Your tinyworlds code: {code}',
    codeLine: 'Type this code on the page you came from:',
    orButton: 'Or skip the typing:',
    orLink: 'Or open this link:',
    once: 'The code and the button work once, for {minutes} minutes. Asked more than once? Use the newest mail.',
    ignore:
      "Didn't ask for this? Ignore it: nothing happens without the code or the button.",
  },
  'pt-BR': {
    subject: 'Seu código do tinyworlds: {code}',
    codeLine: 'Digite este código na página de onde você veio:',
    orButton: 'Ou pule a digitação:',
    orLink: 'Ou abra este link:',
    once: 'O código e o botão funcionam uma única vez, por {minutes} minutos. Pediu mais de uma vez? Use o e-mail mais recente.',
    ignore: 'Não pediu isto? Ignore: nada acontece sem o código ou o botão.',
  },
  'es-ES': {
    subject: 'Tu código de tinyworlds: {code}',
    codeLine: 'Escribe este código en la página de la que vienes:',
    orButton: 'O sáltate el tecleo:',
    orLink: 'O abre este enlace:',
    once: 'El código y el botón funcionan una sola vez, durante {minutes} minutos. ¿Lo pediste más de una vez? Usa el correo más reciente.',
    ignore:
      '¿No lo has pedido? Ignóralo: sin el código o el botón no pasa nada.',
  },
};

/** Who the mail is for: an admin signs in to the admin pages, a donor sees their cities. */
const OPENINGS: Record<
  Purpose,
  Record<Locale, { label: string; heading: string; button: string }>
> = {
  admin: {
    'en-US': {
      label: 'Admin sign-in',
      heading: 'The admin pages are one step away.',
      button: 'Open the admin pages',
    },
    'pt-BR': {
      label: 'Administração',
      heading: 'A administração está a um passo.',
      button: 'Abrir a administração',
    },
    'es-ES': {
      label: 'Administración',
      heading: 'La administración está a un paso.',
      button: 'Abrir la administración',
    },
  },
  donor: {
    'en-US': {
      label: 'Sign in',
      heading: 'Your cities are one step away.',
      button: 'See your cities',
    },
    'pt-BR': {
      label: 'Entrar',
      heading: 'Suas cidades estão a um passo.',
      button: 'Ver suas cidades',
    },
    'es-ES': {
      label: 'Entrar',
      heading: 'Tus ciudades están a un paso.',
      button: 'Ver tus ciudades',
    },
  },
};

export interface SignInMailFacts {
  /** The language it was asked in. */
  locale: Locale;
  /** The page with the token in its hash. */
  link: string;
  /** Six digits. */
  code: string;
  /** How long the link and the code are good for. */
  minutes: number;
  /** Who the mail is for: an admin or a donor. */
  purpose: Purpose;
  /** The site's origin (SITE_URL), for the wordmark. */
  site: string;
}

/**
 * The message that carries a sign-in link and its code, in the language it was asked in. The
 * code comes first, since most people read it off the notification; the button after it.
 */
export function signInMail(facts: SignInMailFacts): Omit<Mail, 'to'> {
  const { locale, link, site } = facts;
  const words = { ...WORDS[locale], ...OPENINGS[facts.purpose][locale] };
  const once = fill(words.once, { minutes: facts.minutes });
  const shown = formatCode(facts.code);
  const subject = fill(words.subject, { code: shown });
  return {
    subject,
    text: [
      words.heading,
      words.codeLine,
      shown,
      words.orLink,
      link,
      once,
      words.ignore,
    ].join('\n\n'),
    html: shell({
      locale,
      title: subject,
      preheader: `${shown} · ${once}`,
      site,
      label: words.label,
      body: [
        heading(words.heading),
        paragraph(markup(fillHtml(words.codeLine))),
        codeBox(shown),
        paragraph(markup(fillHtml(words.orButton))),
        buttons([{ label: words.button, href: link }]),
        paragraph(markup(fillHtml(once)), true),
      ].join(''),
      footer: [words.ignore],
    }),
  };
}
