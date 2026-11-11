import type { Locale } from '../donations/locales.js';
import { fill } from './html.js';
import { badge, badges, type BadgeArt } from './layout.js';

/** The badges' names, as the site's own pages name them ("Your cities", a city's benefactors). */
const WORDS: Record<
  Locale,
  {
    founderNo: string;
    firstStone: string;
    keystone: string;
    benefactor: string;
  }
> = {
  'en-US': {
    founderNo: 'Founder No. {n}',
    firstStone: 'First Stone',
    keystone: 'Keystone',
    benefactor: 'Benefactor',
  },
  'pt-BR': {
    founderNo: 'Fundador Nº {n}',
    firstStone: 'Pedra Fundamental',
    keystone: 'Pedra-Chave',
    benefactor: 'Benfeitor',
  },
  'es-ES': {
    founderNo: 'Fundador N.º {n}',
    firstStone: 'Primera Piedra',
    keystone: 'Piedra Clave',
    benefactor: 'Benefactor',
  },
};

/** What a donor holds in one city. */
export interface Held {
  /** Their founding number there (the smallest of their gifts'), or null: a benefactor only. */
  founderNumber: number | null;
  firstStone: boolean;
  keystone: boolean;
}

/**
 * The badges a donor holds in a city: Founder No. n with First Stone and Keystone when they hold
 * them, or Benefactor. As a line of badges, and as words for the plain-text part.
 */
export function heldBadges(
  site: string,
  locale: Locale,
  held: Held,
): { html: string; text: string } {
  const w = WORDS[locale];
  const list: [string, BadgeArt?][] =
    held.founderNumber === null
      ? [[w.benefactor]]
      : [[fill(w.founderNo, { n: held.founderNumber }), 'founding']];
  if (held.founderNumber !== null && held.firstStone)
    list.push([w.firstStone, 'first-stone']);
  if (held.founderNumber !== null && held.keystone)
    list.push([w.keystone, 'keystone']);
  return {
    html: badges(list.map(([label, art]) => badge(site, label, art))),
    text: list.map(([label]) => label).join(' · '),
  };
}
