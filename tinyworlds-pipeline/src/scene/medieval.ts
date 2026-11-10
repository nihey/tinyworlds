import { R } from "../render/palette.js";
import { mix, pick, rand } from "./hash.js";
import { Pattern, Roof } from "./kinds.js";
import type { Look, SyntheticBuilder } from "./synthetic.js";

/**
 * The tools a generated medieval place is laid out with: plain geometry on flat `[p, q, …]`
 * paths, an occupancy grid so nothing is built on top of anything else, and builders for the
 * things such places are made of (curtain walls with towers and gates, streets that grow lanes,
 * rows of houses). Nothing here knows which city it is drawing, and nothing is random: every
 * choice is a hash of a seed and a position.
 */

// ---------------------------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------------------------

/** A regular polygon around a point. */
export function disc(p: number, q: number, radius: number, sides: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((i + 0.5) / sides) * Math.PI * 2;
    out.push(p + Math.cos(a) * radius, q + Math.sin(a) * radius);
  }
  return out;
}

/** A rectangle around a centre: `halfU` along the direction `angle` (radians from +p towards +q), `halfV` across it. */
export function rect(cp: number, cq: number, halfU: number, halfV: number, angle = 0): number[] {
  const up = Math.cos(angle);
  const uq = Math.sin(angle);
  const out: number[] = [];
  for (const [su, sv] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    out.push(cp + up * halfU * su - uq * halfV * sv, cq + uq * halfU * su + up * halfV * sv);
  }
  return out;
}

export function pathLength(path: number[]): number {
  let total = 0;
  for (let i = 2; i < path.length; i += 2)
    total += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
  return total;
}

export interface PathPoint {
  p: number;
  q: number;
  /** unit tangent */
  dp: number;
  dq: number;
}

/** The point `s` metres along a path (clamped to its ends) and the direction of travel there. */
export function pointAlong(path: number[], s: number): PathPoint {
  let walked = 0;
  for (let i = 2; i < path.length; i += 2) {
    const dp = path[i] - path[i - 2];
    const dq = path[i + 1] - path[i - 1];
    const len = Math.hypot(dp, dq);
    if (len < 1e-9) continue;
    if (walked + len >= s || i === path.length - 2) {
      const t = Math.max(0, Math.min(1, (s - walked) / len));
      return { p: path[i - 2] + dp * t, q: path[i - 1] + dq * t, dp: dp / len, dq: dq / len };
    }
    walked += len;
  }
  return { p: path[0], q: path[1], dp: 1, dq: 0 };
}

/** The same path as points a fixed step apart (the last step may be shorter). */
export function resample(path: number[], step: number): number[] {
  const total = pathLength(path);
  const n = Math.max(1, Math.round(total / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const pt = pointAlong(path, (i / n) * total);
    out.push(pt.p, pt.q);
  }
  return out;
}

/** Corner cutting: each pass rounds the path's corners. Open paths keep their ends. */
export function chaikin(path: number[], passes: number, closed = false): number[] {
  let pts = path;
  for (let pass = 0; pass < passes; pass++) {
    const n = pts.length / 2;
    const out: number[] = [];
    const last = closed ? n : n - 1;
    if (!closed) out.push(pts[0], pts[1]);
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      const ap = pts[i * 2];
      const aq = pts[i * 2 + 1];
      const bp = pts[j * 2];
      const bq = pts[j * 2 + 1];
      out.push(ap * 0.75 + bp * 0.25, aq * 0.75 + bq * 0.25, ap * 0.25 + bp * 0.75, aq * 0.25 + bq * 0.75);
    }
    if (!closed) out.push(pts[n * 2 - 2], pts[n * 2 - 1]);
    pts = out;
  }
  return pts;
}

/** Smooth noise along a line: a value in [-1, 1] that drifts as `t` grows. */
export function drift(seed: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = rand(seed, i) * 2 - 1;
  const b = rand(seed, i + 1) * 2 - 1;
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}

/**
 * Make a drawn-with-a-ruler path wander: it is cut into steps and every inner point pushed
 * sideways by smooth noise, up to `amount` metres. The ends stay where they are.
 */
