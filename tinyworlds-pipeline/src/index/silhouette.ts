import { createRequire } from "node:module";
import type { MultiPolygon, Pair, Polygon } from "polygon-clipping";

// a CommonJS package whose named exports Node's ESM loader cannot see
const clipping = createRequire(import.meta.url)("polygon-clipping") as typeof import("polygon-clipping");

/**
 * One piece of a structure as the renderer draws it: its footprint on the ground (flat map px
 * rings, the first the outline, the rest holes) and how far up the screen it stands.
 */
export interface Piece {
  rings: number[][];
  /** px from the ground to the piece's underside (a deck in the air, a floor on a terrace) */
  lift: number;
  /** px from the ground to its top, roof included */
  rise: number;
}

const round = (v: number): number => Math.round(v * 2) / 2;

/** Douglas–Peucker over points[a..b], marking the ones to keep. */
function mark(points: Pair[], a: number, b: number, tolerance: number, keep: boolean[]): void {
  if (b - a < 2) return;
  const [ax, ay] = points[a];
  const [bx, by] = points[b];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  let far = -1;
  let farD = tolerance;
  for (let i = a + 1; i < b; i++) {
    const [px, py] = points[i];
    const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * (px - ax) - dx * (py - ay)) / len;
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  if (far < 0) return;
  keep[far] = true;
  mark(points, a, far, tolerance, keep);
  mark(points, far, b, tolerance, keep);
}

/** A closed ring (first point repeated last), simplified and flattened without the repeat. */
function flatten(ring: Pair[], tolerance: number): number[] {
  const n = ring.length - 1;
  if (n < 3) return [];
  // split the loop at the point furthest from the first, and simplify both halves
  let far = 0;
  let farD = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const keep = new Array<boolean>(n + 1).fill(false);
  keep[0] = keep[far] = keep[n] = true;
  mark(ring, 0, far, tolerance, keep);
  mark(ring, far, n, tolerance, keep);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(round(ring[i][0]), round(ring[i][1]));
  return out.length >= 6 ? out : [];
}

/**
 * The outline of a structure on screen: every piece's footprint swept from its underside to its
 * top, all of them merged. Rings are flat map px [x0, y0, x1, y1, …], read even-odd (holes are
 * rings too), simplified to `tolerance` px and rounded to half a pixel.
 */
export function silhouette(pieces: Piece[], tolerance = 1): number[][] {
  const shapes: Polygon[] = [];
  for (const { rings, lift, rise } of pieces) {
    const at = (ring: number[], up: number): Pair[] => {
      const pts: Pair[] = [];
      for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1] - up]);
      return pts;
    };
    shapes.push(rings.map((ring) => at(ring, lift)));
    shapes.push(rings.map((ring) => at(ring, rise)));
    // each wall: the strip an edge sweeps between the underside and the top
    for (const ring of rings) {
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [ax, ay, bx, by] = [ring[i * 2], ring[i * 2 + 1], ring[j * 2], ring[j * 2 + 1]];
        if (Math.abs(bx - ax) < 1e-9 || rise - lift <= 0) continue; // an edge seen end-on sweeps nothing
        shapes.push([
          [
            [ax, ay - lift],
            [bx, by - lift],
            [bx, by - rise],
            [ax, ay - rise],
          ],
        ]);
      }
    }
  }
  if (shapes.length === 0) return [];
  const merged: MultiPolygon = clipping.union(shapes[0], ...shapes.slice(1));
  const out: number[][] = [];
  for (const polygon of merged)
    for (const ring of polygon) {
      const flat = flatten(ring, tolerance);
      if (flat.length > 0) out.push(flat);
    }
  return out;
}
