import { createServer, type Server } from 'node:http';
import type { AddressInfo, LookupFunction } from 'node:net';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import {
  createFetcher,
  FetchRefused,
  guardedLookup,
  type Fetcher,
  type FetchOptions,
} from './safe-fetch.js';

const within = (ms = 3000, over: Partial<FetchOptions> = {}): FetchOptions => ({
  accept: 'text/html',
  maxBytes: 10_000,
  longer: 'cut',
  deadline: Date.now() + ms,
  ...over,
});

describe('createFetcher, as the API uses it', () => {
  const never = vi.fn(() => Promise.reject(new Error('looked up')));
  const fetcher = createFetcher({ resolve: never });

  it.each([
    ['plain http', 'http://example.com/'],
    ['an address', 'https://127.0.0.1/'],
    ['a private address', 'https://10.0.0.1/'],
    ['the metadata service', 'https://169.254.169.254/latest/meta-data/'],
    ['an IPv6 address', 'https://[::1]/'],
    ['a bare name', 'https://localhost/'],
    ['a service on the same network', 'https://postgres/'],
    ['a port', 'https://example.com:8443/'],
    ['a user', 'https://ana@example.com/'],
    ['another scheme', 'file:///etc/passwd'],
  ])('refuses %s without looking anything up', async (_what, url) => {
    never.mockClear();
    await expect(fetcher(url, within())).rejects.toBeInstanceOf(FetchRefused);
    expect(never).not.toHaveBeenCalled();
  });

  it('connects nowhere when the name is a private address', async () => {
    const resolve = vi.fn(() =>
      Promise.resolve([{ address: '10.0.0.5', family: 4 }]),
    );
    await expect(
      createFetcher({ resolve })('https://example.com/', within()),
    ).rejects.toBeInstanceOf(FetchRefused);
    expect(resolve).toHaveBeenCalledWith('example.com');
  });

  it('gives up once the deadline has passed, before asking', async () => {
    await expect(
      fetcher('https://example.com/', within(-1)),
    ).rejects.toBeInstanceOf(FetchRefused);
    expect(never).not.toHaveBeenCalled();
  });
});

describe('guardedLookup', () => {
  const look = (
    lookup: LookupFunction,
    options: { all?: boolean; family?: number } = { all: true },
  ) =>
    new Promise<unknown>((resolve, reject) => {
      lookup('example.com', options, (error, address, family) => {
        if (error) reject(error);
        else resolve(family === undefined ? address : { address, family });
      });
    });
  const answering = (...addresses: string[]) =>
    guardedLookup(() =>
      Promise.resolve(
        addresses.map((address) => ({
          address,
          family: address.includes(':') ? 6 : 4,
        })),
      ),
    );

  it('hands on public addresses, all of them or the first', async () => {
    const lookup = answering('93.184.216.34', '2606:2800:220:1::1');
    expect(await look(lookup)).toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1::1', family: 6 },
    ]);
    expect(await look(lookup, {})).toEqual({
      address: '93.184.216.34',
      family: 4,
    });
    expect(await look(lookup, { all: true, family: 6 })).toEqual([
      { address: '2606:2800:220:1::1', family: 6 },
    ]);
  });

  it.each([
    ['a private address', ['192.168.1.10']],
    ['this machine', ['127.0.0.1']],
    ['a private address among public ones', ['93.184.216.34', '10.0.0.1']],
    ['a private address written as IPv6', ['::ffff:10.0.0.1']],
    ['a private one of the other family', ['93.184.216.34', 'fd00::1']],
    ['no address at all', []],
  ])('refuses %s', async (_what, addresses) => {
    await expect(look(answering(...addresses))).rejects.toBeInstanceOf(
      FetchRefused,
    );
  });

  it('refuses a private address even when only the other family was asked for', async () => {
    await expect(
      look(answering('93.184.216.34', 'fd00::1'), { all: true, family: 4 }),
    ).rejects.toBeInstanceOf(FetchRefused);
  });

  it("passes a failed lookup's error on", async () => {
    const failing = guardedLookup(() => Promise.reject(new Error('ENOTFOUND')));
    await expect(look(failing)).rejects.toThrow('ENOTFOUND');
  });
});