export function wander(path: number[], amount: number, seed: number, step = 30): number[] {
  const pts = resample(path, step);
  const n = pts.length / 2;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) {
      out.push(pts[i * 2], pts[i * 2 + 1]);
      continue;
    }
    const dp = pts[i * 2 + 2] - pts[i * 2 - 2];
    const dq = pts[i * 2 + 3] - pts[i * 2 - 1];
    const len = Math.hypot(dp, dq) || 1;
    // ease in from the ends so the path still meets them
    const ease = Math.min(1, i / 3, (n - 1 - i) / 3);
    const push = drift(seed, i * 0.37) * amount * ease;
    out.push(pts[i * 2] - (dq / len) * push, pts[i * 2 + 1] + (dp / len) * push);
  }
  return out;
}

/** Signed area of a ring (positive when it turns from +p towards +q). */
export function ringArea(ring: number[]): number {
  let sum = 0;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += ring[i * 2] * ring[j * 2 + 1] - ring[j * 2] * ring[i * 2 + 1];
  }
  return sum / 2;
}

export function centroid(ring: number[]): [number, number] {
  let p = 0;
  let q = 0;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    p += ring[i * 2] / n;
    q += ring[i * 2 + 1] / n;
  }
  return [p, q];
}

export function insideRing(ring: number[], p: number, q: number): boolean {
  let hit = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const qi = ring[i * 2 + 1];
    const qj = ring[j * 2 + 1];
    if (qi > q !== qj > q && p < ((ring[j * 2] - ring[i * 2]) * (q - qi)) / (qj - qi) + ring[i * 2])
      hit = !hit;
  }
  return hit;
}

/**
 * The ring moved inwards by `d` metres (outwards when negative): every edge is shifted along
 * its normal and neighbouring edges are joined where they now cross. Meant for the gently
 * convex outlines of walls and wards; sharp reflex corners are not handled.
 */
export function inset(ring: number[], d: number): number[] {
  const n = ring.length / 2;
  const sign = ringArea(ring) > 0 ? 1 : -1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const h = (i + n - 1) % n;
    const j = (i + 1) % n;
    const ap = ring[i * 2] - ring[h * 2];
    const aq = ring[i * 2 + 1] - ring[h * 2 + 1];
    const bp = ring[j * 2] - ring[i * 2];
    const bq = ring[j * 2 + 1] - ring[i * 2 + 1];
    const al = Math.hypot(ap, aq) || 1;
    const bl = Math.hypot(bp, bq) || 1;
    // inward normals of the two edges that meet here
    const anp = (-aq / al) * sign;
    const anq = (ap / al) * sign;
    const bnp = (-bq / bl) * sign;
    const bnq = (bp / bl) * sign;
    const mp = anp + bnp;
    const mq = anq + bnq;
    const ml = Math.hypot(mp, mq) || 1;
    // along the bisector, far enough that both edges move by d (capped at sharp corners)
    const cos = Math.max(0.35, (anp * mp + anq * mq) / ml);
    out.push(ring[i * 2] + (mp / ml) * (d / cos), ring[i * 2 + 1] + (mq / ml) * (d / cos));
  }
  return out;
}

/** The outline of a path given a width: a closed ring around it (square ends). */
export function ribbon(path: number[], width: number): number[] {
  const n = path.length / 2;
  const left: number[] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dp = path[b * 2] - path[a * 2];
    const dq = path[b * 2 + 1] - path[a * 2 + 1];
    const len = Math.hypot(dp, dq) || 1;
    const np = (-dq / len) * (width / 2);
    const nq = (dp / len) * (width / 2);
    left.push(path[i * 2] + np, path[i * 2 + 1] + nq);
    right.push([path[i * 2] - np, path[i * 2 + 1] - nq]);
  }
  return left.concat(right.reverse().flat());
}

// ---------------------------------------------------------------------------------------------
// occupancy: what ground is already taken
// ---------------------------------------------------------------------------------------------

/** A coarse bitmap of the ground: roads, water, walls and buildings mark it, and new buildings ask before they stand. */
export class Occupancy {
  readonly cols: number;
  readonly rows: number;
  private readonly taken: Uint8Array;

