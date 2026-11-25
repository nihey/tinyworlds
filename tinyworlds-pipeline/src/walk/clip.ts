/**
 * Clipping to rectangles, in the walk's world metres (flat [e, n, e, n, …] arrays). Rings are
 * clipped each on its own: a cut may leave degenerate edges along the box, which is harmless
 * because every consumer fills even-odd.
 */
import { CELL, cellKey } from "./grid.js";

export type Box = { e0: number; n0: number; e1: number; n1: number };
export type CellWindow = { i0: number; i1: number; j0: number; j1: number };

type Place = "inside" | "outside" | "across";

/** Where a ring lies against a box, by its bounding box alone. */
function place(ring: number[], box: Box): Place {
  let e0 = Infinity;
  let n0 = Infinity;
  let e1 = -Infinity;
  let n1 = -Infinity;
  for (let k = 0; k < ring.length; k += 2) {
    const e = ring[k];
    const n = ring[k + 1];
    if (e < e0) e0 = e;
    if (e > e1) e1 = e;
    if (n < n0) n0 = n;
    if (n > n1) n1 = n;
  }
  if (e1 <= box.e0 || e0 >= box.e1 || n1 <= box.n0 || n0 >= box.n1) return "outside";
  if (e0 >= box.e0 && e1 <= box.e1 && n0 >= box.n0 && n1 <= box.n1) return "inside";
  return "across";
}

/** One Sutherland–Hodgman pass: keep what is on the `side` of the axis line `at`. */
function pass(ring: number[], axis: 0 | 1, at: number, keepAbove: boolean): number[] {
  const out: number[] = [];
  const count = ring.length / 2;
  if (count === 0) return out;
  const inside = (v: number) => (keepAbove ? v >= at : v <= at);
  let pe = ring[(count - 1) * 2];
  let pn = ring[(count - 1) * 2 + 1];
  let pIn = inside(axis === 0 ? pe : pn);
  for (let k = 0; k < count; k++) {
    const e = ring[k * 2];
    const n = ring[k * 2 + 1];
    const cIn = inside(axis === 0 ? e : n);
    if (cIn !== pIn) {
      // the edge crosses the line: the new vertex sits exactly on it
      if (axis === 0) out.push(at, pn + ((n - pn) * (at - pe)) / (e - pe));
      else out.push(pe + ((e - pe) * (at - pn)) / (n - pn), at);
    }
    if (cIn) out.push(e, n);
    pe = e;
    pn = n;
    pIn = cIn;
  }
  return out;
}

/** A ring clipped to a box; empty when nothing of it is left. Rings wholly inside come back as they are. */
export function clipRing(ring: number[], box: Box): number[] {
  const where = place(ring, box);
  if (where === "outside") return [];
  if (where === "inside") return ring;
  let r = pass(ring, 0, box.e0, true);
  r = pass(r, 0, box.e1, false);
  r = pass(r, 1, box.n0, true);
  r = pass(r, 1, box.n1, false);
  return r.length >= 6 ? r : [];
}

/** Each ring of a polygon clipped alone; rings left with fewer than 3 vertices are dropped. */
export function clipPolygon(rings: number[][], box: Box): number[][] {
  const out: number[][] = [];
  for (const ring of rings) {
    const r = clipRing(ring, box);
    if (r.length >= 6) out.push(r);
  }
  return out;
}

const boxOf = (i0: number, i1: number, j0: number, j1: number): Box => ({
  e0: i0 * CELL,
  n0: j0 * CELL,
  e1: (i1 + 1) * CELL,
  n1: (j1 + 1) * CELL,
});

/**
 * A polygon cut along the grid of squares i0..i1 × j0..j1: the box is halved along its longer
 * side, the rings clipped to each half, and so on down to single squares. A ring wholly inside a
 * half goes down untouched, so a large polygon (the harbour) costs its vertices once per level,
 * not once per square. An optional window skips disjoint branches without changing the cuts
 * used to reach any of the retained squares.
 */
export function splitByCells(
  rings: number[][],
  i0: number,
  i1: number,
  j0: number,
  j1: number,
  window?: CellWindow,
): Map<string, number[][]> {
  const out = new Map<string, number[][]>();
  const walk = (rs: number[][], a0: number, a1: number, b0: number, b1: number): void => {
    if (rs.length === 0 || (window && (a1 < window.i0 || a0 > window.i1 || b1 < window.j0 || b0 > window.j1)))
      return;
    const clipped = clipPolygon(rs, boxOf(a0, a1, b0, b1));
    if (clipped.length === 0) return;
    if (a0 === a1 && b0 === b1) {
      out.set(cellKey(a0, b0), clipped);
      return;
    }
    if (a1 - a0 >= b1 - b0) {
      const mid = (a0 + a1) >> 1;
      walk(clipped, a0, mid, b0, b1);
      walk(clipped, mid + 1, a1, b0, b1);
    } else {
      const mid = (b0 + b1) >> 1;
      walk(clipped, a0, a1, b0, mid);
      walk(clipped, a0, a1, mid + 1, b1);
    }
  };
  walk(rings, i0, i1, j0, j1);
  return out;
}

/** A path clipped to a box (Liang–Barsky per segment): the runs that lie inside, each with 2+ points. */
export function clipPolyline(pts: number[], box: Box): number[][] {
  const runs: number[][] = [];
  let run: number[] | null = null;
  const count = pts.length / 2;
  for (let k = 0; k + 1 < count; k++) {
    const e0 = pts[k * 2];
    const n0 = pts[k * 2 + 1];
    const de = pts[k * 2 + 2] - e0;
    const dn = pts[k * 2 + 3] - n0;
    let t0 = 0;
    let t1 = 1;
    let visible = true;
    const edges = [-de, de, -dn, dn];
    const gaps = [e0 - box.e0, box.e1 - e0, n0 - box.n0, box.n1 - n0];
    for (let s = 0; s < 4 && visible; s++) {
      const p = edges[s];
      const q = gaps[s];
      if (p === 0) {
        if (q < 0) visible = false;
      } else {
        const t = q / p;
        if (p < 0) {
          if (t > t1) visible = false;
          else if (t > t0) t0 = t;
        } else if (t < t0) visible = false;
        else if (t < t1) t1 = t;
      }
    }
    if (!visible || t1 <= t0) {
      run = null;
      continue;
    }
    const ae = e0 + de * t0;
    const an = n0 + dn * t0;
    const be = e0 + de * t1;
    const bn = n0 + dn * t1;
    // the segment carries on from the previous one when it starts where that left off
    if (run === null || t0 > 0) {
      run = [ae, an];
      runs.push(run);
    }
    run.push(be, bn);
    if (t1 < 1) run = null;
  }
  return runs;
}
