/**
 * Text made safe for a mail's HTML. Everything that varies in a mail goes through here: city
 * names and display names are typed by donors.
 */
export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Markup that is already safe to put in a mail: escaped text, or tags this module wrote. */
export interface Markup {
  readonly html: string;
}

export const markup = (html: string): Markup => ({ html });

const isMarkup = (value: unknown): value is Markup =>
  typeof value === 'object' && value !== null && 'html' in value;

type Values = Record<string, string | number | Markup>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** A template's `{placeholders}` filled in, as plain text. */
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(PLACEHOLDER, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/**
 * A template's `{placeholders}` filled in, as HTML: the template's own text is escaped, and so
 * is every value that is not already markup.
 */
export function fillHtml(template: string, values: Values = {}): string {
  let out = '';
  let last = 0;
  for (const found of template.matchAll(PLACEHOLDER)) {
    const [whole, key] = found;
    out += escapeHtml(template.slice(last, found.index));
    const value = values[key];
    out +=
      value === undefined
        ? escapeHtml(whole)
        : isMarkup(value)
          ? value.html
          : escapeHtml(String(value));
    last = found.index + whole.length;
  }
  return out + escapeHtml(template.slice(last));
}

/** Text in bold, escaped. */
export const bold = (text: string): Markup =>
  markup(`<b style="font-weight:700">${escapeHtml(text)}</b>`);
