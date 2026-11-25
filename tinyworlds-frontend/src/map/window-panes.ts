/** The glass ramps in the lossless city tiles, including the city-specific blue and teal glass. */
const GLASS = [
  0x62a0c8, 0x55a9aa, 0x41678a, 0x70b19f, 0x927a5b, 0x414851, 0xaabfce, 0x559a9e, 0x739eb7,
  0x8799a1, 0x7894a0,
];

// The tile rasterizer paints windows in these shades. Index by RGB bytes so the
// inner loop takes one lookup, even on a tile covered in water or vegetation.
const glassShades = new Uint8Array(1 << 21);
// Coarser WebPs average and compress the glass and its frame. Quantised RGB
// neighbourhoods are only a first pass there; a pane must also sit between two
// brighter bands of masonry in its own column.
const distantGlass = new Uint8Array(32 ** 3);
for (const base of GLASS) {
  const rgb = [base >> 16, (base >> 8) & 255, base & 255];
  for (const [mul, tint] of [
    [0.44, 0.4],
    [0.58, 0.28],
    [0.72, 0.16],
    [0.87, 0.06],
    [1, 0],
  ]) {
    const [r, g, b] = rgb.map((v, i) => Math.round(v * mul * (1 - tint) + [36, 40, 86][i] * tint));
    const key = (r << 16) | (g << 8) | b;
    glassShades[key >> 3] |= 1 << (key & 7);
    if (mul > 0.87) continue;
    for (let qr = Math.max(0, (r - 22) >> 3); qr <= Math.min(31, (r + 22) >> 3); qr++) {
      for (let qg = Math.max(0, (g - 22) >> 3); qg <= Math.min(31, (g + 22) >> 3); qg++) {
        for (let qb = Math.max(0, (b - 22) >> 3); qb <= Math.min(31, (b + 22) >> 3); qb++) {
          const dr = qr * 8 + 4 - r,
            dg = qg * 8 + 4 - g,
            db = qb * 8 + 4 - b;
          if (dr * dr + dg * dg + db * db <= 22 ** 2) distantGlass[(qr << 10) | (qg << 5) | qb] = 1;
        }
      }
    }
  }
}

// Mostly tungsten and amber, with the occasional cooler office light.
const BULBS = [
  [255, 199, 113],
  [255, 222, 155],
  [247, 172, 96],
  [255, 234, 193],
  [194, 223, 237],
];

function roomHash(x: number, y: number): number {
  let n = Math.imul(x, 0x1f1f1f1f) ^ Math.imul(y, 0x6c8e9cf5);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  return (n ^ (n >>> 13)) >>> 0;
}

/**
 * Extract small, connected panes of one glass shade. Broad areas of glass (roofs,
 * blank walls) and continuous outlines are left alone. Coordinates are native map
 * pixels, so dragging, tile eviction and selecting a landmark keep the lights still.
 */
export function windowPaneMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  left: number,
  top: number,
  step: number,
): Uint8ClampedArray<ArrayBuffer> | null {
  const size = width * height;
  const glass = new Uint32Array(size);
  const coarse = step > 1;
  const reach = Math.ceil(6 / step);
  const luma = (o: number) => (rgba[o] + rgba[o + 1] * 2 + rgba[o + 2]) / 4;
  const frameLuma = (o: number) => {
    const r = rgba[o],
      g = rgba[o + 1],
      b = rgba[o + 2];
    // Leaves and open water often border a dark pixel too. A window needs its
    // brighter frame on both sides, even at the edge of a park or island.
    if (rgba[o + 3] !== 255 || (g > r + 7 && g > b + 6) || (g > r + 23 && b > r + 35)) return 0;
    return luma(o);
  };
  for (let i = 0; i < size; i++) {
    const o = 4 * i;
    if (rgba[o + 3] !== 255) continue;
    const r = rgba[o],
      g = rgba[o + 1],
      b = rgba[o + 2];
    if (!coarse) {
      const key = (r << 16) | (g << 8) | b;
      if (glassShades[key >> 3] & (1 << (key & 7))) glass[i] = key;
      continue;
    }
    if (
      !distantGlass[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)] ||
      i < reach * width ||
      i >= size - reach * width
    )
      continue;
    const mid = luma(o);
    let above = 0,
      below = 0;
    for (let d = 1; d <= reach; d++) {
      const dy = d * width * 4;
      above = Math.max(above, frameLuma(o - dy));
      below = Math.max(below, frameLuma(o + dy));
    }
    if (Math.min(above, below) - mid > 14) glass[i] = 1;
  }

  let out: Uint8ClampedArray<ArrayBuffer> | null = null;
  const queue = new Int32Array(size);
  for (let first = 0; first < size; first++) {
    const shade = glass[first];
    if (!shade) continue;
    let count = 1;
    queue[0] = first;
    glass[first] = 0;
    let x0 = first % width,
      x1 = x0;
    const y0 = Math.floor(first / width);
    let y1 = y0;
    const visit = (i: number) => {
      if (glass[i] !== shade) return;
      glass[i] = 0;
      queue[count++] = i;
    };
    for (let q = 0; q < count; q++) {
      const i = queue[q],
        x = i % width,
        y = Math.floor(i / width);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      if (x > 0) visit(i - 1);
      if (x + 1 < width) visit(i + 1);
      if (y > 0) visit(i - width);
      if (y + 1 < height) visit(i + width);
    }

    const w = x1 - x0 + 1,
      h = y1 - y0 + 1;
    // An isometric ribbon steps up or down the wall. Its area per column is
    // the pane height even when its bounding box includes several floors.
    const paneHeight = (count * step) / w;
    if (x0 === 0 || x1 === width - 1 || y0 === 0 || y1 === height - 1) continue;
    if (
      w * step > 28 ||
      h * step > 23 ||
      paneHeight < 1.8 ||
      paneHeight > 8 ||
      count * step * step < 4 ||
      count < w * h * 0.14
    )
      continue;

    const room = roomHash(
      Math.floor((left + ((x0 + x1 + 1) * step) / 2) / 5),
      Math.floor((top + ((y0 + y1 + 1) * step) / 2) / 6),
    );
    if (room % 100 >= 41) continue;
    const bulb = BULBS[(room >>> 8) % BULBS.length];
    const alpha = Math.round((180 + ((room >>> 16) % 76)) * Math.min(1, 1.7 / step));
    out ??= new Uint8ClampedArray(size * 4);
    for (let q = 0; q < count; q++) {
      const o = queue[q] * 4;
      out[o] = bulb[0];
      out[o + 1] = bulb[1];
      out[o + 2] = bulb[2];
      out[o + 3] = alpha;
    }
  }
  return out;
}
