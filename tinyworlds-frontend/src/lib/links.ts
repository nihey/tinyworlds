import { API_URL } from "./donate";

/**
 * The links donors show beside their names, without the signs: parsing what the API says of
 * them, where their pictures are, and what a link must be to be saved. Pure but for `apiOrigin`.
 */

/** How many links a donor may have (the API's `LINKS_MAX`; the API says so too, in `myLinks`). */
export const LINKS_MAX = 3;
/** The longest link kept, in characters (the API's `URL_MAX`). */
export const URL_MAX = 300;

/**
 * What a benefactor's link says of itself to a search engine: follow me, in so many words.
 * Search engines follow any link that does not say `nofollow` and read nothing into
 * `dofollow`; it is written out so that whoever looks at the page's source finds the promise
 * made to the benefactors. Never `nofollow`, `sponsored` or `ugc` (`noopener` only keeps the
 * page opened from reaching back into this one).
 */
export const LINK_REL = "dofollow noopener";

/** A page a named donor points to, as the page described itself when the link was saved. */
export interface BenefactorLink {
  url: string;
  title: string;
  description: string | null;
  /** the site's icon, a copy the API keeps: ready for `src`; null without one */
  icon: string | null;
  /** the page's picture, likewise; null without one, or while the donor's giving shows none */
  image: string | null;
}

/** One of the signed-in donor's own links. */
export interface MyLink extends BenefactorLink {
  id: string;
}

/** The signed-in donor's links, and what decides what the public lists show of them. */
export interface MyLinks {
  links: MyLink[];
  max: number;
  /** everything the donor has given, in US cents */
  givenCents: number;
  /** from this much given, the links' pictures show on the public lists */
  picturesFromCents: number;
  /** an admin took the links off the public lists */
  hidden: boolean;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * Where the API is, for the pictures it serves: the origin of `NEXT_PUBLIC_API_URL`, which may
 * be a path on the site's own. Null without an API, or outside a browser.
 */
export function apiOrigin(): string | null {
  if (!API_URL || typeof window === "undefined") return null;
  try {
    return new URL(API_URL, window.location.href).origin;
  } catch {
    return null;
  }
}

/**
 * A picture the API keeps, as an address for `src`. The API names it by a path of its own
 * (`/api/link-images/<id>`); anything else is not shown, so the site never loads a picture
 * from somewhere a donor chose.
 */
export function assetUrl(path: unknown, origin: string | null): string | null {
  if (typeof path !== "string" || !origin) return null;
  return /^\/[\w./-]+$/.test(path) && !path.startsWith("//") ? `${origin}${path}` : null;
}

/** An address a visitor may be sent to: https, nothing else. */
function isHttps(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function parseLink(v: unknown, origin: string | null): BenefactorLink | null {
  if (!isRec(v)) return null;
  if (!isHttps(v.url)) return null;
  if (typeof v.title !== "string" || v.title.trim() === "") return null;
  return {
    url: v.url,
    title: v.title,
    description: typeof v.description === "string" && v.description ? v.description : null,
    icon: assetUrl(v.icon, origin),
    image: assetUrl(v.image, origin),
  };
}

/**
 * The links of a row of the API's answer: the well-formed ones, in its order, at most
 * `LINKS_MAX`. A row without links (an older API, or none to show) has none.
 */
export function parseLinks(value: unknown, origin: string | null): BenefactorLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      const link = parseLink(item, origin);
      return link ? [link] : [];
    })
    .slice(0, LINKS_MAX);
}

/** The API's `myLinks` answer, or null when it is not what the contract says. */
export function parseMyLinks(value: unknown, origin: string | null): MyLinks | null {
  if (!isRec(value) || !Array.isArray(value.links)) return null;
  const { max, givenCents, picturesFromCents, hidden } = value;
  if (!isCount(max) || !isCount(givenCents) || !isCount(picturesFromCents)) return null;
  if (typeof hidden !== "boolean") return null;
  const links: MyLink[] = [];
  for (const item of value.links) {
    const link = parseLink(item, origin);
    const id = isRec(item) ? item.id : null;
    if (!link || typeof id !== "string" || id === "") return null;
    links.push({ id, ...link });
  }
  return { links, max, givenCents, picturesFromCents, hidden };
}

/** One of the donor's links as the API answers a change to it, or null. */
export function parseMyLink(value: unknown, origin: string | null): MyLink | null {
  const link = parseLink(value, origin);
  const id = isRec(value) ? value.id : null;
  return link && typeof id === "string" && id !== "" ? { id, ...link } : null;
}

/** "example.com": where a link leads, as people read it. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const PRIVATE_SUFFIXES = new Set([
  "localhost",
  "local",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "private",
  "test",
  "example",
  "invalid",
  "onion",
  "arpa",
]);

/**
 * A link as the API keeps it (`cleanLinkUrl`): same rules, so what the form accepts the API
 * does too. `https://host/path?query`, what people type met halfway ("example.com/me",
 * "http://…"); null for anything that is not a public web page (another scheme, an address, a
 * port, a user, a bare name, more than `URL_MAX` characters).
 */
export function cleanLinkUrl(raw: string): string | null {
  let text = raw.trim();
  if (!text || text.length > URL_MAX * 4 || /\s/.test(text)) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const labels = url.hostname.split(".");
  const last = labels[labels.length - 1];
  if (url.hostname.length > 253 || labels.length < 2) return null;
  if (!labels.every((label) => LABEL.test(label))) return null;
  if (!/^[a-z]/.test(last) || PRIVATE_SUFFIXES.has(last)) return null;
  url.hash = "";
  return url.href.length <= URL_MAX ? url.href : null;
}

/** What is still to give before a donor's links show their pictures, in US cents; 0 once they do. */
export function centsToPictures(links: Pick<MyLinks, "givenCents" | "picturesFromCents">): number {
  return Math.max(links.picturesFromCents - links.givenCents, 0);
}
