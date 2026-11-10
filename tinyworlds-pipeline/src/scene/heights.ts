import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { toUtm } from "../geom/utm.js";
import type { HeightIndex } from "../sources/openBuildings.js";

/**
 * Building heights for a city where nobody mapped them, read off the satellite height raster the
 * open-buildings source downloaded.
 *
 * The raster is a 4 m grid, so a house is a handful of pixels and its edges are blurred into the
 * yard: the median inside the footprint is taken, not the peak. The raster also reads
 * systematically high. Against the ~4,000 buildings of Ribeirão Preto whose floors are mapped,
 * its median says 5.5 m for a single storey and 36 m for eleven floors, so the reading goes
 * through a correction curve fitted to those.
 */
const CURVE: [number, number][] = [
  [0, 3],
  [4, 3.2],
  [5.5, 3.8],
  [7, 6.4],
  [9, 8],
  [11, 12],
  [17, 18.5],
  [36, 35],
  [52, 48],
  [60, 56],
  [80, 70],
  [86, 80],
  [96, 92],
];

/** Raster reading (m) → building height (m), along the correction curve. */
export function correct(reading: number): number {
  if (reading <= CURVE[0][0]) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) {
    const [x1, y1] = CURVE[i];
    if (reading <= x1) {
      const [x0, y0] = CURVE[i - 1];
      return y0 + ((reading - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return CURVE[CURVE.length - 1][1];
}

export interface HeightSampler {
  /** Height (m) of the building whose outline is this lon/lat ring, or null where the raster has nothing. */
  estimate(ring: Float64Array): number | null;
}

const NODATA = 255;

export function loadHeights(rawDir: string): HeightSampler | null {
  const dir = path.join(rawDir, "heights");
  const indexFile = path.join(dir, "index.json");
  if (!fs.existsSync(indexFile)) return null;
  const index = JSON.parse(fs.readFileSync(indexFile, "utf8")) as HeightIndex;
  const tiles = index.tiles.map((t) => ({
    ...t,
    data: zlib.gunzipSync(fs.readFileSync(path.join(dir, t.file))),
  }));
  const { res } = index;

  /** Raster reading at a UTM point, or -1. Tiles of neighbouring S2 cells overlap; the first with data wins. */
  const at = (x: number, y: number): number => {
    for (const t of tiles) {
      const px = Math.floor((x - t.x0) / res);
      const py = Math.floor((t.y1 - y) / res);
      if (px < 0 || py < 0 || px >= t.width || py >= t.height) continue;
      const v = t.data[py * t.width + px];
      if (v !== NODATA) return v / 2;
    }
    return -1;
  };

  let utm = new Float64Array(256);
  const values: number[] = [];
  return {
    estimate(ring) {
      const n = ring.length / 2;
      if (utm.length < ring.length) utm = new Float64Array(ring.length);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < n; i++) {
        const [x, y] = toUtm(ring[i * 2], ring[i * 2 + 1], index.zone, index.south);
        utm[i * 2] = x;
        utm[i * 2 + 1] = y;
        cx += x / n;
        cy += y / n;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      values.length = 0;
      // every pixel centre inside the outline
      for (let y = Math.floor(minY / res) * res + res / 2; y <= maxY; y += res) {
        for (let x = Math.floor(minX / res) * res + res / 2; x <= maxX; x += res) {
          let inside = false;
          for (let i = 0, j = n - 1; i < n; j = i++) {
            const yi = utm[i * 2 + 1];
            const yj = utm[j * 2 + 1];
            if (yi > y !== yj > y && x < ((utm[j * 2] - utm[i * 2]) * (y - yi)) / (yj - yi) + utm[i * 2])
              inside = !inside;
          }
          if (!inside) continue;
          const v = at(x, y);
          if (v >= 0) values.push(v);
        }
      }
      // too small to hold pixel centres: read the middle
      if (values.length < 3) {
        const v = at(cx, cy);
        if (v >= 0) values.push(v);
      }
      if (values.length === 0) return null;
      values.sort((a, b) => a - b);
      return correct(values[Math.floor(values.length / 2)]);
    },
  };
}
