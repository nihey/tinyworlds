/** The longest city name kept, in characters. */
export const CITY_NAME_MAX = 60;

/**
 * What a donor typed, made presentable: control characters out, runs of whitespace collapsed,
 * at most CITY_NAME_MAX characters. Empty when there is nothing left.
 */
export function cleanCityName(text: string | null | undefined): string {
  if (!text) return '';
  const cleaned = text
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return [...cleaned].slice(0, CITY_NAME_MAX).join('').trim();
}

/**
 * What makes two spellings one city: accents, case and punctuation dropped, the rest joined by
 * hyphens. "São Paulo", "sao paulo" and "SAO-PAULO!" are all `sao-paulo`. Letters of any script
 * count as letters, so a name written in kanji keeps a slug of its own. Empty when the text
 * holds no letter or digit.
 */
export function citySlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