describe('createFetcher, against a server on this machine', () => {
  let server: Server;
  let origin: string;
  let fetcher: Fetcher;
  const asked: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      asked.push(req.url ?? '');
      const html = (body: string | Buffer, headers = {}) => {
        res.writeHead(200, { 'content-type': 'text/html', ...headers });
        res.end(body);
      };
      switch (req.url) {
        case '/page':
          return html('<title>Hello</title>');
        case '/agent':
          return html(
            `${req.headers['user-agent']}|${req.headers.accept}|${req.headers.cookie ?? 'no cookie'}`,
          );
        case '/moved':
          res.writeHead(302, { location: '/page' });
          return res.end();
        case '/round':
          res.writeHead(302, { location: '/round' });
          return res.end();
        case '/out':
          res.writeHead(302, { location: 'http://10.0.0.1/secret' });
          return res.end();
        case '/elsewhere':
          res.writeHead(302, { location: `${origin.replace(/\d+$/, '1')}/x` });
          return res.end();
        case '/missing':
          res.writeHead(404, { 'content-type': 'text/plain' });
          return res.end('nothing here');
        case '/long':
          return html('a'.repeat(50_000));
        case '/gzip':
          return html(gzipSync('<title>Packed</title>'), {
            'content-encoding': 'gzip',
          });
        case '/brotli':
          return html(brotliCompressSync('<title>Brotli</title>'), {
            'content-encoding': 'br',
          });
        case '/bomb':
          // 20 MB of zeros: a few kilobytes on the wire
          return html(gzipSync(Buffer.alloc(20_000_000)), {
            'content-encoding': 'gzip',
          });
        case '/odd':
          return html('x', { 'content-encoding': 'zstd' });
        case '/broken':
          return html(gzipSync('<title>Packed</title>').subarray(0, 12), {
            'content-encoding': 'gzip',
          });
        case '/slow':
          res.writeHead(200, { 'content-type': 'text/html' });
          res.write('<title>');
          return; // and never another byte
        default:
          res.writeHead(500);
          return res.end();
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${port}`;
    fetcher = createFetcher({
      test: {
        allowed: (url) =>
          url.hostname === '127.0.0.1' && url.port === String(port),
      },
    });
  });

  beforeEach(() => {
    asked.length = 0;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('answers a page with its status, type and bytes', async () => {
    const got = await fetcher(`${origin}/page`, within());
    expect(got).toMatchObject({
      url: `${origin}/page`,
      status: 200,
      contentType: 'text/html',
    });
    expect(got.body.toString()).toBe('<title>Hello</title>');
  });

  it("says who asks, what it wants, and nothing of anyone's", async () => {
    const got = await fetcher(`${origin}/agent`, within());
    expect(got.body.toString()).toBe(
      'Mozilla/5.0 (compatible; tinyworlds-link-preview/1.0)|text/html|no cookie',
    );
  });

  it('follows a redirect and says where the answer came from', async () => {
    const got = await fetcher(`${origin}/moved`, within());
    expect(got.url).toBe(`${origin}/page`);
    expect(got.body.toString()).toContain('Hello');
  });

  it('follows only so many', async () => {
    await expect(fetcher(`${origin}/round`, within())).rejects.toThrow(
      'too many',
    );
    expect(asked).toHaveLength(4);
  });

  it('checks where a redirect leads before going there', async () => {
    await expect(fetcher(`${origin}/out`, within())).rejects.toBeInstanceOf(
      FetchRefused,
    );
    await expect(
      fetcher(`${origin}/elsewhere`, within()),
    ).rejects.toBeInstanceOf(FetchRefused);
    expect(asked).toEqual(['/out', '/elsewhere']);
  });

  it('hands on an answer that is not a success', async () => {
    const got = await fetcher(`${origin}/missing`, within());
    expect(got.status).toBe(404);
  });

  it('cuts a long page where it was told to', async () => {
    const got = await fetcher(
      `${origin}/long`,
      within(3000, { maxBytes: 1000 }),
    );
    expect(got.body).toHaveLength(1000);
  });

  it('refuses a long picture whole', async () => {
    await expect(
      fetcher(
        `${origin}/long`,
        within(3000, { maxBytes: 1000, longer: 'refuse' }),
      ),
    ).rejects.toThrow('too large');
  });

  it('unpacks gzip and brotli', async () => {
    expect((await fetcher(`${origin}/gzip`, within())).body.toString()).toBe(
      '<title>Packed</title>',
    );
    expect((await fetcher(`${origin}/brotli`, within())).body.toString()).toBe(
      '<title>Brotli</title>',
    );
  });

  it('counts a packed body by what it unpacks to', async () => {
    const cut = await fetcher(
      `${origin}/bomb`,
      within(5000, { maxBytes: 5000 }),
    );
    expect(cut.body).toHaveLength(5000);
    await expect(
      fetcher(
        `${origin}/bomb`,
        within(5000, { maxBytes: 5000, longer: 'refuse' }),
      ),
    ).rejects.toThrow('too large');
  });

  it('refuses a packing it does not know, and fails on a broken one', async () => {
    await expect(fetcher(`${origin}/odd`, within())).rejects.toBeInstanceOf(
      FetchRefused,
    );
    await expect(fetcher(`${origin}/broken`, within())).rejects.toThrow();
  });

  it('gives up at the deadline on a server that stops talking', async () => {
    const started = Date.now();
    await expect(fetcher(`${origin}/slow`, within(300))).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
