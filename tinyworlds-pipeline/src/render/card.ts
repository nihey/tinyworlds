import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CITY, DIRS, PKG_ROOT } from "../config.js";
import { makeProjection } from "../projection.js";
import { binRect } from "./bin.js";
import { ChunkRenderer } from "./chunk.js";
import { toRgba } from "./encode.js";
import { loadScene } from "./scene.js";

/**
 * The share card: the picture a link to the map unfurls with (Open Graph, 1200 × 630). A piece
 * of the map is rendered at full size, averaged down, and signed with the wordmark.
 */
export const CARD = { width: 1200, height: 630 } as const;

/** The page background by day: what shows where the map has dissolved into fog. */
const PAPER = "#e9e6df";
const SIGN = [0x15, 0x17, 0x1a] as const;
const INK = [0xf4, 0xf2, 0xec] as const;

/** A lowercase pixel face, just the letters the wordmarks need. Rows from the top of the ascender;
 *  the last two rows are the descender. */
const GLYPHS: Record<string, string[]> = {
  t: [".#.", "###", ".#.", ".#.", ".##", "...", "..."],
  i: ["#", ".", "#", "#", "#", ".", "."],
  n: ["....", "###.", "#..#", "#..#", "#..#", "....", "...."],
  y: ["....", "#..#", "#..#", "#..#", ".###", "...#", "###."],
  c: ["....", ".###", "#...", "#...", ".###", "....", "...."],
  r: ["....", "#.##", "##..", "#...", "#...", "....", "...."],
  a: ["....", ".###", "#..#", "#..#", ".###", "....", "...."],
  o: ["....", ".##.", "#..#", "#..#", ".##.", "....", "...."],
};

const hexRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Draw the wordmark on a dark plate in the lower left: "tiny" in paper white, the city in its accent. */
function sign(rgb: Uint8Array, width: number, height: number): void {
  const unit = 9;
  const word = CITY.id;
  const glyphs = [...word].map((ch) => GLYPHS[ch]);
  if (glyphs.some((g) => !g)) throw new Error(`the card's pixel face has no glyph for part of "${word}"`);
  const textW = glyphs.reduce((sum, g) => sum + g[0].length + 1, -1) * unit;
  const textH = 7 * unit;
  const padX = 26;
  const padTop = 20;
  const padBottom = 14;
  const margin = 34;
  const boxW = textW + padX * 2;
  const boxH = textH + padTop + padBottom;
  const boxX = margin;
  const boxY = height - margin - boxH;
  const put = (x: number, y: number, c: readonly number[]): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    rgb[i] = c[0];
    rgb[i + 1] = c[1];
    rgb[i + 2] = c[2];
  };
  // the plate, corners clipped by one unit, with a hard pixel shadow
  const corner = 4;
  const plate = (dx: number, dy: number, c: readonly number[]): void => {
    for (let y = 0; y < boxH; y++) {
      for (let x = 0; x < boxW; x++) {
        const cx = Math.min(x, boxW - 1 - x);
        const cy = Math.min(y, boxH - 1 - y);
        if (cx < corner && cy < corner && cx + cy < corner) continue;
        put(boxX + x + dx, boxY + y + dy, c);
      }
    }
  };
  plate(5, 5, [0x0a, 0x0b, 0x0d]);
  plate(0, 0, SIGN);
  const accent = hexRgb(CITY.accent);
  let penX = boxX + padX;
  [...word].forEach((_, index) => {
    const glyph = glyphs[index];
    const colour = index < 4 ? INK : accent;
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < glyph[gy].length; gx++) {
        if (glyph[gy][gx] !== "#") continue;
        for (let y = 0; y < unit; y++)
          for (let x = 0; x < unit; x++) put(penX + gx * unit + x, boxY + padTop + gy * unit + y, colour);
      }
    }
    penX += (glyph[0].length + 1) * unit;
  });
}

export async function renderCard(opts: { out?: string; log?: (m: string) => void } = {}): Promise<void> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const out = path.resolve(
    opts.out ?? path.join(PKG_ROOT, "../tinyworlds-frontend/public/og", `${CITY.id}.jpg`),
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { lon, lat, shrink } = CITY.card;
  const { scene } = loadScene(DIRS.scene);
  const [cx, cy] = makeProjection(scene.geo).toMap(lon, lat);
  const w = CARD.width * shrink;
  const h = CARD.height * shrink;
  const rect = { x0: Math.round(cx - w / 2), y0: Math.round(cy - h / 2), w, h };
  const indices = new ChunkRenderer(scene).render(binRect(scene, rect));
  const rgba = toRgba(indices);
  if (!rgba) throw new Error("the card's rectangle is entirely in the fog");

  const small = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .flatten({ background: PAPER })
    .resize(CARD.width, CARD.height, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
  const rgb = new Uint8Array(small.buffer, small.byteOffset, small.length);
  sign(rgb, CARD.width, CARD.height);
  const info = await sharp(rgb, { raw: { width: CARD.width, height: CARD.height, channels: 3 } })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(out);
  log(
    `card: ${path.relative(process.cwd(), out)} ${CARD.width}×${CARD.height}, ${(info.size / 1000).toFixed(0)} kB`,
  );
}