  constructor(
    private readonly p0: number,
    private readonly q0: number,
    p1: number,
    q1: number,
    private readonly cell = 1.5,
  ) {
    this.cols = Math.ceil((p1 - p0) / cell);
    this.rows = Math.ceil((q1 - q0) / cell);
    this.taken = new Uint8Array(this.cols * this.rows);
  }

  /** Mark everything inside a ring. */
  blockRing(ring: number[]): void {
    this.scan(ring, (row, a, b) => this.taken.fill(1, row * this.cols + a, row * this.cols + b));
  }

  /** Mark a path of the given width. */
  blockPath(path: number[], width: number): void {
    for (let i = 2; i < path.length; i += 2) {
      const dp = path[i] - path[i - 2];
      const dq = path[i + 1] - path[i - 1];
      const len = Math.hypot(dp, dq);
      if (len < 1e-6) continue;
      // each piece runs a half-width past its ends, which closes the bends
      this.blockRing(
        rect(
          (path[i] + path[i - 2]) / 2,
          (path[i + 1] + path[i - 1]) / 2,
          len / 2 + width / 2,
          width / 2,
          Math.atan2(dq, dp),
        ),
      );
    }
  }

  isTaken(p: number, q: number): boolean {
    const x = Math.floor((p - this.p0) / this.cell);
    const y = Math.floor((q - this.q0) / this.cell);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true;
    return this.taken[y * this.cols + x] === 1;
  }

  /** Is every cell under this ring free (and on the map)? */
  isFree(ring: number[]): boolean {
    let free = true;
    let any = false;
    this.scan(ring, (row, a, b) => {
      any = true;
      if (!free) return;
      for (let i = row * this.cols + a; i < row * this.cols + b; i++) {
        if (this.taken[i]) {
          free = false;
          return;
        }
      }
    });
    if (!any) {
      // smaller than a cell: ask about its middle
      const [p, q] = centroid(ring);
      return !this.isTaken(p, q);
    }
    if (!free) return false;
    // anything hanging off the edge of the grid is not free
    for (let i = 0; i < ring.length; i += 2) {
      const x = (ring[i] - this.p0) / this.cell;
      const y = (ring[i + 1] - this.q0) / this.cell;
      if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    }
    return true;
  }

