import type { Locale } from '../donations/locales.js';

/**
 * US cents the way the mail's language writes dollars: "US$10", "US$ 10", "10 US$". Whole
 * dollars have no decimals, and anything else keeps its cents: a mail says what was given.
 */
export function formatUsd(cents: number, locale: Locale): string {
  const whole = cents % 100 === 0;
  const text = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
  // American English writes a bare "$", which reads as any dollar abroad
  return locale === 'en-US' ? text.replace(/^\$/, 'US$') : text;
}

/** A count the way the mail's language groups its digits: "16,396", "16.396". */
export const formatCount = (n: number, locale: Locale): string =>
  new Intl.NumberFormat(locale).format(n);

/** Stone numbers as runs: [1, 2, 3, 7] gives "1–3, 7". */
export function stoneRanges(stones: number[]): string {
  const sorted = [...new Set(stones)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    out.push(j > i ? `${sorted[i]}–${sorted[j]}` : `${sorted[i]}`);
    i = j + 1;
  }
  return out.join(', ');
}
