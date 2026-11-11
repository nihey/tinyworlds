import {
  cleanText,
  decodeEntities,
  decodeHtml,
  DESCRIPTION_MAX,
  readPageMeta,
  TITLE_MAX,
} from './page-meta.js';

const PAGE = 'https://example.com/shop/item';

describe('readPageMeta', () => {
  it("reads Open Graph's words and picture before the page's own", () => {
    const meta = readPageMeta(
      `<!doctype html><html><head>
        <title>Item 42 | Example</title>
        <meta name="description" content="The page's own description">
        <meta property="og:title" content="A tiny shop">
        <meta property="og:description" content="Pixel prints &amp; postcards">
        <meta property="og:image" content="/cards/shop.png">
      </head><body><h1>hello</h1></body></html>`,
      PAGE,
    );
    expect(meta).toEqual({
      title: 'A tiny shop',
      description: 'Pixel prints & postcards',
      picture: 'https://example.com/cards/shop.png',
      icons: ['https://example.com/favicon.ico'],
    });
  });

  it("falls back to Twitter's, then to the title and the plain description", () => {
    expect(
      readPageMeta(
        `<head><title> Plain
          title </title><meta name="twitter:title" content="From Twitter">
          <meta name="twitter:image" content="https://cdn.example.com/t.jpg"></head>`,
        PAGE,
      ),
    ).toMatchObject({
      title: 'From Twitter',
      description: null,
      picture: 'https://cdn.example.com/t.jpg',
    });
    expect(
      readPageMeta(
        '<title>S&atilde;o Paulo &#8212; guia</title><meta name=description content=Curto>',
        PAGE,
      ),
    ).toMatchObject({
      title: 'São Paulo — guia',
      description: 'Curto',
      picture: null,
    });
  });

  it('says null for a page that says nothing', () => {
    expect(readPageMeta('<html><body>just text</body></html>', PAGE)).toEqual({
      title: null,
      description: null,
      picture: null,
      icons: ['https://example.com/favicon.ico'],
    });
  });

  it('reads attributes whatever their quotes, order and case', () => {
    const meta = readPageMeta(
      `<META CONTENT='He said "hi" > bye' PROPERTY="og:title"/>
       <meta content=unquoted property=og:description >`,
      PAGE,
    );
    expect(meta.title).toBe('He said "hi" > bye');
    expect(meta.description).toBe('unquoted');
  });

  it('keeps the first of a tag given twice', () => {
    const meta = readPageMeta(
      '<meta property="og:title" content="First"><meta property="og:title" content="Second">',
      PAGE,
    );
    expect(meta.title).toBe('First');
  });

  it('steps over comments, scripts and styles, and stops at the body', () => {
    const meta = readPageMeta(
      `<head>
        <!-- <meta property="og:title" content="In a comment"> -->
        <script>var s = '<meta property="og:title" content="In a script">';</script>
        <style>a::after { content: '<title>In a style</title>' }</style>
        <meta property="og:title" content="The real one">
      </head>
      <body><meta property="og:description" content="In the body"></body>`,
      PAGE,
    );
    expect(meta.title).toBe('The real one');
    expect(meta.description).toBeNull();
  });

  it('makes addresses absolute against <base>, and https', () => {
    const meta = readPageMeta(
      `<base href="https://static.example.com/assets/">
       <meta property="og:image" content="card.png">
       <link rel="icon" href="http://example.com/icon.png" sizes="96x96">`,
      PAGE,
    );
    expect(meta.picture).toBe('https://static.example.com/assets/card.png');
    expect(meta.icons[0]).toBe('https://example.com/icon.png');
  });

  it.each([
    ['an address', 'https://10.0.0.1/secret.png'],
    ['this machine', 'http://localhost/secret.png'],
    ['the metadata service', 'http://169.254.169.254/latest/meta-data'],
    ['a port', 'https://example.com:8080/a.png'],
    ['another scheme', 'file:///etc/passwd'],
    ['a script', 'javascript:alert(1)'],
  ])('drops a picture at %s', (_what, href) => {
    const meta = readPageMeta(
      `<meta property="og:image" content="${href}"><link rel="icon" href="${href}">`,
      PAGE,
    );
    expect(meta.picture).toBeNull();
    expect(meta.icons).toEqual(['https://example.com/favicon.ico']);
  });

  it('orders icons: 64 px or more first, then the largest, the plain ones, .ico last', () => {
    const meta = readPageMeta(
      `<link rel="shortcut icon" href="/old.ico">
       <link rel="icon" href="/16.png" sizes="16x16">
       <link rel="icon" href="/32.png" sizes="32x32">
       <link rel="icon" href="/192.png" sizes="192x192">
       <link rel="apple-touch-icon" href="/touch.png">
       <link rel="icon" href="/drawing.svg" type="image/svg+xml">
       <link rel="mask-icon" href="/mask.svg">
       <link rel="stylesheet" href="/style.css">`,
      PAGE,
    );
    expect(meta.icons).toEqual([
      'https://example.com/drawing.svg',
      'https://example.com/touch.png',
      'https://example.com/192.png',
      'https://example.com/32.png',
    ]);
  });

  it('keeps an icon written into the page itself', () => {
    const data =
      'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';
    const meta = readPageMeta(`<link rel="icon" href="${data}">`, PAGE);
    expect(meta.icons).toEqual([data, 'https://example.com/favicon.ico']);
    const huge = `data:image/png;base64,${'A'.repeat(200_000)}`;
    expect(
      readPageMeta(`<link rel="icon" href="${huge}">`, PAGE).icons,
    ).toEqual(['https://example.com/favicon.ico']);
  });

  it('cuts long words short and takes out what cannot be seen', () => {
    const meta = readPageMeta(
      `<meta property="og:title" content="${'T'.repeat(200)}">
       <meta property="og:description" content="a‮b\u0007c\n\n  d ${'D'.repeat(400)}">`,
      PAGE,
    );
    expect(Array.from(meta.title ?? '')).toHaveLength(TITLE_MAX);
    expect(meta.title?.endsWith('…')).toBe(true);
    expect(Array.from(meta.description ?? '')).toHaveLength(DESCRIPTION_MAX);
    expect(meta.description?.startsWith('abc d DDD')).toBe(true);
  });

  it('survives a page cut off in the middle of a tag', () => {
    expect(() =>
      readPageMeta('<head><title>Cut</title><meta property="og:ti', PAGE),
    ).not.toThrow();
    expect(readPageMeta('<title>Never closed', PAGE).title).toBe(
      'Never closed',
    );
    expect(readPageMeta('<meta content="never closed', PAGE).title).toBeNull();
  });
});

