/** The longest link kept, in characters. */
export const URL_MAX = 300;

/** Last labels no public page lives under: private networks' own, and the reserved ones. */
const PRIVATE_SUFFIXES = new Set([
  'localhost',
  'local',
  'localdomain',
  'internal',
  'intranet',
  'lan',
  'home',
  'corp',
  'private',
  'test',
  'example',
  'invalid',
  'onion',
  'arpa',
]);

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Whether a host is a name the public DNS could hold: dotted labels, the last one led by a
 * letter. Never an address (`127.0.0.1`, `[::1]`: the URL parser has already turned `0x7f.1`
 * and `2130706433` into dotted numbers), never a bare name (`localhost`, `postgres`).
 */
export function isPublicHostName(host: string): boolean {
  if (host.length > 253) return false;
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label)))
    return false;
  const last = labels[labels.length - 1];
  return /^[a-z]/.test(last) && !PRIVATE_SUFFIXES.has(last);
}

/**
 * Whether a URL may be asked for: https, a public host name, the default port, nobody's
 * credentials. What a link must be to be saved, and every hop of reading it.
 */
export function isPublicUrl(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    isPublicHostName(url.hostname)
  );
}

/**
 * A link a donor may show, as it is kept: `https://host/path?query`, the fragment dropped.
 * What people type is met halfway ("example.com/me" and "http://…" become https). Null for
 * anything that is not a public web page: another scheme, an address, a port, a user, a bare
 * name, or more than URL_MAX characters.
 */
export function cleanLinkUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text || text.length > URL_MAX * 4 || /\s/.test(text)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (!isPublicUrl(url)) return null;
  url.hash = '';
  return url.href.length <= URL_MAX ? url.href : null;
}
