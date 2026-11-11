import type { Locale } from '../donations/locales.js';
import { formatCode, type Purpose } from './auth.service.js';
import type { Mail } from './mailer.js';

interface Words {
  /** `{code}` is the code, as '482 913'. */
  subject: string;
  /** The line above the code. */
  codeLine: string;
  /** `{minutes}` is how long the link is good for. */
  once: string;
  ignore: string;
}

const WORDS: Record<Locale, Words> = {
  'en-US': {
    subject: 'Your tinyworlds code: {code}',
    codeLine: 'Or type this code on the page:',
    once: 'Both work once, for {minutes} minutes.',
    ignore:
      "If you didn't ask for it, ignore this message: nothing happens without the link.",
  },
  'pt-BR': {
    subject: 'Seu código do tinyworlds: {code}',
    codeLine: 'Ou digite este código na página:',
    once: 'Os dois funcionam uma única vez, por {minutes} minutos.',
    ignore:
      'Se você não pediu este link, ignore esta mensagem: nada acontece sem ele.',
  },
  'es-ES': {
    subject: 'Tu código de tinyworlds: {code}',
    codeLine: 'O escribe este código en la página:',
    once: 'Los dos funcionan una sola vez, durante {minutes} minutos.',
    ignore:
      'Si no lo has pedido, ignora este mensaje: sin el enlace no pasa nada.',
  },
};

/** What the mail is for, and the words on its button: an admin signs in, a donor sees their cities. */
const OPENINGS: Record<
  Purpose,
  Record<Locale, { intro: string; button: string }>
> = {
  admin: {
    'en-US': {
      intro: 'Open this link to sign in to the tinyworlds admin pages:',
      button: 'Sign in',
    },
    'pt-BR': {
      intro: 'Abra este link para entrar na administração do tinyworlds:',
      button: 'Entrar',
    },
    'es-ES': {
      intro: 'Abre este enlace para entrar en la administración de tinyworlds:',
      button: 'Entrar',
    },
  },
  donor: {
    'en-US': {
      intro: "Here's how to see the cities you helped build.",
      button: 'See your cities',
    },
    'pt-BR': {
      intro: 'Veja aqui as cidades que você ajudou a construir.',
      button: 'Ver suas cidades',
    },
    'es-ES': {
      intro: 'Así puedes ver las ciudades que ayudaste a construir.',
      button: 'Ver tus ciudades',
    },
  },
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The message that carries a sign-in link, in the language it was asked in. */
export function signInMail(
  locale: Locale,
  link: string,
  code: string,
  minutes: number,
  /** Who the mail is for: an admin or a donor. */
  purpose: Purpose,
): Omit<Mail, 'to'> {
  const words = { ...WORDS[locale], ...OPENINGS[purpose][locale] };
  const once = words.once.replace('{minutes}', String(minutes));
  const href = escapeHtml(link);
  const shown = formatCode(code);
  return {
    subject: words.subject.replace('{code}', shown),
    text: `${words.intro}\n\n${link}\n\n${words.codeLine}\n\n${shown}\n\n${once}\n${words.ignore}\n`,
    html: [
      '<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#15171a;max-width:480px">',
      '<p style="font-size:18px;font-weight:bold;color:#15171a;margin:0 0 12px">tinyworlds</p>',
      `<p>${escapeHtml(words.intro)}</p>`,
      `<p><a href="${href}" style="display:inline-block;padding:11px 22px;border-radius:999px;background:#f7c21b;color:#1a1503;font-weight:bold;text-decoration:none">${escapeHtml(words.button)}</a></p>`,
      `<p style="word-break:break-all;font-size:13px"><a href="${href}" style="color:#15171a">${href}</a></p>`,
      `<p>${escapeHtml(words.codeLine)}</p>`,
      `<p style="font-family:Menlo,Consolas,monospace;font-size:32px;letter-spacing:4px;font-weight:bold;color:#15171a">${shown}</p>`,
      `<p style="font-size:13px;color:#5a5c5e">${escapeHtml(once)}<br>${escapeHtml(words.ignore)}</p>`,
      '</div>',
    ].join(''),
  };
}
