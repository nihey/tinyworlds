import type { Provider } from '@nestjs/common';
import { drawIcon, drawPicture, type Drawn } from './link-images.js';
import {
  cleanText,
  decodeHtml,
  readPageMeta,
  TITLE_MAX,
  type PageMeta,
} from './page-meta.js';
import { createFetcher, type Fetcher } from './safe-fetch.js';

export const LINK_READER = Symbol('LINK_READER');

/** What a link's card shows, read from the page it leads to. */
export interface LinkPreview {
  /** Whether the page answered with something to read; without, the rest is what can be said anyway. */
  reached: boolean;
  /** The page's title; the link's own host and path when the page gave none. */
  title: string;
  description: string | null;
  icon: Drawn | null;
  picture: Drawn | null;
}

/** Reads a link's page. Tests replace it: nothing in them asks the internet for anything. */
export interface LinkReader {
  /** Never throws: a page that cannot be read is `reached: false`. */
  read(url: string): Promise<LinkPreview>;
}

/** How long reading a link may take in all (the page, its picture and its icon), in milliseconds. */
export const READ_MS = 9000;

/** The most that is read of a page (its head is at its start), of a picture, and of an icon. */
const PAGE_BYTES = 600_000;
const PICTURE_BYTES = 5_000_000;
const ICON_BYTES = 500_000;

/** "example.com/ana": how a link is named when its page does not say. */
export function nameOf(url: string): string {
  const { hostname, pathname } = new URL(url);
  const path = pathname.replace(/\/+$/, '');
  let readable = path;
  try {
    readable = decodeURI(path);
  } catch {
    // not UTF-8 under its escapes: as it is written
  }
  const host = hostname.replace(/^www\./, '');
  return cleanText(`${host}${readable}`, TITLE_MAX) ?? host;
}

/** The bytes a `data:` URL holds, or null when it is not one that can be read. */
function dataBytes(url: string): Buffer | null {
  const comma = url.indexOf(',');
  if (comma === -1) return null;
  const data = url.slice(comma + 1);
  try {
    return /;base64$/i.test(url.slice(0, comma))
      ? Buffer.from(data, 'base64')
      : Buffer.from(decodeURIComponent(data));
  } catch {
    return null;
  }
}

/**
 * The reader the API uses: the page through the guarded fetcher (`safe-fetch.ts`), what its
 * head says (`page-meta.ts`), then its picture and the first of its icons that can be drawn
 * (`link-images.ts`), all before one deadline. Whatever fails is simply not there: a link
 * whose page is away, or will not talk to a program, still has a name and, often, an icon.
 */
export function createLinkReader(
  fetcher: Fetcher = createFetcher(),
): LinkReader {
  const bytesOf = async (
    url: string,
    maxBytes: number,
    deadline: number,
  ): Promise<Buffer | null> => {
    if (url.startsWith('data:')) return dataBytes(url);
    try {
      const got = await fetcher(url, {
        accept: 'image/*',
        maxBytes,
        longer: 'refuse',
        deadline,
      });
      return got.status >= 200 && got.status < 300 ? got.body : null;
    } catch {
      return null;
    }
  };

  const pictureOf = async (
    url: string | null,
    deadline: number,
  ): Promise<Drawn | null> => {
    const bytes = url && (await bytesOf(url, PICTURE_BYTES, deadline));
    return bytes ? drawPicture(bytes) : null;
  };

  const iconOf = async (
    urls: string[],
    deadline: number,
  ): Promise<Drawn | null> => {
    for (const url of urls) {
      const bytes = await bytesOf(url, ICON_BYTES, deadline);
      const drawn = bytes && (await drawIcon(bytes));
      if (drawn) return drawn;
    }
    return null;
  };

  return {
    async read(url) {
      const deadline = Date.now() + READ_MS;
      let reached = false;
      let meta: PageMeta = {
        title: null,
        description: null,
        picture: null,
        icons: [new URL('/favicon.ico', url).href],
      };
      try {
        const page = await fetcher(url, {
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          maxBytes: PAGE_BYTES,
          longer: 'cut',
          deadline,
        });
        const html = !page.contentType || /html|xml/i.test(page.contentType);
        if (page.status >= 200 && page.status < 300 && html) {
          reached = true;
          meta = readPageMeta(
            decodeHtml(page.body, page.contentType),
            page.url,
          );
        }
      } catch {
        // away, refused, or too slow: its name is what there is
      }
      const [picture, icon] = await Promise.all([
        pictureOf(meta.picture, deadline),
        iconOf(meta.icons, deadline),
      ]);
      return {
        reached,
        title: meta.title ?? nameOf(url),
        description: meta.description,
        icon,
        picture,
      };
    },
  };
}

export const linkReaderProvider: Provider = {
  provide: LINK_READER,
  useFactory: (): LinkReader => createLinkReader(),
};
