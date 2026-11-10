/**
 * Halve an RGBA image. Alpha stays binary: a 2×2 block survives if at least two of its pixels
 * are drawn, and takes the average colour of the drawn ones.
 */
export function halve(src: Uint8Array, width: number, height: number): Uint8Array {
  const w = width >> 1;
  const h = height >> 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((y * 2 + dy) * width + x * 2 + dx) * 4;
          if (src[i + 3] === 0) continue;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          n++;
        }
      }
      if (n < 2) continue;
      const o = (y * w + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Bitset of which tiles exist: row-major, bit (tx + ty·cols), least significant bit first, base64. */
export function packBits(present: (tx: number, ty: number) => boolean, cols: number, rows: number): string {
  const bytes = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (!present(tx, ty)) continue;
      const bit = tx + ty * cols;
      bytes[bit >> 3] |= 1 << (bit & 7);
    }
  }
  return Buffer.from(bytes).toString("base64");
}
