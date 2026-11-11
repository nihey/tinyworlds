/** The picture an `.ico` file holds, either as a PNG's bytes or as plain RGBA pixels. */
export type IcoPicture =
  { png: Buffer } | { rgba: Buffer; width: number; height: number };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/** The largest side an icon's bitmap may have: the format's own limit. */
const SIDE_MAX = 256;

/** Whether the bytes begin like an `.ico` file. */
export function isIco(file: Buffer): boolean {
  return file.length >= 6 && file.readUInt32LE(0) === 0x00010000;
}

/**
 * Reads the largest picture out of an `.ico` file (the image library does not know the
 * format). An entry is a whole PNG, or a bitmap without its file header: 32, 24, 8, 4 or 1
 * bits a pixel, bottom row first, followed by a 1-bit mask of what is see-through. Null for
 * anything else, or for a file that points outside itself.
 */
export function readIco(file: Buffer): IcoPicture | null {
  if (!isIco(file)) return null;
  const count = file.readUInt16LE(4);
  let best: {
    side: number;
    bits: number;
    size: number;
    offset: number;
  } | null = null;
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    if (at + 16 > file.length) break;
    const entry = {
      side: file[at] || SIDE_MAX,
      bits: file.readUInt16LE(at + 6),
      size: file.readUInt32LE(at + 8),
      offset: file.readUInt32LE(at + 12),
    };
    if (entry.offset + entry.size > file.length || entry.size < 40) continue;
    if (
      !best ||
      entry.side > best.side ||
      (entry.side === best.side && entry.bits > best.bits)
    )
      best = entry;
  }
  if (!best) return null;
  const data = file.subarray(best.offset, best.offset + best.size);
  if (data.subarray(0, 4).equals(PNG_SIGNATURE)) return { png: data };
  return readBitmap(data);
}

/** A bitmap as an icon holds it: a 40-byte header, a palette, the pixels, then the mask. */
function readBitmap(data: Buffer): IcoPicture | null {
  const headerSize = data.readUInt32LE(0);
  if (headerSize < 40 || headerSize > data.length) return null;
  const width = data.readInt32LE(4);
  // the height counts the pixels and the mask under them
  const height = Math.abs(data.readInt32LE(8)) / 2;
  const bits = data.readUInt16LE(14);
  const compression = data.readUInt32LE(16);
  if (
    compression !== 0 ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > SIDE_MAX ||
    height > SIDE_MAX ||
    ![1, 4, 8, 24, 32].includes(bits)
  )
    return null;

  const paletteSize = bits <= 8 ? data.readUInt32LE(32) || 1 << bits : 0;
  const paletteAt = headerSize;
  const pixelsAt = paletteAt + paletteSize * 4;
  // rows are padded to four bytes
  const rowBytes = Math.ceil((width * bits) / 32) * 4;
  const maskRowBytes = Math.ceil(width / 32) * 4;
  const maskAt = pixelsAt + rowBytes * height;
  if (maskAt > data.length) return null;
  const hasMask = maskAt + maskRowBytes * height <= data.length;

  const rgba = Buffer.alloc(width * height * 4);
  let opaque = false;
  for (let y = 0; y < height; y++) {
    // bottom row first
    const row = pixelsAt + (height - 1 - y) * rowBytes;
    const maskRow = maskAt + (height - 1 - y) * maskRowBytes;
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4;
      let b: number, g: number, r: number;
      let a = 255;
      if (bits === 32) {
        const at = row + x * 4;
        [b, g, r, a] = [data[at], data[at + 1], data[at + 2], data[at + 3]];
      } else if (bits === 24) {
        const at = row + x * 3;
        [b, g, r] = [data[at], data[at + 1], data[at + 2]];
      } else {
        const bit = x * bits;
        const byte = data[row + (bit >> 3)];
        const index = (byte >> (8 - bits - (bit & 7))) & ((1 << bits) - 1);
        if (index >= paletteSize) return null;
        const at = paletteAt + index * 4;
        [b, g, r] = [data[at], data[at + 1], data[at + 2]];
      }
      if (bits !== 32 && hasMask) {
        const masked = (data[maskRow + (x >> 3)] >> (7 - (x & 7))) & 1;
        if (masked) a = 0;
      }
      if (a !== 0) opaque = true;
      rgba[out] = r;
      rgba[out + 1] = g;
      rgba[out + 2] = b;
      rgba[out + 3] = a;
    }
  }
  // a 32-bit icon whose alpha is all zero was written without one: its mask says what shows
  if (bits === 32 && !opaque) {
    for (let y = 0; y < height; y++) {
      const maskRow = maskAt + (height - 1 - y) * maskRowBytes;
      for (let x = 0; x < width; x++) {
        const masked =
          hasMask && (data[maskRow + (x >> 3)] >> (7 - (x & 7))) & 1;
        rgba[(y * width + x) * 4 + 3] = masked ? 0 : 255;
      }
    }
  }
  return { rgba, width, height };
}
