import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { SightsCatalog } from './sights-catalog.js';

const SITE = 'https://example.com';

const config = {
  get: () => SITE,
} as unknown as ConfigService<Env, true>;

type Files = Record<string, unknown>;

function fake(files: Files) {
  const calls: string[] = [];
  const fetcher = ((url: string) => {
    calls.push(url);
    const path = url.replace(`${SITE}/`, '');
    if (!(path in files))
      return Promise.resolve(new Response('', { status: 404 }));
    const body = files[path];
    if (body === 'boom')
      return Promise.resolve(new Response('', { status: 500 }));
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const sight = (id: string, extra: object = {}) => ({
  id,
  n: `Building ${id}`,
  lon: -104.8,
  lat: 38.83,
  sprite: { src: `sights/h${id}.webp`, x: 0, y: 0, w: 220, h: 55 },
  ...extra,
});

function world(
  name: string,
  opts: { quiz?: boolean; sights?: object[]; texts?: object } = {},
): Files {
  const base = `${name}/data`;
  const files: Files = {
    [`${base}/sights.json`]: {
      sights: opts.sights ?? [sight('a'), sight('b'), sight('c')],
    },
    [`${base}/sights.en-US.json`]: opts.texts ?? {
      a: { title: 'A', url: 'u', text: 'Text of a.', lang: 'en' },
      b: { title: 'B', url: 'u', text: 'Text of b.', lang: 'en' },
      c: { title: 'C', url: 'u', text: 'Text of c.', lang: 'en' },
    },
  };
  if (opts.quiz !== false) {
    files[`${base}/quiz.en-US.json`] = {
      questions: [
        { id: 'a', level: 1 },
        { id: 'b', level: 2 },
        { id: 'c', level: 3 },
      ],
    };
  }
  return files;
}

describe('SightsCatalog', () => {
  it("famous buildings are the quiz's easiest level, with their text, map link and picture", async () => {
    const { fetcher } = fake(world('tinycos'));
    const catalog = new SightsCatalog(config, fetcher);
    const famous = await catalog.famous('tinycos', 'en-US');
    expect(famous).toEqual([
      {
        world: 'tinycos',
        id: 'a',
        name: 'Building a',
        text: 'Text of a.',
        mapUrl: 'https://example.com/tinycos/#38.83000,-104.80000,1',
        picture: {
          src: 'https://example.com/api/sight-pictures/tinycos/ha.png',
          width: 110,
          height: 28,
        },
      },
    ]);
  });

  it('a world with sights but no quiz offers every sight with an article', async () => {
    const { fetcher } = fake(world('tinytkf', { quiz: false }));
    const catalog = new SightsCatalog(config, fetcher);
    const famous = await catalog.famous('tinytkf', 'en-US');
    expect(famous?.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('a sight without a sprite, or without a text, is left out', async () => {
    const { fetcher } = fake(
      world('tinytkf', {
        quiz: false,
        sights: [
          sight('a', { sprite: undefined }),
          sight('b'),
          sight('c'),
          sight('d'),
        ],
        texts: {
          b: { text: '' },
          c: { text: 'Fine.' },
          d: { text: 'Fine too.' },
          a: { text: 'No sprite.' },
        },
      }),
    );
    const catalog = new SightsCatalog(config, fetcher);
    const famous = await catalog.famous('tinytkf', 'en-US');
    expect(famous?.map((s) => s.id)).toEqual(['c', 'd']);
  });

  it('answers [] when no building qualifies', async () => {
    const files = world('tinycos');
    files['tinycos/data/quiz.en-US.json'] = { questions: [] };
    const catalog = new SightsCatalog(config, fake(files).fetcher);
    expect(await catalog.famous('tinycos', 'en-US')).toEqual([]);
  });

  it('unreadable files answer null, and are asked again next time', async () => {
    const files = world('tinycos');
    files['tinycos/data/sights.json'] = 'boom';
    const { fetcher, calls } = fake(files);
    const catalog = new SightsCatalog(config, fetcher);
    expect(await catalog.famous('tinycos', 'en-US')).toBeNull();
    const first = calls.length;
    expect(await catalog.famous('tinycos', 'en-US')).toBeNull();
    expect(calls.length).toBeGreaterThan(first);
  });

  it('caches a good reading', async () => {
    const { fetcher, calls } = fake(world('tinycos'));
    const catalog = new SightsCatalog(config, fetcher);
    await catalog.famous('tinycos', 'en-US');
    const first = calls.length;
    await catalog.famous('tinycos', 'en-US');
    expect(calls.length).toBe(first);
  });

  it('a long opening is cut at a word with an ellipsis, at most 161 characters', async () => {
    const long = 'word '.repeat(100).trim();
    const { fetcher } = fake(
      world('tinycos', {
        texts: { a: { text: long } },
        sights: [sight('a')],
      }),
    );
    const catalog = new SightsCatalog(config, fetcher);
    const [one] = (await catalog.famous('tinycos', 'en-US')) ?? [];
    expect(one.text.length).toBeLessThanOrEqual(161);
    expect(one.text.endsWith('word…')).toBe(true);
  });

  it('pickAcross takes distinct worlds and reports the unread ones', async () => {
    const files = {
      ...world('tinycos'),
      ...world('tinydal'),
      ...world('tinypit'),
      'tinybad/data/sights.json': 'boom',
    };
    const catalog = new SightsCatalog(config, fake(files).fetcher);
    const { sights, unread } = await catalog.pickAcross(
      ['tinycos', 'tinydal', 'tinypit', 'tinybad'],
      'en-US',
      2,
      () => 0.5,
    );
    expect(sights).toHaveLength(2);
    expect(new Set(sights.map((s) => s.world)).size).toBe(2);
    expect(unread).toEqual(['tinybad']);
  });

  it('pickAcross fills from repeat worlds only when there are fewer worlds than the count', async () => {
    const files = world('tinytkf', { quiz: false });
    const catalog = new SightsCatalog(config, fake(files).fetcher);
    const { sights } = await catalog.pickAcross(['tinytkf'], 'en-US', 3);
    expect(sights).toHaveLength(3);
  });

  it('pickIn answers some of a world, or says it is unread', async () => {
    const files = world('tinytkf', { quiz: false });
    const catalog = new SightsCatalog(config, fake(files).fetcher);
    expect((await catalog.pickIn('tinytkf', 'en-US', 2)).sights).toHaveLength(
      2,
    );
    expect(await catalog.pickIn('tinynope', 'en-US', 2)).toEqual({
      sights: [],
      unread: true,
      quiz: false,
    });
  });

  it('pickIn says whether the world has a quiz: a quiz file that is a 404 is none', async () => {
    const files = {
      ...world('tinycos'),
      ...world('tinytkf', { quiz: false }),
    };
    const catalog = new SightsCatalog(config, fake(files).fetcher);
    expect((await catalog.pickIn('tinycos', 'en-US', 1)).quiz).toBe(true);
    expect((await catalog.pickIn('tinytkf', 'en-US', 1)).quiz).toBe(false);
    // and the same from the cache
    expect((await catalog.pickIn('tinycos', 'en-US', 1)).quiz).toBe(true);
  });
});
