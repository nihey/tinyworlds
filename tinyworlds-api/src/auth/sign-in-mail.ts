import type { Locale } from '../donations/locales.js';
import type { Mail } from './mailer.js';

interface Words {
  subject: string;
  intro: string;
  button: string;
  /** `{minutes}` is how long the link is good for. */
  once: string;
  ignore: string;
}

const WORDS: Record<Locale, Words> = {
  'en-US': {
    subject: 'Your tinyworlds sign-in link',
    intro: 'Open this link to sign in to the tinyworlds admin pages:',
    button: 'Sign in',
    once: 'It works once, for {minutes} minutes.',
    ignore:
      "If you didn't ask for it, ignore this message: nothing happens without the link.",
  },
  'pt-BR': {
    subject: 'Seu link de acesso ao tinyworlds',
    intro: 'Abra este link para entrar na administração do tinyworlds:',
    button: 'Entrar',
    once: 'Ele funciona uma única vez, por {minutes} minutos.',
    ignore:
      'Se você não pediu este link, ignore esta mensagem: nada acontece sem ele.',
  },
  'es-ES': {
    subject: 'Tu enlace de acceso a tinyworlds',
    intro: 'Abre este enlace para entrar en la administración de tinyworlds:',
    button: 'Entrar',
    once: 'Funciona una sola vez, durante {minutes} minutos.',
    ignore:
      'Si no lo has pedido, ignora este mensaje: sin el enlace no pasa nada.',
  },
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** The message that carries a sign-in link, in the language the admin asked in. */
export function signInMail(
  locale: Locale,
  link: string,
  minutes: number,
): Omit<Mail, 'to'> {
  const words = WORDS[locale];
  const once = words.once.replace('{minutes}', String(minutes));
  const href = escapeHtml(link);
  return {
    subject: words.subject,
    text: `${words.intro}\n\n${link}\n\n${once}\n${words.ignore}\n`,
    html: [
      '<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#15171a;max-width:480px">',
      `<p>${escapeHtml(words.intro)}</p>`,
      `<p><a href="${href}" style="display:inline-block;padding:11px 22px;border-radius:999px;background:#f7c21b;color:#1a1503;font-weight:bold;text-decoration:none">${escapeHtml(words.button)}</a></p>`,
      `<p style="word-break:break-all;font-size:13px"><a href="${href}" style="color:#15171a">${href}</a></p>`,
      `<p style="font-size:13px;color:#5a5c5e">${escapeHtml(once)}<br>${escapeHtml(words.ignore)}</p>`,
      '</div>',
    ].join(''),
  };
}
