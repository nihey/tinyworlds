import type { WalkCell } from "./cell";

/** How far from the dropped point a way may be and still take the person. */
export const REACH = 150;

/** Metres past a street's edge where the person stands: on the kerb, out of the traffic. */
const KERB = 1;

export interface Drop {
  e: number;
  n: number;
  z: number;
  /** radians from north, clockwise (0 faces north, π/2 east) */
  yaw: number;
}

interface Hit {
  dist: number;
  /** the point on the polyline */
  e: number;
  n: number;
  z: number;
  /** unit direction of the segment it is on */
  de: number;
  dn: number;
  /** the dropped point's side of the line: positive to the left of the direction */
  side: number;
}

/** The nearest point of a polyline (e, n, z triples) to (e, n), in plan. */
function nearest(pts: Float32Array, e: number, n: number): Hit | null {
  let best: Hit | null = null;
  for (let q = 3; q < pts.length; q += 3) {
    const e0 = pts[q - 3];
    const n0 = pts[q - 2];
    const se = pts[q] - e0;
    const sn = pts[q + 1] - n0;
    const len2 = se * se + sn * sn;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((e - e0) * se + (n - n0) * sn) / len2));
    const pe = e0 + se * t;
    const pn = n0 + sn * t;
    const dist = Math.hypot(e - pe, n - pn);
    if (best && dist >= best.dist) continue;
    const len = Math.sqrt(len2);
    best = {
      dist,
      e: pe,
      n: pn,
      z: pts[q - 1] + (pts[q + 2] - pts[q - 1]) * t,
      de: se / len,
      dn: sn / len,
      side: se * (n - n0) - sn * (e - e0),
    };
  }
  return best;
}

/** Facing along the way, whichever way is nearer north, so the first view is predictable. */
function yawAlong(de: number, dn: number): number {
  return dn < 0 || (dn === 0 && de < 0) ? Math.atan2(-de, -dn) : Math.atan2(de, dn);
}

function keep<T extends { dist: number }>(best: T | null, hit: T | null): T | null {
  return hit && (!best || hit.dist < best.dist) ? hit : best;
}

/**
 * Where a dropped person stands: on the elevated way whose strip the point lies in; else the
 * nearest sidewalk; else beside the nearest street, on its kerb. Nothing within 150 m: null.
 */
export function snapDrop(cells: Iterable<WalkCell>, e: number, n: number): Drop | null {
  let deck: Hit | null = null;
  let walk: Hit | null = null;
  let street: (Hit & { width: number }) | null = null;
  for (const cell of cells) {
    for (const way of cell.elevated) {
      if (way.kind === 2) continue;
      const hit = nearest(way.pts, e, n);
      if (hit && hit.dist <= way.width / 2) deck = keep(deck, hit);
    }
    for (const w of cell.walks) {
      if (w.crosswalk || w.elevated) continue;
      const hit = nearest(w.pts, e, n);
      if (hit && hit.dist <= REACH) walk = keep(walk, hit);
    }
    for (const s of cell.streets) {
      if (s.elevated) continue;
      const hit = nearest(s.pts, e, n);
      if (hit && hit.dist <= REACH) street = keep(street, { ...hit, width: s.width });
    }
  }
  const on = deck ?? walk;
  if (on) return { e: on.e, n: on.n, z: on.z, yaw: yawAlong(on.de, on.dn) };
  if (!street) return null;
  // the kerb on the dropped point's side: the left normal of the direction is (-dn, de)
  const off = street.width / 2 + KERB;
  const s = street.side >= 0 ? 1 : -1;
  return {
    e: street.e - street.dn * off * s,
    n: street.n + street.de * off * s,
    z: street.z,
    yaw: yawAlong(street.de, street.dn),
  };
}
