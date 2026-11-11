import sharp from 'sharp';
import { readIco } from './ico.js';
import {
  drawIcon,
  drawPicture,
  ICON_SIDE,
  PICTURE_SIZE,
} from './link-images.js';

const solid = (
  width: number,
  height: number,
  background = { r: 200, g: 40, b: 40, alpha: 1 },
) => sharp({ create: { width, height, channels: 4, background } });

/** An `.ico` file with one entry: a PNG, or a 32-bit bitmap of one colour. */
function ico(side: number, entry: Buffer): Buffer {
  const dir = Buffer.alloc(22);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(1, 4);
  dir[6] = side;
  dir[7] = side;
  dir.writeUInt16LE(1, 10);
  dir.writeUInt16LE(32, 12);
  dir.writeUInt32LE(entry.length, 14);
  dir.writeUInt32LE(22, 18);
  return Buffer.concat([dir, entry]);
}

function bitmap32(side: number, [r, g, b, a]: number[]): Buffer {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(side, 4);
  header.writeInt32LE(side * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(side * side * 4);
  for (let i = 0; i < side * side; i++) pixels.set([b, g, r, a], i * 4);
  const mask = Buffer.alloc(Math.ceil(side / 32) * 4 * side);
  return Buffer.concat([header, pixels, mask]);
}

describe('drawPicture', () => {
  it("cuts a share card down to the card's shape, as WebP", async () => {
    const drawn = await drawPicture(await solid(1200, 630).jpeg().toBuffer());
    expect(drawn).toMatchObject(PICTURE_SIZE);
    const meta = await sharp(drawn?.bytes).metadata();
    expect(meta.format).toBe('webp');
    expect(drawn?.bytes.length).toBeLessThan(20_000);
  });

  it('cuts a tall picture around its middle', async () => {
    const drawn = await drawPicture(await solid(600, 1800).png().toBuffer());
    expect(drawn).toMatchObject(PICTURE_SIZE);
  });

  it('never enlarges a small one', async () => {
    const drawn = await drawPicture(await solid(300, 100).png().toBuffer());
    expect(drawn?.width).toBeLessThanOrEqual(300);
    expect(drawn?.height).toBeLessThanOrEqual(100);
  });

  it('carries none of the metadata the source had', async () => {
    const source = await solid(800, 420)
      .withExif({ IFD0: { Copyright: 'someone', Artist: 'ana@example.com' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const drawn = await drawPicture(source);
    expect((await sharp(drawn?.bytes).metadata()).exif).toBeUndefined();
  });

  it.each([
    ['a tracking pixel', () => solid(1, 1).png().toBuffer()],
    ['a thin spacer', () => solid(600, 10).png().toBuffer()],
    ['a page of HTML', () => Promise.resolve(Buffer.from('<html>no</html>'))],
    ['nothing', () => Promise.resolve(Buffer.alloc(0))],
    [
      'a picture cut short',
      async () => (await solid(800, 420).png().toBuffer()).subarray(0, 60),
    ],
  ])('says null for %s', async (_what, bytes) => {
    expect(await drawPicture(await bytes())).toBeNull();
  });

  it('refuses a picture with more pixels than it will read', async () => {
    // 8000 × 6000: a few kilobytes as a file, 48 million pixels once opened
    const bomb = await solid(8000, 6000)
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(300_000);
    expect(await drawPicture(bomb)).toBeNull();
  });
});

describe('drawIcon', () => {
  it('fits an icon within its side, as WebP', async () => {
    const drawn = await drawIcon(await solid(180, 180).png().toBuffer());
    expect(drawn).toMatchObject({ width: ICON_SIDE, height: ICON_SIDE });
    expect((await sharp(drawn?.bytes).metadata()).format).toBe('webp');
  });

  it('leaves a small icon the size it is', async () => {
    const drawn = await drawIcon(await solid(16, 16).png().toBuffer());
    expect(drawn).toMatchObject({ width: 16, height: 16 });
  });

  it('draws a drawing', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#f7c21b"/></svg>',
    );
    const drawn = await drawIcon(svg);
    expect(drawn?.width).toBeGreaterThan(16);
    expect(drawn?.width).toBeLessThanOrEqual(ICON_SIDE);
  });

  it('reads an .ico that holds a PNG', async () => {
    const drawn = await drawIcon(ico(48, await solid(48, 48).png().toBuffer()));
    expect(drawn).toMatchObject({ width: 48, height: 48 });
  });

  it('reads an .ico that holds a bitmap, colours the right way round', async () => {
    const drawn = await drawIcon(ico(32, bitmap32(32, [10, 200, 30, 255])));
    expect(drawn).toMatchObject({ width: 32, height: 32 });
    // an opaque WebP comes back without an alpha channel: ask for one
    const { data } = await sharp(drawn?.bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 4)]).toEqual([10, 200, 30, 255]);
  });

  it('says null for what is not an icon', async () => {
    expect(await drawIcon(Buffer.from('not an icon at all'))).toBeNull();
    expect(await drawIcon(ico(32, Buffer.alloc(40)))).toBeNull();
  });
});

describe('readIco', () => {
  it('takes the largest entry', async () => {
    const small = bitmap32(16, [1, 2, 3, 255]);
    const large = await solid(64, 64).png().toBuffer();
    const dir = Buffer.alloc(6 + 32);
    dir.writeUInt16LE(1, 2);
    dir.writeUInt16LE(2, 4);
    const entry = (at: number, side: number, size: number, offset: number) => {
      dir[at] = side;
      dir[at + 1] = side;
      dir.writeUInt16LE(32, at + 6);
      dir.writeUInt32LE(size, at + 8);
      dir.writeUInt32LE(offset, at + 12);
    };
    entry(6, 16, small.length, 38);
    entry(22, 64, large.length, 38 + small.length);
    const picture = readIco(Buffer.concat([dir, small, large]));
    expect(picture && 'png' in picture).toBe(true);
  });

  it('says null for a file that points outside itself, and for other files', () => {
    const lying = ico(32, bitmap32(32, [0, 0, 0, 255]));
    lying.writeUInt32LE(10_000_000, 14);
    expect(readIco(lying)).toBeNull();
    expect(readIco(Buffer.from('GIF89a'))).toBeNull();
    expect(readIco(Buffer.alloc(3))).toBeNull();
  });

  it('reads a 32-bit bitmap written without alpha as opaque where its mask says', () => {
    const picture = readIco(ico(16, bitmap32(16, [9, 8, 7, 0])));
    expect(
      picture && 'rgba' in picture && [...picture.rgba.subarray(0, 4)],
    ).toEqual([9, 8, 7, 255]);
  });

  it('reads a bitmap with a palette', () => {
    // 2 × 2, one bit a pixel: a palette of two, rows padded to four bytes, then the mask
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(2, 4);
    header.writeInt32LE(4, 8);
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(1, 14);
    const palette = Buffer.from([0, 0, 255, 0, 255, 0, 0, 0]); // red, then blue (BGR0)
    const pixels = Buffer.from([0b01000000, 0, 0, 0, 0b10000000, 0, 0, 0]);
    const mask = Buffer.from([0, 0, 0, 0, 0b01000000, 0, 0, 0]);
    const picture = readIco(
      ico(2, Buffer.concat([header, palette, pixels, mask])),
    );
    if (!picture || !('rgba' in picture)) throw new Error('not read');
    // the file's last row is the picture's first: blue, then red hidden by the mask
    expect([...picture.rgba]).toEqual([
      0, 0, 255, 255, 255, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 255,
    ]);
  });
});