describe('decodeEntities', () => {
  it('reads names and numbers, and leaves the rest alone', () => {
    expect(
      decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#x27;'),
    ).toBe('a & b <c> "d" \'e\'');
    expect(decodeEntities('caf&eacute; &Eacute;t&eacute; &nbsp;&yuml;')).toBe(
      'café Été  ÿ',
    );
    expect(decodeEntities('?a=1&copy=2 &unknown; &#0; &#xD800; &amp')).toBe(
      '?a=1&copy=2 &unknown; &#0; &#xD800; &amp',
    );
    expect(decodeEntities('&#128512;')).toBe('😀');
  });
});

describe('cleanText', () => {
  it('says null when nothing is left', () => {
    expect(cleanText('  \n\t ', 10)).toBeNull();
    expect(cleanText('​‮', 10)).toBeNull();
  });

  it('counts code points, not UTF-16 units', () => {
    expect(cleanText('😀😀😀😀', 3)).toBe('😀😀…');
    expect(cleanText('😀😀😀', 3)).toBe('😀😀😀');
  });
});

describe('decodeHtml', () => {
  it("reads the charset from the header, then from the page's own meta, else UTF-8", () => {
    const latin1 = Buffer.from('<title>S\xe3o Paulo</title>', 'latin1');
    expect(decodeHtml(latin1, 'text/html; charset=ISO-8859-1')).toContain(
      'São Paulo',
    );
    const declared = Buffer.from(
      '<meta charset="windows-1252"><title>S\xe3o Paulo</title>',
      'latin1',
    );
    expect(decodeHtml(declared, 'text/html')).toContain('São Paulo');
    expect(decodeHtml(Buffer.from('<title>São</title>'), null)).toContain(
      'São',
    );
    expect(
      decodeHtml(
        Buffer.from('<title>São</title>'),
        'text/html; charset=klingon',
      ),
    ).toContain('São');
  });
});
