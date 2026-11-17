import type { ElevatedWay } from "../cell";

/**
 * What holds up an elevated way where the map has nothing (its `own` stretches: overpasses,
 * bridge approaches over land), and what stands on every one of them: pure geometry in world
 * metres, no three.js. `cell-mesh.ts` turns it into triangles.
 */

/** A stretch of a line on the deck, `z` the deck's surface at either end. */
export interface DeckSpan {
  e0: number;
  n0: number;
  z0: number;
  e1: number;
  n1: number;
  z1: number;
  /** metres along the way's middle line (in plan) where the stretch begins */
  along: number;
}

export interface DeckGeometry {
  /** Stretches of the middle line under which the walk builds its slab: the way's width, 1 m deep (down to the ground at most). */
  slab: DeckSpan[];
  /** Runs along both edges, each standing a parapet 1 m high on the deck. */
  parapets: DeckSpan[];
  /** Where a column stands, and the height of the slab's underside above it: [e, n, top]. */
  columns: [number, number, number][];
  /** The roadway along the whole way, own or not: what carries the lane lines up. */
  surface: DeckSpan[];
}

/** How deep the slab is under the deck, metres. */
export const SLAB_DEPTH = 1;
/** Columns stand about this far apart, metres. */
export const COLUMN_SPACING = 30;
/**
 * The longest piece of slab, parapet or roadway, metres: a way is filed under every square it
 * touches, and each square draws only the pieces whose middle it holds, so none is drawn twice
 * and none hangs far from the square that draws it.
 */
export const PIECE = 25;
/** Metres: a vertex higher than this is off the ground (as the pipeline's network has it). */
const OFF_GROUND = 0.3;
/** A deck lower than this stands on its slab alone. */
const COLUMN_MIN_Z = 2.5;
/** How far along the way a column may move off its station to find free ground, and in what steps. */
const SHIFT = 12;
const SHIFT_STEP = 2;

/** A column's side for a deck this wide: a footway's is slender, a highway's stout. */
export function columnSide(width: number): number {
  return Math.min(1.8, Math.max(0.8, width * 0.12));
}

/** A stretch cut into equal pieces no longer than `PIECE`. */
function chop(
  e0: number,
  n0: number,
  z0: number,
  e1: number,
  n1: number,
  z1: number,
  along: number,
  out: DeckSpan[],
): void {
  const len = Math.hypot(e1 - e0, n1 - n0);
  const parts = Math.max(1, Math.ceil(len / PIECE - 1e-9));
  for (let p = 0; p < parts; p++) {
    const a = p / parts;
    const b = (p + 1) / parts;
    out.push({
      e0: e0 + (e1 - e0) * a,
      n0: n0 + (n1 - n0) * a,
      z0: z0 + (z1 - z0) * a,
      e1: e0 + (e1 - e0) * b,
      n1: n0 + (n1 - n0) * b,
      z1: z0 + (z1 - z0) * b,
      along: along + len * a,
    });
  }
}

/**
 * The slab under the way's `own` stretches (a segment with either end the walk's: the one
 * that meets the map's deck reaches it), a parapet each side wherever the way is raised (open
 * where `open` says another way joins it, as the walk's walls are), columns every ~30 m under
 * the slab that never stand where `under` (a street or water below) is true, moving along the
 * way, then out to the deck's edges, to find free ground, and the roadway all along.
 *
 * With `within` ([e0, n0, e1, n1]), only what may lie in that box is worked out (a square asks
 * for its own part of a way that crosses many): the stretches whose strip reaches it and the
 * columns whose station is near enough to end up in it, each as it would be without the box.
 */
