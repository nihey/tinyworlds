import sharp from "sharp";
import { buildPalette, TRANSPARENT } from "./palette.js";

const PALETTE = buildPalette().rgba;

/** Palette indices → RGBA bytes. Returns null when every pixel is transparent. */
export function toRgba(indices: Uint16Array, into?: Uint8Array): Uint8Array | null {
  const out = into ?? new Uint8Array(indices.length * 4);
  const px = new Uint32Array(out.buffer, out.byteOffset, indices.length);
  let any = false;
  for (let i = 0; i < indices.length; i++) {
    const c = indices[i];
    if (c === TRANSPARENT) px[i] = 0;
    else {
      px[i] = PALETTE[c];
      any = true;
    }
  }
  return any ? out : null;
}

export async function writePng(
  file: string,
  rgba: Uint8Array,
  width: number,
  height: number,
  zoom = 1,
): Promise<void> {
  let image = sharp(rgba, { raw: { width, height, channels: 4 } });
  if (zoom > 1) image = image.resize(width * zoom, height * zoom, { kernel: "nearest" });
  await image.png({ compressionLevel: 6 }).toFile(file);
}

export async function writeWebp(
  file: string,
  rgba: Uint8Array,
  width: number,
  height: number,
): Promise<number> {
  const info = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .webp({ lossless: true, effort: 4 })
    .toFile(file);
  return info.size;
}
