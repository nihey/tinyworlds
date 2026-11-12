/** The list of "every new city" in the places that name a list by one string. */
export const NEW_CITIES = '*';

/** Which list: the one for new cities, or one city's (by its slug). */
export type ListKey = { kind: 'new' } | { kind: 'city'; slug: string };

/** `'*'`, empty or absent mean new cities; anything else is a city's slug. */
export function listKeyOf(raw: string | null | undefined): ListKey {
  const slug = raw?.trim();
  return !slug || slug === NEW_CITIES
    ? { kind: 'new' }
    : { kind: 'city', slug };
}

/** The key as one string: `'*'` or the slug. */
export const listParam = (key: ListKey): string =>
  key.kind === 'new' ? NEW_CITIES : key.slug;