export function deckGeometry(
  way: ElevatedWay,
  under: (e: number, n: number) => boolean,
  opts: {
    open?: (e: number, n: number, z: number) => boolean;
    within?: readonly [number, number, number, number];
  } = {},
): DeckGeometry {
  const { open, within } = opts;
  const p = way.pts;
  const m = p.length / 3;
  const half = way.width / 2;
  const slab: DeckSpan[] = [];
  const parapets: DeckSpan[] = [];
  const surface: DeckSpan[] = [];
  const columns: [number, number, number][] = [];
  if (m < 2) return { slab, parapets, columns, surface };

  // distance along the middle line at every vertex
  const at = new Float64Array(m);
  for (let k = 1; k < m; k++)
    at[k] = at[k - 1] + Math.hypot(p[k * 3] - p[k * 3 - 3], p[k * 3 + 1] - p[k * 3 - 2]);

  for (let k = 0; k + 1 < m; k++) {
    const ae = p[k * 3];
    const an = p[k * 3 + 1];
    const az = p[k * 3 + 2];
    const be = p[k * 3 + 3];
    const bn = p[k * 3 + 4];
    const bz = p[k * 3 + 5];
    const len = at[k + 1] - at[k];
    if (len < 1e-6) continue;
    if (
      within &&
      (Math.max(ae, be) + half + 1 < within[0] ||
        Math.min(ae, be) - half - 1 > within[2] ||
        Math.max(an, bn) + half + 1 < within[1] ||
        Math.min(an, bn) - half - 1 > within[3])
    )
      continue;
    chop(ae, an, az, be, bn, bz, at[k], surface);
    if (way.own[k] || way.own[k + 1]) chop(ae, an, az, be, bn, bz, at[k], slab);
    if (Math.max(az, bz) <= OFF_GROUND) continue;

    const de = (be - ae) / len;
    const dn = (bn - an) / len;
    for (const side of [1, -1]) {
      // the left edge is the middle line moved by the left normal (-dn, de)
      const oe = -dn * half * side;
      const on = de * half * side;
      const steps = open ? Math.max(1, Math.ceil(len)) : 1;
      let from = -1;
      const flush = (to: number) => {
        if (from < 0) return;
        const t0 = from / steps;
        const t1 = to / steps;
        chop(
          ae + (be - ae) * t0 + oe,
          an + (bn - an) * t0 + on,
          az + (bz - az) * t0,
          ae + (be - ae) * t1 + oe,
          an + (bn - an) * t1 + on,
          az + (bz - az) * t1,
          at[k] + len * t0,
          parapets,
        );
        from = -1;
      };
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const closed =
          !open || !open(ae + (be - ae) * t + oe, an + (bn - an) * t + on, az + (bz - az) * t);
        if (!closed) flush(s);
        else if (from < 0) from = s;
      }
      flush(steps);
    }
  }

  // columns: one per station, where the slab is the walk's on both sides and high enough
  const total = at[m - 1];
  const r = columnSide(way.width) / 2;
  const reach = Math.max(0, half - r);
  /** The point at distance s along the way: position, deck height, direction; null where no column may stand. */
  /** The segment that distance s along the way falls on. */
  const segmentAt = (s: number) => {
    let lo = 0;
    let hi = m - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (at[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const spot = (s: number) => {
    if (s < 0 || s > total) return null;
    const k = segmentAt(s);
    if (!way.own[k] || !way.own[k + 1]) return null;
    const len = at[k + 1] - at[k];
    if (len < 1e-6) return null;
    const t = (s - at[k]) / len;
    const z = p[k * 3 + 2] + (p[k * 3 + 5] - p[k * 3 + 2]) * t;
    if (z < COLUMN_MIN_Z) return null;
    return {
      e: p[k * 3] + (p[k * 3 + 3] - p[k * 3]) * t,
      n: p[k * 3 + 1] + (p[k * 3 + 4] - p[k * 3 + 1]) * t,
      z,
      ue: (p[k * 3 + 3] - p[k * 3]) / len,
      un: (p[k * 3 + 4] - p[k * 3 + 1]) / len,
    };
  };
  /** Whether a column's square footprint, centred at (e, n) and lined up with the way, is clear. */
  const clear = (e: number, n: number, ue: number, un: number) => {
    if (under(e, n)) return false;
    for (const a of [-r, r])
      for (const b of [-r, r]) if (under(e + ue * a - un * b, n + un * a + ue * b)) return false;
    return true;
  };
  const shifts = [0];
  for (let d = SHIFT_STEP; d <= SHIFT; d += SHIFT_STEP) shifts.push(d, -d);
  const sideways = reach > 0 ? [0, reach, -reach] : [0];
  // a column stands at most this far from its station
  const margin = SHIFT + half + 1;
  for (let station = COLUMN_SPACING / 2; station <= total; station += COLUMN_SPACING) {
    if (within) {
      const k = segmentAt(station);
      const len = at[k + 1] - at[k];
      const t = len > 1e-6 ? (station - at[k]) / len : 0;
      const e = p[k * 3] + (p[k * 3 + 3] - p[k * 3]) * t;
      const n = p[k * 3 + 1] + (p[k * 3 + 4] - p[k * 3 + 1]) * t;
      if (
        e < within[0] - margin ||
        e > within[2] + margin ||
        n < within[1] - margin ||
        n > within[3] + margin
      )
        continue;
    }
    search: for (const across of sideways)
      for (const shift of shifts) {
        const q = spot(station + shift);
        if (!q) continue;
        const e = q.e - q.un * across;
        const n = q.n + q.ue * across;
        if (!clear(e, n, q.ue, q.un)) continue;
        columns.push([e, n, q.z - SLAB_DEPTH]);
        break search;
      }
  }
  return { slab, parapets, columns, surface };
}
