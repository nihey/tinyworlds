import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CITIES } from "../cities/index.js";
import { PKG_ROOT } from "../env.js";
import { makeProjection, type Geo } from "../projection.js";
import { CARD } from "./card.js";
import { cutPlate, type PlateManifest } from "./plate.js";
import { GLYPH_ROWS, INK, drawPlate, drawText, hexRgb, textUnits } from "./sign.js";

/**
 * The front page's share card: not one city but several, each a leaning slice of its own share
 * card, under the site's wordmark. It is cut from the worlds' finished tiles, so it needs their
 * data folders (the viewer's public/data) and no scene.
 */

/** The cities on the card, left to right: real places only, in the front page's order. */
export const HOME_CARD_WORLDS = ["tinynyc", "tinyrao", "tinyorl", "tinyfte", "tinyvlc", "tinylas"] as const;

/** The front page's accent: taxi yellow, as in the viewer's stylesheet. */
const HOME_ACCENT = hexRgb("#f7c21b");
const PAPER_DIM = [0xb4, 0xb1, 0xa8] as const;
const GUTTER = [0x15, 0x17, 0x1a] as const;

const NAME = "tinyworlds";
const TAGLINE = "whole cities, pocket-sized";

/**
 * A city whose own card is too wide a view to read in a slice gets a closer one here: New York's
 * card is all of Central Park; its slice is Midtown, round the Empire State Building.
 */
const CLOSER: Record<string, { lon: number; lat: number; shrink: number }> = {
  tinynyc: { lon: -73.9857, lat: 40.7484, shrink: 3 },
};

/** How far the slices lean: px across for every px down. Little enough that the first and the
 *  last city keep a slice of their own rather than a corner. */
const LEAN = 1 / 3;
const GUTTER_PX = 6;

export async function renderHomeCard(opts: { out?: string; data?: string; log?: (m: string) => void } = {}) {
  const log = opts.log ?? ((m: string) => console.log(m));
  const { width, height } = CARD;
  const data = path.resolve(opts.data ?? path.join(PKG_ROOT, "../tinyworlds-frontend/public/data"));
  const out = path.resolve(
    opts.out ?? path.join(PKG_ROOT, "../tinyworlds-frontend/public/og", `${NAME}.jpg`),
  );

  // each city's own share card picture, without its sign
  const plates: Buffer[] = [];
  for (const id of HOME_CARD_WORLDS) {
    const city = CITIES[id];
    const dir = path.join(data, id);
    const file = path.join(dir, "manifest.json");
    if (!fs.existsSync(file)) throw new Error(`the front page's card needs ${id}'s tiles: no ${file}`);
    const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as PlateManifest & { geo: Geo };
    const view = CLOSER[id] ?? city.card;
    const [cx, cy] = makeProjection(manifest.geo).toMap(view.lon, view.lat);
    const plate = await cutPlate(dir, manifest, { cx, cy, width, height, shrink: view.shrink });
    plates.push(await plate.removeAlpha().raw().toBuffer());
  }

  // lay the slices: along a row, a slice is `slice` px wide; down the card it drifts left
  const rgb = new Uint8Array(width * height * 3);
  const slice = (width + height * LEAN) / plates.length;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x + y * LEAN;
      const index = Math.min(plates.length - 1, Math.floor(u / slice));
      const o = (y * width + x) * 3;
      const edge = u - index * slice;
      if (index > 0 && edge < GUTTER_PX) {
        rgb.set(GUTTER, o);
        continue;
      }
      // the city's middle sits in the middle of its slice
      const middle = (index + 0.5) * slice - (height / 2) * LEAN;
      const sx = Math.min(width - 1, Math.max(0, Math.round(x - middle + width / 2)));
      const s = (y * width + sx) * 3;
      rgb[o] = plates[index][s];
      rgb[o + 1] = plates[index][s + 1];
      rgb[o + 2] = plates[index][s + 2];
    }
  }

  // the sign, lower left like every card's, larger, with what the site is under its name
  const put = (x: number, y: number, c: readonly number[]): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    rgb.set(c, (y * width + x) * 3);
  };
  const unit = 14;
  const small = 5;
  const padX = 40;
  const padTop = 32;
  const gap = 16;
  const padBottom = 20;
  const margin = 34;
  const boxW = Math.max(textUnits(NAME) * unit, textUnits(TAGLINE) * small) + padX * 2;
  const boxH = padTop + GLYPH_ROWS * unit + gap + GLYPH_ROWS * small + padBottom;
  const boxX = margin;
  const boxY = height - margin - boxH;
  drawPlate(put, boxX, boxY, boxW, boxH, 6, 7);
  drawText(put, NAME, boxX + padX, boxY + padTop, unit, (i) => (i < 4 ? INK : HOME_ACCENT));
  drawText(put, TAGLINE, boxX + padX, boxY + padTop + GLYPH_ROWS * unit + gap, small, () => PAPER_DIM);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const info = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(out);
  log(`card: ${path.relative(process.cwd(), out)} ${width}×${height}, ${(info.size / 1000).toFixed(0)} kB`);
}
