import { isPublicUrl } from './link-url.js';

/** The longest title and description kept, in code points. */
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 200;

/** How many icons are worth asking for before giving up on one. */
export const ICONS_MAX = 4;

/** The longest `data:` icon kept as a candidate, in characters. */
const DATA_ICON_MAX = 100_000;

/** What a page says of itself, as far as a link's card shows it. */
export interface PageMeta {
  title: string | null;
  description: string | null;
  /** Its picture (og:image, else twitter:image): an absolute https URL. */
  picture: string | null;
  /** Its icons, the most promising first: https URLs, or `data:` URLs as the page wrote them. */
  icons: string[];
}

// The Latin-1 names in the order of their code points, from U+00A0: pages in Portuguese and
// Spanish still write "S&atilde;o Paulo".
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml';

const NAMED = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['ndash', '–'],
  ['mdash', '—'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['sbquo', '‚'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['bdquo', '„'],
  ['bull', '•'],
  ['hellip', '…'],
  ['euro', '€'],
  ['trade', '™'],
  ['larr', '←'],
  ['rarr', '→'],
  ['hearts', '♥'],
  ...LATIN1.split(' ').map((name, i): [string, string] => [
    name,
    String.fromCodePoint(0xa0 + i),
  ]),
]);

/** `&amp;`, `&#233;`, `&#xe9;` and the common names, as the characters they stand for. */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,30});/g,
    (whole: string, body: string) => {
      if (body.startsWith('#')) {
        const hex = body[1] === 'x' || body[1] === 'X';
        const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
        const valid =
          code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
        return valid ? String.fromCodePoint(code) : whole;
      }
      return NAMED.get(body) ?? whole;
    },
  );
}

/**
 * A page's words made fit to show: NFC, control and invisible characters out, whitespace
 * collapsed, cut at `max` code points with an ellipsis. Null when nothing is left.
 */
