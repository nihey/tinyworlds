import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions, type Sharp } from "sharp";

/**
 * Pictures cut from a world's finished tiles (the viewer's data folder) rather than rendered
 * from its scene: any world can be read this way, by any process, whichever city that process
 * is drawing. The front page's share card and the videos are made of these.
 */

/** The page background by day: what shows where the map has dissolved into fog. */
export const PAPER = "#e9e6df";

/** What a plate needs of a world's manifest.json. */
export interface PlateManifest {
  tileSize: number;
  origin: { x: number; y: number };
  levels: { z: number; cols: number; rows: number }[];
}

export interface PlateFrame {
  /** the middle of the picture, map px */
  cx: number;
  cy: number;
  /** the picture's size, px */
  width: number;
  height: number;
  /** how many map px one pixel of the picture stands for */
  shrink: number;
}

/** The pyramid level whose pixels are closest to `shrink` map px each without being coarser. */
export function levelFor(manifest: PlateManifest, shrink: number): { z: number; rest: number } {
  const deepest = manifest.levels.length - 1;
  const z = Math.min(deepest, Math.max(0, Math.floor(Math.log2(shrink))));
  return { z, rest: shrink / 2 ** z };
}

/**
 * Cut a picture out of a world's tiles (`dir` is its data folder, the one with manifest.json).
 * Tiles of the nearest finer level are laid side by side and averaged down the rest of the way;
 * what is off the map is fog.
 */
export async function cutPlate(dir: string, manifest: PlateManifest, frame: PlateFrame): Promise<Sharp> {
  const T = manifest.tileSize;
  const { z, rest } = levelFor(manifest, frame.shrink);
  const level = manifest.levels[z];
  const span = 2 ** z;
  // the rectangle in level px
  const w = Math.round(frame.width * rest);
  const h = Math.round(frame.height * rest);
  const left = Math.round((frame.cx - manifest.origin.x) / span - w / 2);
  const top = Math.round((frame.cy - manifest.origin.y) / span - h / 2);

  const tiles: OverlayOptions[] = [];
  for (let ty = Math.floor(top / T); ty <= Math.floor((top + h - 1) / T); ty++) {
    for (let tx = Math.floor(left / T); tx <= Math.floor((left + w - 1) / T); tx++) {
      if (tx < 0 || ty < 0 || tx >= level.cols || ty >= level.rows) continue;
      const file = path.join(dir, "tiles", String(z), `${tx}_${ty}.webp`);
      if (!fs.existsSync(file)) continue;
      // crop the tile to the rectangle: sharp refuses overlays that stick out
      const x0 = Math.max(left, tx * T);
      const y0 = Math.max(top, ty * T);
      const x1 = Math.min(left + w, (tx + 1) * T);
      const y1 = Math.min(top + h, (ty + 1) * T);
      const input = await sharp(file)
        .extract({ left: x0 - tx * T, top: y0 - ty * T, width: x1 - x0, height: y1 - y0 })
        .png()
        .toBuffer();
      tiles.push({ input, left: x0 - left, top: y0 - top });
    }
  }
  const mosaic = await sharp({ create: { width: w, height: h, channels: 3, background: PAPER } })
    .composite(tiles)
    .png()
    .toBuffer();
  return rest === 1
    ? sharp(mosaic)
    : sharp(mosaic).resize(frame.width, frame.height, { kernel: "lanczos3", fit: "fill" });
}
