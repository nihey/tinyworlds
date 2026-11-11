import sharp from 'sharp';
import { createLinkReader, nameOf } from './link-reader.js';
import { ICON_SIDE, PICTURE_SIZE } from './link-images.js';
import {
  FetchRefused,
  type Fetched,
  type Fetcher,
  type FetchOptions,
} from './safe-fetch.js';

const picture = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 30, g: 120, b: 200 },
    },
  })
    .png()
    .toBuffer();

/** A fetcher that answers from a table, and keeps what it was asked. */
function serving(pages: Record<string, Partial<Fetched> | Error>) {
  const asked: { url: string; options: FetchOptions }[] = [];
  const fetcher: Fetcher = (url, options) => {
    asked.push({ url, options });
    const page = pages[url];
    if (!page) return Promise.reject(new Error(`ENOTFOUND ${url}`));
    if (page instanceof Error) return Promise.reject(page);
    return Promise.resolve({
      url,
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: Buffer.alloc(0),
      ...page,
    });
  };
  return { fetcher, asked };
}

const html = (text: string) => ({ body: Buffer.from(text) });

describe('createLinkReader', () => {
  it("reads a page's words, its picture and its icon", async () => {
    const { fetcher, asked } = serving({
      'https://example.com/shop': html(
        `<title>Shop</title>
         <meta property="og:title" content="A tiny shop">
         <meta property="og:description" content="Prints and postcards">
         <meta property="og:image" content="/card.png">
         <link rel="icon" href="/icon.png" sizes="96x96">`,
      ),
      'https://example.com/card.png': { body: await picture(1200, 630) },
      'https://example.com/icon.png': { body: await picture(96, 96) },
    });
    const preview = await createLinkReader(fetcher).read(
      'https://example.com/shop',
    );
    expect(preview).toMatchObject({
      reached: true,
      title: 'A tiny shop',
      description: 'Prints and postcards',
      picture: PICTURE_SIZE,
      icon: { width: ICON_SIDE, height: ICON_SIDE },
    });
    expect(asked.map((a) => a.url)).toEqual([
      'https://example.com/shop',
      'https://example.com/card.png',
      'https://example.com/icon.png',
    ]);
    // the page may be cut (its head is at its start); a picture is refused when too long
    expect(asked[0].options.longer).toBe('cut');
    expect(asked[1].options).toMatchObject({
      longer: 'refuse',
      accept: 'image/*',
    });
    // one deadline for all three
    expect(new Set(asked.map((a) => a.options.deadline)).size).toBe(1);
  });

  it('names a link by its host and path when its page is away', async () => {
    const { fetcher, asked } = serving({});
    const preview = await createLinkReader(fetcher).read(
      'https://www.example.com/in/ana/',
    );
    expect(preview).toEqual({
      reached: false,
      title: 'example.com/in/ana',
      description: null,
      icon: null,
      picture: null,
    });
    // the site's icon is still asked for
    expect(asked.map((a) => a.url)).toEqual([
      'https://www.example.com/in/ana/',
      'https://www.example.com/favicon.ico',
    ]);
  });

  it('still finds the icon of a site that will not show its page to a program', async () => {
    const { fetcher } = serving({
      'https://example.com/ana': { status: 403, body: Buffer.from('no') },
      'https://example.com/favicon.ico': { body: await picture(32, 32) },
    });
    const preview = await createLinkReader(fetcher).read(
      'https://example.com/ana',
    );
    expect(preview).toMatchObject({
      reached: false,
      title: 'example.com/ana',
      picture: null,
      icon: { width: 32, height: 32 },
    });
  });

  it('does not read something that is not a page as one', async () => {
    const { fetcher } = serving({
      'https://example.com/file.pdf': {
        contentType: 'application/pdf',
        body: Buffer.from('<title>Not really</title>'),
      },
    });
    const preview = await createLinkReader(fetcher).read(
      'https://example.com/file.pdf',
    );
    expect(preview).toMatchObject({
      reached: false,
      title: 'example.com/file.pdf',
    });
  });

  it('tries the next icon when one cannot be drawn', async () => {
    const { fetcher, asked } = serving({
      'https://example.com/': html(
        `<link rel="icon" href="/broken.png" sizes="64x64">
         <link rel="icon" href="/gone.png" sizes="48x48">
         <link rel="icon" href="/good.png" sizes="32x32">`,
      ),
      'https://example.com/broken.png': { body: Buffer.from('not a picture') },
      'https://example.com/gone.png': { status: 404 },
      'https://example.com/good.png': { body: await picture(32, 32) },
    });
    const preview = await createLinkReader(fetcher).read(
      'https://example.com/',
    );
    expect(preview.icon).toMatchObject({ width: 32, height: 32 });
    expect(asked.map((a) => a.url)).not.toContain(
      'https://example.com/favicon.ico',
    );
  });

  it('goes without a picture that is refused, too small, or not one', async () => {
    for (const card of [
      new FetchRefused('too large'),
      { body: await picture(1, 1) },
      { body: Buffer.from('<html>') },
      { status: 500 },
    ]) {
      const { fetcher } = serving({
        'https://example.com/': html(
          '<title>Home</title><meta property="og:image" content="/card.png">',
        ),
        'https://example.com/card.png': card,
      });
      const preview = await createLinkReader(fetcher).read(
        'https://example.com/',
      );
      expect(preview).toMatchObject({
        reached: true,
        title: 'Home',
        picture: null,
      });
    }
  });

  it('draws an icon written into the page without asking for anything', async () => {
    const icon = (await picture(48, 48)).toString('base64');
    const { fetcher, asked } = serving({
      'https://example.com/': html(
        `<link rel="icon" href="data:image/png;base64,${icon}">`,
      ),
    });
    const preview = await createLinkReader(fetcher).read(
      'https://example.com/',
    );
    expect(preview.icon).toMatchObject({ width: 48, height: 48 });
    expect(asked).toHaveLength(1);
  });

  it("makes addresses absolute against where the page's answer came from", async () => {
    const { fetcher, asked } = serving({
      'https://example.com/go': {
        url: 'https://shop.example.com/landing',
        ...html('<meta property="og:image" content="card.png">'),
      },
    });
    await createLinkReader(fetcher).read('https://example.com/go');
    expect(asked.map((a) => a.url)).toContain(
      'https://shop.example.com/card.png',
    );
  });
});

describe('nameOf', () => {
  it('is the host and the path, as people read them', () => {
    expect(nameOf('https://www.example.com/')).toBe('example.com');
    expect(nameOf('https://example.com/caf%C3%A9/?x=1')).toBe(
      'example.com/café',
    );
    expect(nameOf('https://example.com/%E0%A4%A')).toBe('example.com/%E0%A4%A');
  });
});
