import * as THREE from "three";
import type { WalkCell } from "../cell";
import { DEEP, G, isWaterKind, type Palette } from "./palette";

/**
 * Where a square's land meets its water, from its mask (the simulation's own land and water):
 * the texture that cuts the ground, the line the shore's edge stands on, and what that edge is
 * made of (quay stone along paved land and piers, a bank elsewhere).
 */

/** Land whose edge on the water is a bank, not a quay (the tile renderer's `NATURAL_BANK`). */
const NATURAL_BANK = new Set<number>([
  G.Park,
  G.Forest,
  G.Lawn,
  G.Scrub,
  G.Wetland,
  G.Garden,
  G.Cemetery,
  G.Fairway,
  G.GolfGreen,
  G.Rock,
  G.Snow,
  G.Meadow,
  G.RedRock,
]);

/** What a shore's edge is made of, by the land behind it, and how much darker than the sun's tone. */
export function shoreFace(
  palette: Palette,
  kind: number,
  tone: number,
): { ramp: number; shade: number } {
  if (kind === G.Sand || kind === G.Bunker) return { ramp: palette.ramp("sand"), shade: tone };
  if (kind === G.Pier) return { ramp: palette.ramp("pier"), shade: Math.max(DEEP, tone - 2) };
  if (NATURAL_BANK.has(kind)) return { ramp: palette.ramp("dirt"), shade: tone - 1 };
  return { ramp: palette.ramp("pavement"), shade: tone - 1 };
}

/** The mask as a 100 × 100 texture, filtered so its edge runs smooth between the 2 m cells. */
export function maskTexture(bits: Uint8Array): THREE.DataTexture {
  const data = new Uint8Array(100 * 100);
  for (let b = 0; b < data.length; b++) data[b] = (bits[b >> 3] >> (b & 7)) & 1 ? 255 : 0;
  const t = new THREE.DataTexture(data, 100, 100, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/**
 * The shore of a square's mask as segments [e0, n0, e1, n1] in metres from its south-west
 * corner, land on the left: the line where the mask, filtered as its texture is (linear between
 * the 2 m cells' centres, held level beyond the outer centres), is half water. Marching squares
 * over the centres and the square's edges, so the edge stands where the ground is cut.
 */
export function shoreSegments(bits: Uint8Array, side: number): [number, number, number, number][] {
  const N = 100;
  const step = side / N;
  // sample positions: the square's edge, the 100 centres, the far edge
  const pos = (i: number) => (i === 0 ? 0 : i === N + 1 ? side : (i - 0.5) * step);
  const wet = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(N - 1, x - 1));
    const cy = Math.max(0, Math.min(N - 1, y - 1));
    const b = cx + N * cy;
    return (bits[b >> 3] >> (b & 7)) & 1;
  };
  /** The filtered mask at a point: what the ground's shader reads. */
  const field = (e: number, n: number) => {
    const fx = Math.max(0, Math.min(N - 1, e / step - 0.5));
    const fy = Math.max(0, Math.min(N - 1, n / step - 0.5));
    const x0 = Math.min(N - 2, Math.floor(fx));
    const y0 = Math.min(N - 2, Math.floor(fy));
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number) => wet(x + 1, y + 1);
    return (
      at(x0, y0) * (1 - tx) * (1 - ty) +
      at(x0 + 1, y0) * tx * (1 - ty) +
      at(x0, y0 + 1) * (1 - tx) * ty +
      at(x0 + 1, y0 + 1) * tx * ty
    );
  };
  const out: [number, number, number, number][] = [];
  for (let y = 0; y <= N; y++)
    for (let x = 0; x <= N; x++) {
      const a = wet(x, y);
      const b = wet(x + 1, y);
      const c = wet(x + 1, y + 1);
      const d = wet(x, y + 1);
      const sum = a + b + c + d;
      if (sum === 0 || sum === 4) continue;
      const x0 = pos(x);
      const x1 = pos(x + 1);
      const y0 = pos(y);
      const y1 = pos(y + 1);
      const xm = (x0 + x1) / 2;
      const ym = (y0 + y1) / 2;
      // crossings on the four sides: bottom, right, top, left
      const cross: [number, number][] = [];
      if (a !== b) cross.push([xm, y0]);
      if (b !== c) cross.push([x1, ym]);
      if (c !== d) cross.push([xm, y1]);
      if (d !== a) cross.push([x0, ym]);
      const pairs: [number, number][][] =
        cross.length === 4
          ? // a saddle: the filtered mask is exactly half there, which the shader counts as land,
            // so the land runs through and each water corner is cut off on its own
            a === 1
            ? [
                [cross[0], cross[3]],
                [cross[1], cross[2]],
              ]
            : [
                [cross[0], cross[1]],
                [cross[2], cross[3]],
              ]
          : [[cross[0], cross[1]]];
      for (const [[pe, pn], [qe, qn]] of pairs) {
        const L = Math.hypot(qe - pe, qn - pn);
        if (L < 1e-6) continue;
        // the right of p → q must be the water
        const me = (pe + qe) / 2 + ((qn - pn) / L) * 0.2;
        const mn = (pn + qn) / 2 - ((qe - pe) / L) * 0.2;
        if (field(me, mn) > 0.5) out.push([pe, pn, qe, qn]);
        else out.push([qe, qn, pe, pn]);
      }
    }
  return out;
}

/**
 * The ground kind on top at a point (world metres): of the land polygons holding it, the one
 * painted last (highest rank, then latest in the scene); land where none does.
 */
export function groundKindAt(c: WalkCell, paintRank: number[]) {
  const rankOf = (kind: number) => paintRank[kind] ?? kind;
  const polys = c.ground
    .filter((g) => !isWaterKind(g.kind))
    .sort((a, b) => rankOf(b.kind) - rankOf(a.kind) || b.order - a.order)
    .map((g) => {
      let e0 = Infinity;
      let n0 = Infinity;
      let e1 = -Infinity;
      let n1 = -Infinity;
      for (const r of g.rings)
        for (let k = 0; k < r.length; k += 2) {
          e0 = Math.min(e0, r[k]);
          e1 = Math.max(e1, r[k]);
          n0 = Math.min(n0, r[k + 1]);
          n1 = Math.max(n1, r[k + 1]);
        }
      return { g, e0, n0, e1, n1 };
    });
  return (e: number, n: number): number => {
    for (const { g, e0, n0, e1, n1 } of polys) {
      if (e < e0 || e > e1 || n < n0 || n > n1) continue;
      let inside = false;
      for (const r of g.rings) {
        const k = r.length / 2;
        for (let a = k - 1, b = 0; b < k; a = b++) {
          const an = r[a * 2 + 1];
          const bn = r[b * 2 + 1];
          if (an > n !== bn > n && e < ((r[b * 2] - r[a * 2]) * (n - an)) / (bn - an) + r[a * 2])
            inside = !inside;
        }
      }
      if (inside) return g.kind;
    }
    return G.Land;
  };
}