  /** Scanline over the cells whose centres lie inside the ring. */
  private scan(ring: number[], span: (row: number, a: number, b: number) => void): void {
    const n = ring.length / 2;
    let qMin = Infinity;
    let qMax = -Infinity;
    for (let i = 0; i < n; i++) {
      qMin = Math.min(qMin, ring[i * 2 + 1]);
      qMax = Math.max(qMax, ring[i * 2 + 1]);
    }
    const y0 = Math.max(0, Math.floor((qMin - this.q0) / this.cell));
    const y1 = Math.min(this.rows - 1, Math.floor((qMax - this.q0) / this.cell));
    const xs: number[] = [];
    for (let y = y0; y <= y1; y++) {
      const q = this.q0 + (y + 0.5) * this.cell;
      xs.length = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const qi = ring[i * 2 + 1];
        const qj = ring[j * 2 + 1];
        if (qi > q !== qj > q) xs.push(((ring[j * 2] - ring[i * 2]) * (q - qi)) / (qj - qi) + ring[i * 2]);
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const a = Math.max(0, Math.ceil((xs[i] - this.p0) / this.cell - 0.5));
        const b = Math.min(this.cols, Math.ceil((xs[i + 1] - this.p0) / this.cell - 0.5));
        if (b > a) span(y, a, b);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// looks
// ---------------------------------------------------------------------------------------------

const look = (wall: number, roof: number, extra: Partial<Look> = {}): Look => ({
  wall,
  roof,
  glass: R.glassBlack,
  ...extra,
});

/** Stonework and the like, by name. */
export const STONE = {
  grey: look(R.greyStone, R.greyStone),
  dark: look(R.darkStone, R.darkStone),
  pale: look(R.limestone, R.limestone),
  red: look(R.redStone, R.redStone),
  white: look(R.whiteBrick, R.roofWhite),
  timber: look(R.timber, R.timber),
} as const;

/** How well-off a house is: 0 a hovel, 1 a townhouse, 2 a merchant's or a lord's. */
export type Wealth = 0 | 1 | 2;

const HOUSE_WALLS: number[][] = [
  [R.cream, R.tan, R.tan, R.timber, R.brownstone, R.limestone],
  [R.cream, R.cream, R.whiteBrick, R.tan, R.limestone, R.timber, R.yellowBrick],
  [R.limestone, R.greyStone, R.cream, R.whiteBrick, R.tan],
];
const HOUSE_ROOFS: number[][] = [
  [R.thatch, R.thatch, R.thatch, R.roofBrown, R.timber],
  [R.roofTerracotta, R.roofClay, R.roofBrown, R.thatch, R.roofSlate, R.roofRed],
  [R.roofSlate, R.roofSlate, R.roofTerracotta, R.roofClay, R.roofRed],
];

/** A dwelling's look and height from a seed and how rich it is. */
export interface HousePalette {
  walls?: number[];
  roofs?: number[];
}

export function houseLook(
  seed: number,
  wealth: Wealth,
  palette?: HousePalette,
): {
  look: Look;
  height: number;
} {
  const height = [3.4, 5.2, 7.2][wealth] + rand(seed, 3) * [2.2, 3.2, 4.2][wealth];
  return {
    height,
    look: {
      wall: pick(palette?.walls ?? HOUSE_WALLS[wealth], seed, 1),
      roof: pick(palette?.roofs ?? HOUSE_ROOFS[wealth], seed, 2),
      glass: R.glassBlack,
      pattern: Pattern.House,
      roofShape: Roof.Pitched,
      roofH: Math.min(2.8, height * 0.4),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// walls, towers, gates
// ---------------------------------------------------------------------------------------------

export interface TowerOptions {
  /** A wider fighting top: the last two metres stand proud of the shaft. */
  crown?: boolean;
  /** A conical (or pyramid) roof of this height and material. */
  cone?: { height: number; roof: number };
  sides?: number;
  /** What it stands on, metres above ground (a terrace, a rock): the height is measured from there. */
  base?: number;
}

/** A tower: a prism, optionally crowned and roofed. Round unless `sides` says otherwise. */
export function tower(
  b: SyntheticBuilder,
  p: number,
  q: number,
  radius: number,
  height: number,
  stone: Look,
  opts: TowerOptions = {},
): void {
  const sides = opts.sides ?? (radius > 9 ? 16 : radius > 5 ? 12 : 10);
  const base = opts.base ?? 0;
  height += base;
  b.prism(p, q, radius, sides, height, base, stone);
  let top = height;
  if (opts.crown) {
    b.prism(p, q, radius + 0.9, sides, height + 1.2, height - 2.2, stone);
    top = height + 1.2;
  }
  if (opts.cone) {
    b.prism(p, q, radius + (opts.crown ? 0.5 : 0.6), sides, top + opts.cone.height, top, {
      wall: stone.wall,
      roof: opts.cone.roof,
      roofShape: Roof.Pyramid,
      roofH: opts.cone.height,
    });
  }
}

export interface WallOptions {
  height: number;
  thickness: number;
  stone: Look;
  /** Teeth along the top. */
  merlons?: boolean;
  /** What it stands on, metres above ground: the height is measured from there. */
  base?: number;
}

/** One straight stretch of wall between two points, a little over-long so that corners close. */
export function wallPiece(
  b: SyntheticBuilder,
  ap: number,
  aq: number,
  bp: number,
  bq: number,
  opts: WallOptions,
): void {
  const len = Math.hypot(bp - ap, bq - aq);
  if (len < 0.5) return;
  const angle = Math.atan2(bq - aq, bp - ap);
  const half = opts.thickness / 2;
  const base = opts.base ?? 0;
  const top = base + opts.height;
  b.volume(rect((ap + bp) / 2, (aq + bq) / 2, len / 2 + half * 0.6, half, angle), top, base, opts.stone);
  if (!opts.merlons) return;
  const up = (bp - ap) / len;
  const uq = (bq - aq) / len;
  const count = Math.floor(len / 3);
  for (let i = 0; i < count; i++) {
    const s = ((i + 0.5) / count) * len;
    b.volume(rect(ap + up * s, aq + uq * s, 0.75, half, angle), top + 1.1, top, opts.stone);
  }
}

export interface Gate {
  name?: string;
  /** Anywhere near the wall: the gate is cut where the wall passes closest. */
  p: number;
  q: number;
  /** Width of the opening, metres. */
  width?: number;
}

export interface CurtainOptions extends WallOptions {
  towerRadius: number;
  towerHeight: number;
  /** Greatest distance between towers along a stretch of wall. */
  towerEvery: number;
  towerStone?: Look;
  /** Roof the towers with cones of this material (bare, crowned tops otherwise). */
  cone?: number;
  gates?: Gate[];
  /** Skip the tower at these corners (indices into the ring), where something else stands. */
  bareCorners?: number[];
  /** Leave these edges open (edge i runs from corner i to the next): where the wall gives way to a castle or a cliff. */
  openEdges?: number[];
}

export interface PlacedGate {
  name?: string;
  p: number;
  q: number;
  /** unit vector pointing out of the walls */
  outP: number;
  outQ: number;
}

/**
 * A curtain wall around a ring: straight stretches between corner towers, more towers along the
 * long stretches, and a gatehouse (a taller block between two towers) wherever a gate is asked
 * for. Returns where each gate ended up and which way is out.
 */
export function curtain(b: SyntheticBuilder, ring: number[], opts: CurtainOptions): PlacedGate[] {
  const n = ring.length / 2;
  const outward = ringArea(ring) > 0 ? -1 : 1;
  const towerStone = opts.towerStone ?? opts.stone;
  const base = opts.base ?? 0;
  const towerOpts: TowerOptions =
    opts.cone !== undefined
      ? { crown: true, base, cone: { height: opts.towerRadius * 1.5, roof: opts.cone } }
      : { crown: true, base };

  // each gate goes on the edge it is nearest to
  const gatesOn: { t: number; gate: Gate }[][] = Array.from({ length: n }, () => []);
  for (const gate of opts.gates ?? []) {
    let best = -1;
    let bestD = Infinity;
    let bestT = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ap = ring[i * 2];
      const aq = ring[i * 2 + 1];
      const dp = ring[j * 2] - ap;
      const dq = ring[j * 2 + 1] - aq;
      const len2 = dp * dp + dq * dq || 1;
      const t = Math.max(0.12, Math.min(0.88, ((gate.p - ap) * dp + (gate.q - aq) * dq) / len2));
      const d = Math.hypot(gate.p - (ap + dp * t), gate.q - (aq + dq * t));
      if (d < bestD) {
        bestD = d;
        best = i;
        bestT = t;
      }
    }
    gatesOn[best].push({ t: bestT, gate });
  }

  const placed: PlacedGate[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ap = ring[i * 2];
    const aq = ring[i * 2 + 1];
    const bp = ring[j * 2];
    const bq = ring[j * 2 + 1];
    const len = Math.hypot(bp - ap, bq - aq);
    const up = (bp - ap) / len;
    const uq = (bq - aq) / len;
    const outP = -uq * outward;
    const outQ = up * outward;
    const angle = Math.atan2(uq, up);
    if (!opts.bareCorners?.includes(i))
      tower(b, ap, aq, opts.towerRadius, opts.towerHeight, towerStone, towerOpts);

    if (opts.openEdges?.includes(i)) continue;

    // the stretches of wall left between the gates
    const gates = gatesOn[i].sort((x, y) => x.t - y.t);
    let from = 0;
    const stretches: [number, number][] = [];
    for (const { t, gate } of gates) {
      const half = (gate.width ?? 7) / 2 + opts.towerRadius * 0.9;
      const at = t * len;
      stretches.push([from, at - half]);
      from = at + half;
      const gp = ap + up * at;
      const gq = aq + uq * at;
      // the gatehouse: a block over the passage, a tower either side, standing proud of the wall
      const gateHeight = opts.height + 4.5;
      const depth = opts.thickness + 5;
      b.volume(rect(gp, gq, half, depth / 2, angle), base + gateHeight, base, {
        ...opts.stone,
        pattern: Pattern.Tall,
      });
      for (const side of [-1, 1]) {
        tower(
          b,
          gp + up * half * side + outP * 2,
          gq + uq * half * side + outQ * 2,
          opts.towerRadius * 0.95,
          opts.towerHeight + 3,
          towerStone,
          towerOpts,
        );
      }
      placed.push({ name: gate.name, p: gp, q: gq, outP, outQ });
    }
    stretches.push([from, len]);

    for (const [s0, s1] of stretches) {
      if (s1 - s0 < 1) continue;
      wallPiece(b, ap + up * s0, aq + uq * s0, ap + up * s1, aq + uq * s1, opts);
      // towers along the stretch, evenly, never closer to its ends than half a spacing
      const count = Math.floor((s1 - s0) / opts.towerEvery);
      for (let k = 1; k <= count; k++) {
        const s = s0 + ((s1 - s0) * k) / (count + 1);
        if (s < opts.towerRadius * 3 || len - s < opts.towerRadius * 3) continue;
        tower(
          b,
          ap + up * s + outP * opts.towerRadius * 0.45,
          aq + uq * s + outQ * opts.towerRadius * 0.45,
          opts.towerRadius * 0.85,
          opts.towerHeight - 1,
          towerStone,
          towerOpts,
        );
      }
    }
  }
  return placed;
}

// ---------------------------------------------------------------------------------------------
// streets and houses
// ---------------------------------------------------------------------------------------------

export interface Street {
  path: number[];
  width: number;
  /** ground kind it is paved with */
  kind: number;
  name?: string;
  /** 0 for a main street, 1 for a lane off it, 2 for an alley off that */
  level: number;
}

export interface LaneOptions {
  seed: number;
  /** May a lane run here? (inside the walls, off the squares, not in the water…) */
  allowed: (p: number, q: number) => boolean;
  /** Distance between lanes leaving the same street, metres: [least, most]. */
  spacing: [number, number];
  /** How long a lane may grow: [least, most]. */
  reach: [number, number];
  /** Generations of lanes: 1 grows lanes off the main streets, 2 alleys off those, and so on. */
  depth: number;
  /** A lane stops (and joins) when it comes this close to another street. */
  join: number;
  width: [number, number];
  kind: number;
}

/**
 * Grow a web of lanes off a set of streets. Lanes leave at about a right angle, on alternate
 * sides, wander a little, and stop when they have gone far enough, would leave the allowed
 * ground, or run into another street, which they then join. Returns the new streets only.
 */
export function growLanes(streets: Street[], opts: LaneOptions): Street[] {
  const STEP = 12;
  const CELL = 24;
  const cells = new Map<string, number[]>(); // p, q, street index
  const all: Street[] = streets.slice();
  const index = (street: Street, id: number): void => {
    const pts = resample(street.path, STEP / 2);
    for (let i = 0; i < pts.length; i += 2) {
      const key = `${Math.floor(pts[i] / CELL)},${Math.floor(pts[i + 1] / CELL)}`;
      let list = cells.get(key);
      if (!list) cells.set(key, (list = []));
      list.push(pts[i], pts[i + 1], id);
    }
  };
  all.forEach(index);

  /** The nearest street point within `reach` that does not belong to `own`. */
  const nearest = (p: number, q: number, reach: number, own: number): [number, number] | null => {
    let best: [number, number] | null = null;
    let bestD = reach;
    const cx = Math.floor(p / CELL);
    const cy = Math.floor(q / CELL);
    const span = Math.ceil(reach / CELL);
    for (let y = cy - span; y <= cy + span; y++) {
      for (let x = cx - span; x <= cx + span; x++) {
        const list = cells.get(`${x},${y}`);
        if (!list) continue;
        for (let i = 0; i < list.length; i += 3) {
          if (list[i + 2] === own) continue;
          const d = Math.hypot(list[i] - p, list[i + 1] - q);
          if (d < bestD) {
            bestD = d;
            best = [list[i], list[i + 1]];
          }
        }
      }
    }
    return best;
  };

  const grown: Street[] = [];
  let generation = streets.map((_, i) => i);
  for (let level = 1; level <= opts.depth; level++) {
    const next: number[] = [];
    for (const parentId of generation) {
      const parent = all[parentId];
      const total = pathLength(parent.path);
      const salt = mix(opts.seed, parentId * 7919 + level);
      let s = opts.spacing[0] * (0.4 + rand(salt, 1) * 0.6);
      let side = rand(salt, 2) < 0.5 ? 1 : -1;
      let n = 0;
      while (s < total - opts.spacing[0] * 0.4) {
        const seed = mix(salt, ++n);
        const from = pointAlong(parent.path, s);
        // leave at a right angle, give or take
        const turn = (Math.PI / 2) * side + (rand(seed, 3) - 0.5) * 0.5;
        let heading = Math.atan2(from.dq, from.dp) + turn;
        const reach = opts.reach[0] + rand(seed, 4) * (opts.reach[1] - opts.reach[0]);
        const id = all.length;
        const pts: number[] = [from.p, from.q];
        let p = from.p;
        let q = from.q;
        let gone = 0;
        let joined = false;
        while (gone < reach) {
          heading += drift(seed, gone / 40) * 0.09;
          const np = p + Math.cos(heading) * STEP;
          const nq = q + Math.sin(heading) * STEP;
          if (!opts.allowed(np, nq)) break;
          // near another street: join it and stop (the parent only counts once we are clear of it)
          const hit = nearest(np, nq, opts.join, gone < opts.join * 1.6 ? parentId : -1);
          if (hit) {
            if (gone >= opts.join) {
              pts.push(hit[0], hit[1]);
              joined = true;
            }
            break;
          }
          pts.push(np, nq);
          p = np;
          q = nq;
          gone += STEP;
        }
        // a stub is not a lane
        if (pathLength(pts) >= (joined ? opts.join : opts.reach[0] * 0.5)) {
          const lane: Street = {
            path: pts,
            width: Math.max(
              2.8,
              opts.width[0] + rand(seed, 5) * (opts.width[1] - opts.width[0]) - (level - 1) * 0.6,
            ),
            kind: opts.kind,
            level: parent.level + 1,
          };
          all.push(lane);
          index(lane, id);
          grown.push(lane);
          next.push(id);
        }
        s += opts.spacing[0] + rand(seed, 6) * (opts.spacing[1] - opts.spacing[0]);
        side = -side;
      }
    }
    generation = next;
  }
  return grown;
}

export interface HouseRowOptions {
  seed: number;
  /** How rich the houses are at a spot, or null for no house there. */
  wealthAt: (p: number, q: number) => Wealth | null;
  /** Rows of houses behind each side of the street (1 = the frontage only). */
  rows: number;
  /** Chance that a plot is left empty: gardens, yards. */
  gaps?: number;
  /** Local materials, by how rich the house is (the common medieval ones otherwise). */
  palette?: (wealth: Wealth) => HousePalette | undefined;
}

/**
 * Line a street with houses: plots are stepped off along both sides, each a house whose front
 * faces the street, with further rows behind where asked. A house is only built where the ground
 * is free, and takes its ground when it is. Returns how many were built.
 */
export function lineWithHouses(
  b: SyntheticBuilder,
  occ: Occupancy,
  street: Street,
  opts: HouseRowOptions,
): number {
  const total = pathLength(street.path);
  let built = 0;
  for (const side of [-1, 1]) {
    for (let row = 0; row < opts.rows; row++) {
      let s = 1 + rand(opts.seed, side * 31 + row) * 4;
      let n = 0;
      let back = street.width / 2 + 0.7;
      // rows further back start behind an average house and its yard
      for (let r = 0; r < row; r++) back += 9.5;
      while (s < total - 3) {
        const seed = mix(opts.seed, side * 100003 + row * 1009 + ++n);
        const at = pointAlong(street.path, s);
        const wealth = opts.wealthAt(at.p - at.dq * side * back, at.q + at.dp * side * back);
        if (wealth === null) {
          s += 6;
          continue;
        }
        const width = [4.2, 5.4, 8][wealth] + rand(seed, 11) * [2.6, 3.6, 6][wealth];
        const depth = [5.5, 7, 9][wealth] + rand(seed, 12) * [2.5, 3.5, 5][wealth];
        const gap =
          wealth === 2 ? 1.5 + rand(seed, 13) * 4 : rand(seed, 13) < 0.25 ? 0.8 + rand(seed, 14) * 1.6 : 0;
        const mid = pointAlong(street.path, s + width / 2);
        const off = back + depth / 2 + (row > 0 ? rand(seed, 15) * 2.5 : 0);
        const cp = mid.p - mid.dq * side * off;
        const cq = mid.q + mid.dp * side * off;
        const corners = rect(cp, cq, width / 2, depth / 2, Math.atan2(mid.dq, mid.dp));
        if (rand(seed, 16) >= (opts.gaps ?? 0) && occ.isFree(corners)) {
          const { look: houseStyle, height } = houseLook(seed, wealth, opts.palette?.(wealth));
          b.volume(corners, height, 0, houseStyle);
          occ.blockRing(rect(cp, cq, width / 2 + 0.3, depth / 2 + 0.3, Math.atan2(mid.dq, mid.dp)));
          built++;
        }
        s += width + gap;
      }
    }
  }
  return built;
}

/** Pave a street: its line on the ground, and its ground taken so nothing is built on it. */
export function pave(b: SyntheticBuilder, occ: Occupancy, street: Street): void {
  b.line(street.kind, street.width, street.path);
  occ.blockPath(street.path, street.width + 0.6);
}

/** Scatter trees over a ring, about one per `each` square metres, where `ok` allows. */
export function plant(
  b: SyntheticBuilder,
  ring: number[],
  each: number,
  seed: number,
  ok: (p: number, q: number) => boolean = () => true,
): void {
  let pMin = Infinity;
  let pMax = -Infinity;
  let qMin = Infinity;
  let qMax = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    pMin = Math.min(pMin, ring[i]);
    pMax = Math.max(pMax, ring[i]);
    qMin = Math.min(qMin, ring[i + 1]);
    qMax = Math.max(qMax, ring[i + 1]);
  }
  const step = Math.sqrt(each);
  let n = 0;
  for (let q = qMin; q < qMax; q += step) {
    for (let p = pMin; p < pMax; p += step) {
      const s = mix(seed, ++n);
      const tp = p + rand(s, 1) * step;
      const tq = q + rand(s, 2) * step;
      if (insideRing(ring, tp, tq) && ok(tp, tq)) b.tree(tp, tq);
    }
  }
}

/** A blob: a ring around a centre whose radius wobbles smoothly, for woods, ponds and the edge of the map. */
export function blob(
  cp: number,
  cq: number,
  radius: number,
  wobble: number,
  seed: number,
  points = 28,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    // two octaves that both close on themselves around the circle
    const r =
      radius *
      (1 +
        wobble * 0.7 * Math.sin(a * 2 + rand(seed, 1) * 6.28) +
        wobble * 0.45 * Math.sin(a * 3 + rand(seed, 2) * 6.28) +
        wobble * 0.3 * Math.sin(a * 5 + rand(seed, 3) * 6.28));
    out.push(cp + Math.cos(a) * r, cq + Math.sin(a) * r);
  }
  return out;
}

/**
 * A flight of steps from a terrace down to the ground: `count` treads, the highest against the
 * terrace at (p, q), the lowest `run` metres away along the unit vector (dp, dq).
 */
export function steps(
  b: SyntheticBuilder,
  p: number,
  q: number,
  dp: number,
  dq: number,
  run: number,
  width: number,
  height: number,
  stone: Look,
  count = Math.max(3, Math.round(height / 1.4)),
): void {
  const tread = run / count;
  const angle = Math.atan2(dq, dp);
  for (let i = 0; i < count; i++) {
    const d = (i + 0.5) * tread;
    b.volume(
      rect(p + dp * d, q + dq * d, tread / 2 + 0.2, width / 2, angle),
      height * (1 - (i + 1) / (count + 1)),
      0,
      stone,
    );
  }
}

/** A tree built as volumes, for where the sprites cannot grow: on a terrace, a roof, a rock. */
export function standingTree(
  b: SyntheticBuilder,
  p: number,
  q: number,
  base: number,
  size: number,
  leaf: number,
  trunk: number = R.timber,
): void {
  b.prism(p, q, Math.max(0.5, size * 0.12), 6, base + size * 0.55, base, { wall: trunk, roof: trunk });
  b.prism(p, q, size * 0.55, 8, base + size * 1.25, base + size * 0.4, {
    wall: leaf,
    roof: leaf,
    roofShape: Roof.Dome,
    roofH: size * 0.5,
  });
}
