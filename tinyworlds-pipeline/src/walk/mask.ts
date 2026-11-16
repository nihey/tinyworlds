/**
 * A square's land and water, as a mask of 100 × 100 cells of 2 m from the south-west corner
 * (bit x + 100·y, LSB-first, 1 = water). The ground's polygons are painted in the map's own
 * order, lowest rank first and by the scene's index among equals, each even-odd, at the cells'
 * centres: water kinds paint water, every other kind land. Nothing painted is water.
 */
import { isWater } from "../scene/kinds.js";
import { CELL } from "./grid.js";

const SIDE = 100;
const CELL_M = CELL / SIDE;

export interface MaskPolygon {
  kind: number;
  order: number;
  /** Rings in world metres (east, north). */
  rings: number[][];
}

/** `[0]` all land, `[1]` all water, else `[2, …1250 bytes]`. */
export function maskOf(polys: MaskPolygon[], i: number, j: number, paintRank: Float32Array): Uint8Array {
  const water = new Uint8Array(SIDE * SIDE).fill(1);
  const e0 = i * CELL;
  const n0 = j * CELL;
  const sorted = [...polys].sort((a, b) => paintRank[a.kind] - paintRank[b.kind] || a.order - b.order);
  const xs: number[] = [];

  for (const poly of sorted) {
    const value = isWater(poly.kind) ? 1 : 0;
    // only the rows the polygon reaches
    let lo = Infinity;
    let hi = -Infinity;
    for (const ring of poly.rings)
      for (let k = 1; k < ring.length; k += 2) {
        if (ring[k] < lo) lo = ring[k];
        if (ring[k] > hi) hi = ring[k];
      }
    const y0 = Math.max(0, Math.ceil((lo - n0) / CELL_M - 0.5));
    const y1 = Math.min(SIDE - 1, Math.floor((hi - n0) / CELL_M - 0.5));
    for (let y = y0; y <= y1; y++) {
      const cy = n0 + (y + 0.5) * CELL_M;
      xs.length = 0;
      for (const ring of poly.rings) {
        const count = ring.length / 2;
        let pe = ring[(count - 1) * 2];
        let pn = ring[(count - 1) * 2 + 1];
        for (let k = 0; k < count; k++) {
          const e = ring[k * 2];
          const n = ring[k * 2 + 1];
          if (pn <= cy !== n <= cy) xs.push(pe + ((e - pe) * (cy - pn)) / (n - pn));
          pe = e;
          pn = n;
        }
      }
      xs.sort((a, b) => a - b);
      for (let c = 0; c + 1 < xs.length; c += 2) {
        const x0 = Math.max(0, Math.ceil((xs[c] - e0) / CELL_M - 0.5));
        const x1 = Math.min(SIDE - 1, Math.ceil((xs[c + 1] - e0) / CELL_M - 0.5) - 1);
        for (let x = x0; x <= x1; x++) water[x + SIDE * y] = value;
      }
    }
  }

  let wet = 0;
  for (const w of water) wet += w;
  if (wet === 0) return Uint8Array.of(0);
  if (wet === water.length) return Uint8Array.of(1);
  const out = new Uint8Array(1 + (SIDE * SIDE) / 8);
  out[0] = 2;
  for (let b = 0; b < water.length; b++) if (water[b]) out[1 + (b >> 3)] |= 1 << (b & 7);
  return out;
}
