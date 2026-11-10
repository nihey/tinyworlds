/**
 * The wordmark as the pictures carry it: a lowercase pixel face on a black enamel plate, "tiny" in
 * paper white and the rest in the world's accent. Nothing here knows which city is being drawn,
 * so the share cards, the front page's card and the videos' overlays all draw the same sign.
 */
export const SIGN = [0x15, 0x17, 0x1a] as const;
export const INK = [0xf4, 0xf2, 0xec] as const;
const SHADOW = [0x0a, 0x0b, 0x0d] as const;

/** A lowercase pixel face for the wordmarks. Rows from the top of the ascender; the last two
 *  rows are the descender. */
export const GLYPHS: Record<string, string[]> = {
  a: ["....", ".###", "#..#", "#..#", ".###", "....", "...."],
  b: ["#...", "###.", "#..#", "#..#", "###.", "....", "...."],
  c: ["....", ".###", "#...", "#...", ".###", "....", "...."],
  d: ["...#", ".###", "#..#", "#..#", ".###", "....", "...."],
  e: ["....", ".##.", "####", "#...", ".###", "....", "...."],
  f: [".##", "#..", "###", "#..", "#..", "...", "..."],
  g: ["....", ".###", "#..#", "#..#", ".###", "...#", "###."],
  h: ["#...", "###.", "#..#", "#..#", "#..#", "....", "...."],
  i: ["#", ".", "#", "#", "#", ".", "."],
  j: [".#", "..", ".#", ".#", ".#", ".#", "#."],
  k: ["#...", "#..#", "###.", "#.#.", "#..#", "....", "...."],
  l: ["#", "#", "#", "#", "#", ".", "."],
  m: [".....", "####.", "#.#.#", "#.#.#", "#.#.#", ".....", "....."],
  n: ["....", "###.", "#..#", "#..#", "#..#", "....", "...."],
  o: ["....", ".##.", "#..#", "#..#", ".##.", "....", "...."],
  p: ["....", "###.", "#..#", "#..#", "###.", "#...", "#..."],
  q: ["....", ".###", "#..#", "#..#", ".###", "...#", "...#"],
  r: ["....", "#.##", "##..", "#...", "#...", "....", "...."],
  s: ["....", ".###", "##..", "..##", "###.", "....", "...."],
  t: [".#.", "###", ".#.", ".#.", ".##", "...", "..."],
  u: ["....", "#..#", "#..#", "#..#", ".###", "....", "...."],
  v: ["...", "#.#", "#.#", "#.#", ".#.", "...", "..."],
  w: [".....", "#.#.#", "#.#.#", "#.#.#", ".#.#.", ".....", "....."],
  x: ["...", "#.#", ".#.", ".#.", "#.#", "...", "..."],
  y: ["....", "#..#", "#..#", "#..#", ".###", "...#", "###."],
  z: ["....", "####", "..#.", ".#..", "####", "....", "...."],
  ",": ["..", "..", "..", "..", ".#", "#.", ".."],
  "-": ["...", "...", "###", "...", "...", "...", "..."],
  ".": [".", ".", ".", ".", "#", ".", "."],
  "/": ["..#", "..#", ".#.", "#..", "#..", "...", "..."],
  " ": ["..", "..", "..", "..", "..", "..", ".."],
};

/** Rows in a glyph: five of body, two of descender. */
export const GLYPH_ROWS = 7;

export const hexRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Paint one pixel; whoever calls decides what the canvas is (RGB, RGBA) and clips to it. */
export type Put = (x: number, y: number, colour: readonly number[]) => void;

function glyphsOf(text: string): string[][] {
  const glyphs = [...text].map((ch) => GLYPHS[ch]);
  if (glyphs.some((g) => !g)) throw new Error(`the pixel face has no glyph for part of "${text}"`);
  return glyphs;
}

/** How wide a line of text is, in glyph units (one unit between letters). */
export function textUnits(text: string): number {
  return glyphsOf(text).reduce((sum, g) => sum + g[0].length + 1, -1);
}

/** Set a line of text with its top-left corner at (x, y); `colourAt` picks each letter's colour. */
export function drawText(
  put: Put,
  text: string,
  x: number,
  y: number,
  unit: number,
  colourAt: (index: number) => readonly number[],
): void {
  let penX = x;
  glyphsOf(text).forEach((glyph, index) => {
    const colour = colourAt(index);
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < glyph[gy].length; gx++) {
        if (glyph[gy][gx] !== "#") continue;
        for (let dy = 0; dy < unit; dy++)
          for (let dx = 0; dx < unit; dx++) put(penX + gx * unit + dx, y + gy * unit + dy, colour);
      }
    }
    penX += (glyph[0].length + 1) * unit;
  });
}

/** A plate with its corners clipped in steps, over a hard pixel shadow. */
export function drawPlate(
  put: Put,
  x: number,
  y: number,
  w: number,
  h: number,
  corner = 4,
  shadow = 5,
): void {
  const fill = (dx: number, dy: number, colour: readonly number[]): void => {
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const cx = Math.min(px, w - 1 - px);
        const cy = Math.min(py, h - 1 - py);
        if (cx < corner && cy < corner && cx + cy < corner) continue;
        put(x + px + dx, y + py + dy, colour);
      }
    }
  };
  if (shadow > 0) fill(shadow, shadow, SHADOW);
  fill(0, 0, SIGN);
}

/** The measures of a wordmark plate. The share cards' own are the defaults. */
export interface SignLayout {
  unit: number;
  padX: number;
  padTop: number;
  padBottom: number;
  corner: number;
  shadow: number;
}
export const CARD_SIGN: SignLayout = { unit: 9, padX: 26, padTop: 20, padBottom: 14, corner: 4, shadow: 5 };
/** How far a card's plate sits from the picture's left and bottom edges. */
export const CARD_SIGN_MARGIN = 34;

/** The plate's size for a wordmark, without its shadow. */
export function signSize(word: string, layout: SignLayout = CARD_SIGN): { width: number; height: number } {
  return {
    width: textUnits(word) * layout.unit + layout.padX * 2,
    height: GLYPH_ROWS * layout.unit + layout.padTop + layout.padBottom,
  };
}

/** Draw a wordmark ("tiny" + the rest in the accent) on its plate, top-left corner at (x, y). */
export function drawSign(
  put: Put,
  word: string,
  accent: readonly number[],
  x: number,
  y: number,
  layout: SignLayout = CARD_SIGN,
): void {
  const { width, height } = signSize(word, layout);
  drawPlate(put, x, y, width, height, layout.corner, layout.shadow);
  drawText(put, word, x + layout.padX, y + layout.padTop, layout.unit, (index) => (index < 4 ? INK : accent));
}