export function cleanText(raw: string, max: number): string | null {
  const text = raw
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!text) return null;
  const points = Array.from(text);
  return points.length <= max
    ? text
    : `${points
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}

/** The bytes of a page as text: in the charset its header or its own `<meta>` names, else UTF-8. */
export function decodeHtml(body: Buffer, contentType: string | null): string {
  const fromHeader = /charset\s*=\s*"?\s*([\w-]+)/i.exec(
    contentType ?? '',
  )?.[1];
  const head = body.subarray(0, 2048).toString('latin1');
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i.exec(head)?.[1];
  for (const label of [fromHeader, fromMeta]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(body);
    } catch {
      // a charset nobody knows: the next guess
    }
  }
  return new TextDecoder('utf-8').decode(body);
}

interface Tag {
  name: string;
  attrs: Map<string, string>;
  /** For `<title>`: what stands between it and its end. */
  text?: string;
}

const SPACE = /\s/;

/**
 * The tags of a page's head, one by one: comments, scripts and styles are stepped over, and
 * the walk ends where the body begins. Not a parser of HTML: enough of one to read `<meta>`,
 * `<link>`, `<title>` and `<base>` whatever stands in their quoted values.
 */
function* headTags(html: string): Generator<Tag> {
  const n = html.length;
  // for finding an end tag whatever its case
  const lowered = html.toLowerCase();
  let i = 0;
  while (i < n) {
    const open = html.indexOf('<', i);
    if (open === -1) return;
    if (html.startsWith('<!--', open)) {
      const close = html.indexOf('-->', open + 4);
      if (close === -1) return;
      i = close + 3;
      continue;
    }
    const named = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(
      html.slice(open, open + 40),
    );
    if (!named) {
      i = open + 1;
      continue;
    }
    const name = named[1].toLowerCase();
    if (name === 'body') return;
    i = open + named[0].length;
    const attrs = new Map<string, string>();
    while (i < n && html[i] !== '>') {
      if (SPACE.test(html[i]) || html[i] === '/') {
        i++;
        continue;
      }
      let start = i;
      while (i < n && !SPACE.test(html[i]) && !'=>/'.includes(html[i])) i++;
      const attr = html.slice(start, i).toLowerCase();
      while (i < n && SPACE.test(html[i])) i++;
      let value = '';
      if (html[i] === '=') {
        i++;
        while (i < n && SPACE.test(html[i])) i++;
        const quote = html[i];
        if (quote === '"' || quote === "'") {
          const close = html.indexOf(quote, i + 1);
          const end = close === -1 ? n : close;
          value = html.slice(i + 1, end);
          i = end + 1;
        } else {
          start = i;
          while (i < n && !SPACE.test(html[i]) && html[i] !== '>') i++;
          value = html.slice(start, i);
        }
      }
      if (attr && !attrs.has(attr)) attrs.set(attr, decodeEntities(value));
    }
    i++;
    if (name === 'script' || name === 'style' || name === 'title') {
      const close = lowered.indexOf(`</${name}`, i);
      const end = close === -1 ? n : close;
      if (name === 'title')
        yield { name, attrs, text: decodeEntities(html.slice(i, end)) };
      i = end;
      continue;
    }
    yield { name, attrs };
  }
}

/** An address a page gave, as one that may be asked for: https, public. Null otherwise. */
function publicUrl(href: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(href.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  url.hash = '';
  return isPublicUrl(url) ? url.href : null;
}

interface IconCandidate {
  href: string;
  /** The largest side its `sizes` names; 0 when it does not say. */
  size: number;
  ico: boolean;
}

/** The most promising first: 64 px or more (the smallest of those), then the largest below, then the unknown, `.ico` last. */
function iconOrder(icon: IconCandidate): [number, number] {
  if (icon.size >= 64) return [0, icon.size];
  if (icon.size > 0) return [1, -icon.size];
  return [icon.ico ? 3 : 2, 0];
}

/**
 * Reads what a page's head says of the page: its title and description (Open Graph's first,
 * then Twitter's, then the page's own), its picture and its icons. Addresses are made
 * absolute against the page's (or its `<base>`), and only public https ones are kept.
 */
export function readPageMeta(html: string, pageUrl: string): PageMeta {
  const meta = new Map<string, string>();
  const icons: IconCandidate[] = [];
  let title: string | null = null;
  let base = pageUrl;

  for (const tag of headTags(html)) {
    if (tag.name === 'title') {
      title ??= tag.text ?? null;
    } else if (tag.name === 'base') {
      const href = tag.attrs.get('href');
      if (href) base = publicUrl(href, pageUrl) ?? base;
    } else if (tag.name === 'meta') {
      const key = (
        tag.attrs.get('property') ??
        tag.attrs.get('name') ??
        ''
      ).toLowerCase();
      const content = tag.attrs.get('content');
      if (key && content && !meta.has(key)) meta.set(key, content);
    } else if (tag.name === 'link') {
      const rel = (tag.attrs.get('rel') ?? '').toLowerCase().split(/\s+/);
      const href = tag.attrs.get('href')?.trim();
      const apple = rel.some((r) => r.startsWith('apple-touch-icon'));
      if (!href || !(rel.includes('icon') || apple)) continue;
      const type = (tag.attrs.get('type') ?? '').toLowerCase();
      const sizes = (tag.attrs.get('sizes') ?? '').toLowerCase();
      const svg = type.includes('svg') || /\.svg(\?|$)/i.test(href);
      const named = Math.max(
        0,
        ...[...sizes.matchAll(/(\d+)x(\d+)/g)].map((m) => Number(m[1])),
      );
      icons.push({
        href,
        // a drawing is sharp at any size; an apple-touch-icon is 180 px unless it says
        size: svg || sizes === 'any' ? 65 : named || (apple ? 180 : 0),
        ico: type.includes('icon') || /\.ico(\?|$)/i.test(href),
      });
    }
  }

  const first = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = meta.get(key);
      if (value?.trim()) return value;
    }
    return null;
  };
  const pictureHref = first(
    'og:image:secure_url',
    'og:image',
    'og:image:url',
    'twitter:image',
    'twitter:image:src',
  );

  const found: string[] = [];
  const order = (a: IconCandidate, b: IconCandidate): number => {
    const [ga, oa] = iconOrder(a);
    const [gb, ob] = iconOrder(b);
    return ga - gb || oa - ob;
  };
  for (const icon of [...icons].sort(order)) {
    const url = icon.href.startsWith('data:image/')
      ? icon.href.length <= DATA_ICON_MAX
        ? icon.href
        : null
      : publicUrl(icon.href, base);
    if (url && !found.includes(url)) found.push(url);
  }
  // what every browser asks for when a page names no icon
  const fallback = publicUrl('/favicon.ico', pageUrl);
  if (fallback && !found.includes(fallback)) found.push(fallback);

  return {
    title: cleanText(
      first('og:title', 'twitter:title') ?? title ?? '',
      TITLE_MAX,
    ),
    description: cleanText(
      first('og:description', 'twitter:description', 'description') ?? '',
      DESCRIPTION_MAX,
    ),
    picture: pictureHref ? publicUrl(pictureHref, base) : null,
    icons: found.slice(0, ICONS_MAX),
  };
}
