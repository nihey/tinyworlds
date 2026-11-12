import { vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import sharp from 'sharp';
import type { Env } from '../config/env.js';
import { SightPicturesController } from './sight-pictures.controller.js';
import { drawSightPicture } from './sight-pictures.js';

const config = {
  get: () => 'https://example.com',
} as unknown as ConfigService<Env, true>;

const res = () =>
  ({ set: vi.fn() }) as never as Pick<Response, 'set'> & {
    set: ReturnType<typeof vi.fn>;
  };

async function webp(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 200, g: 50, b: 50, alpha: 0.5 },
    },
  })
    .webp({ lossless: true })
    .toBuffer();
}

describe('sight pictures', () => {
  it('draws a webp as a png within 220 px, never larger', async () => {
    const big = await drawSightPicture(await webp(600, 300));
    const meta = await sharp(big!).metadata();
    expect(meta.format).toBe('png');
    expect([meta.width, meta.height]).toEqual([220, 110]);
    const small = await drawSightPicture(await webp(50, 40));
    const smallMeta = await sharp(small!).metadata();
    expect([smallMeta.width, smallMeta.height]).toEqual([50, 40]);
  });

  it('answers null for bytes that are no picture', async () => {
    expect(await drawSightPicture(Buffer.from('nope'))).toBeNull();
  });

  it('refuses a file name that is not a hash', async () => {
    const calls: string[] = [];
    const fetcher = ((url: string) => {
      calls.push(url);
      return Promise.resolve(new Response('', { status: 404 }));
    }) as unknown as typeof fetch;
    const controller = new SightPicturesController(config, fetcher);
    for (const file of [
      '../x.png',
      'abc.webp',
      'ABC.png',
      'a'.repeat(17) + '.png',
    ]) {
      await expect(
        controller.picture('tinycos', file, res()),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    await expect(
      controller.picture('Bad World', 'abc.png', res()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(calls).toEqual([]);
  });

  it('serves a drawn sprite and 404s a missing one', async () => {
    const source = await webp(300, 100);
    const fetcher = ((url: string) =>
      Promise.resolve(
        url.endsWith('/sights/abc.webp')
          ? new Response(new Uint8Array(source), { status: 200 })
          : new Response('', { status: 404 }),
      )) as unknown as typeof fetch;
    const headers = res();
    const missing = res();
    const controller = new SightPicturesController(config, fetcher);
    const file = await controller.picture('tinycos', 'abc.png', headers);
    expect(file.getHeaders().type).toBe('image/png');
    expect(headers.set).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=31536000, immutable',
    );
    await expect(
      controller.picture('tinycos', 'zzz.png', missing),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
