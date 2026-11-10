import { R } from "../render/palette.js";
import { fillPolygon } from "../render/raster.js";
import { mix, pick, rand } from "./hash.js";
import { G, Pattern, Roof } from "./kinds.js";
import { insideRing, rect, ribbon } from "./medieval.js";
import type { Look, SyntheticBuilder } from "./synthetic.js";

/**
 * What a generated *world* is laid out with: whole continents as a diorama, their places as
 * toy-scale models standing on them like pieces on a war table.
 *
 * A world is drawn with north up, so its geography is written in world coordinates (`e` east,
 * `n` north) and turned into the builder's grid metres here: with the grid at 45° to the compass
 * (`betaDeg: 45`), `p = (e + n)/√2` runs up-right on screen and `q = (e − n)/√2` down-right, which
 * puts east to the right and north straight up. The models themselves are built along the grid,
 * where the renderer draws boxes at their best, so every kit below works in grid metres.
 *
 * Nothing here is random: every choice is a hash of a seed and a position.
 */

const SQ = Math.SQRT1_2;

/** World east/north → grid metres. */
export const toPQ = (e: number, n: number): [number, number] => [(e + n) * SQ, (e - n) * SQ];
/** Grid metres → world east/north. */
export const toEN = (p: number, q: number): [number, number] => [(p + q) * SQ, (p - q) * SQ];

/** A flat `[e, n, …]` path as a flat `[p, q, …]` path (and back: the turn is its own inverse). */
export function pathPQ(en: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < en.length; i += 2) out.push((en[i] + en[i + 1]) * SQ, (en[i] - en[i + 1]) * SQ);
  return out;
}

// ---------------------------------------------------------------------------------------------
// coastlines
// ---------------------------------------------------------------------------------------------

function displace(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  seed: number,
  amount: number,
  minLen: number,
  out: number[],
): void {
  const len = Math.hypot(bx - ax, by - ay);
  if (len <= minLen) {
    out.push(bx, by);
    return;
  }
  // the same two ends give the same midpoint whichever way the line is walked, so two outlines
  // that share an edge still share it after roughening
  const swap = ax > bx || (ax === bx && ay > by);
  const x0 = swap ? bx : ax;
  const y0 = swap ? by : ay;
  const x1 = swap ? ax : bx;
  const y1 = swap ? ay : by;
  const h = mix(
    mix(Math.round(x0 * 8), Math.round(y0 * 8)),
    mix(Math.round(x1 * 8), Math.round(y1 * 8)) ^ seed,
  );
  const r = (h / 4294967296 - 0.5) * 2;
  const mx = (x0 + x1) / 2 - (y1 - y0) * r * amount;
  const my = (y0 + y1) / 2 + (x1 - x0) * r * amount;
  displace(ax, ay, mx, my, seed, amount, minLen, out);
  displace(mx, my, bx, by, seed, amount, minLen, out);
}

export interface RoughenOptions {
  /** How far a midpoint may be pushed, as a share of its segment's length. */
  amount?: number;
  /** Segments shorter than this are left alone. */
  minLen?: number;
  closed?: boolean;
}

/**
 * Midpoint displacement: a coarse outline drawn with a handful of corners becomes a coast with
 * capes and coves at every scale. Flat `[x, y, …]` in, flat out; the given corners are kept, in
 * their order, the first one first.
 */
export function roughen(points: number[], seed: number, opts: RoughenOptions = {}): number[] {
  const amount = opts.amount ?? 0.13;
  const minLen = opts.minLen ?? 30;
  const closed = opts.closed ?? true;
  const n = points.length / 2;
  const out: number[] = [];
  if (!closed) out.push(points[0], points[1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    displace(points[i * 2], points[i * 2 + 1], points[j * 2], points[j * 2 + 1], seed, amount, minLen, out);
  }
  if (closed) {
    // the walk ends on the first corner: put it first, where a ring starts
    const y = out.pop()!;
    const x = out.pop()!;
    out.unshift(x, y);
  }
  return out;
}

/**
 * Pairs written in sketch units (how a coast is drawn: a hundred units to one, unless the sketch
 * is stretched) as a flat list in units.
 */
export function sketch(pairs: ArrayLike<number>[], east = 100, north = 100): number[] {
  const out: number[] = [];
  for (const pair of pairs) out.push(pair[0] * east, pair[1] * north);
  return out;
}

/** A wobbly ring in world coordinates around a centre: `stretch` widens it east–west, `turn` rotates it. */
export function isle(
  e: number,
  n: number,
  radius: number,
  seed: number,
  stretch = 1,
  turn = 0,
  corners = 9,
): number[] {
  const out: number[] = [];
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  for (let i = 0; i < corners; i++) {
    const a = (i / corners) * Math.PI * 2;
    const r = radius * (0.74 + 0.52 * rand(seed, i));
    const x = Math.cos(a) * r * stretch;
    const y = Math.sin(a) * r;
    out.push(e + x * cos - y * sin, n + x * sin + y * cos);
  }
  return out;
}

/**
 * Where the land is, on a grid: what a generator asks before it puts anything down. Land shapes
 * are added, lakes and rivers taken away again; a cell is wet or dry by its centre.
 */
export class LandMask {
  readonly cols: number;
  readonly rows: number;
  private readonly cells: Uint8Array;

  constructor(
    readonly west: number,
    readonly south: number,
    east: number,
    north: number,
    readonly cell = 6,
  ) {
    this.cols = Math.ceil((east - west) / cell);
    this.rows = Math.ceil((north - south) / cell);
    this.cells = new Uint8Array(this.cols * this.rows);
  }

  /** Mark a ring (flat `[e, n, …]`) as land, or as water with `dry = false`. */
  add(ring: ArrayLike<number>, dry = true): void {
    const xy = new Float64Array(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      xy[i] = (ring[i] - this.west) / this.cell;
      xy[i + 1] = (ring[i + 1] - this.south) / this.cell;
    }
    const value = dry ? 1 : 0;
    fillPolygon(xy, [0, ring.length / 2], 0, 1, 0, 0, this.cols, this.rows, (y, x0, x1) =>
      this.cells.fill(value, y * this.cols + x0, y * this.cols + x1),
    );
  }

  has(e: number, n: number): boolean {
    const x = Math.floor((e - this.west) / this.cell);
    const y = Math.floor((n - this.south) / this.cell);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    return this.cells[y * this.cols + x] === 1;
  }

  /** True when a whole disc is dry (its centre and a ring of points on its rim). */
  holds(e: number, n: number, radius: number): boolean {
    if (!this.has(e, n)) return false;
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * Math.PI * 2;
      if (!this.has(e + Math.cos(angle) * radius, n + Math.sin(angle) * radius)) return false;
    }
    return true;
  }
}

/** Move a disc off the water: step away from whatever part of it is wet until none is. */
export function settle(mask: LandMask, e: number, n: number, radius: number): [number, number] {
  for (let step = 0; step < 90; step++) {
    let de = 0;
    let dn = 0;
    let wet = 0;
    for (let a = 0; a < 24; a++) {
      const angle = (a / 24) * Math.PI * 2;
      const ce = Math.cos(angle);
      const sn = Math.sin(angle);
      for (const t of [1, 0.55]) {
        if (mask.has(e + ce * radius * t, n + sn * radius * t)) continue;
        de -= ce;
        dn -= sn;
        wet++;
      }
    }
    if (wet === 0) break;
    const len = Math.hypot(de, dn);
    // water on every side alike: an islet smaller than the disc, nowhere better to go
    if (len < 0.5) break;
    e += (de / len) * 7;
    n += (dn / len) * 7;
  }
  return [e, n];
}

/** Which way the nearest water lies from a point, and how far, looking between `from` and `to`. */
export function nearestWater(
  mask: LandMask,
  e: number,
  n: number,
  from: number,
  to: number,
): { de: number; dn: number; dist: number } | null {
  for (let dist = from; dist <= to; dist += 6) {
    let de = 0;
    let dn = 0;
    let wet = 0;
    for (let a = 0; a < 32; a++) {
      const angle = (a / 32) * Math.PI * 2;
      if (mask.has(e + Math.cos(angle) * dist, n + Math.sin(angle) * dist)) continue;
      de += Math.cos(angle);
      dn += Math.sin(angle);
      wet++;
    }
    const len = Math.hypot(de, dn);
    if (wet > 0 && len > 0.2) return { de: de / len, dn: dn / len, dist };
  }
  return null;
}

/** The point of a path (flat) nearest to a point, with the direction the path runs there. */
export function nearestOnPath(
  path: ArrayLike<number>,
  x: number,
  y: number,
): { x: number; y: number; tx: number; ty: number; dist: number } {
  let best = { x: path[0], y: path[1], tx: 1, ty: 0, dist: Infinity };
  for (let i = 2; i < path.length; i += 2) {
    const ax = path[i - 2];
    const ay = path[i - 1];
    const dx = path[i] - ax;
    const dy = path[i + 1] - ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const dist = Math.hypot(x - px, y - py);
    if (dist < best.dist) {
      const len = Math.sqrt(len2);
      best = { x: px, y: py, tx: dx / len, ty: dy / len, dist };
    }
  }
  return best;
}

/** Trees one by one over a ring (flat, grid metres), about one per `each` square metres, where `ok` allows. */
export function grove(
  b: SyntheticBuilder,
  ring: number[],
  each: number,
  seed: number,
  ok: (p: number, q: number) => boolean = () => true,
): number {
  let pMin = Infinity;
  let qMin = Infinity;
  let qMax = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    pMin = Math.min(pMin, ring[i]);
    qMin = Math.min(qMin, ring[i + 1]);
    qMax = Math.max(qMax, ring[i + 1]);
  }
  const step = Math.sqrt(each);
  let n = 0;
  let planted = 0;
  for (let q = qMin; q < qMax; q += step) {
    // one crossing test per row: where the row enters and leaves the ring
    const cuts: number[] = [];
    const row = q + step / 2;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const aq = ring[j + 1];
      const bq = ring[i + 1];
      if (aq > row !== bq > row) cuts.push(ring[j] + ((row - aq) / (bq - aq)) * (ring[i] - ring[j]));
    }
    cuts.sort((a, c) => a - c);
    for (let c = 0; c + 1 < cuts.length; c += 2) {
      // columns on one lattice for every row, so the rows do not drift against each other
      const first = pMin + Math.ceil((cuts[c] - pMin) / step) * step;
      for (let p = first; p < cuts[c + 1]; p += step) {
        const s = mix(seed, ++n);
        const tp = p + (rand(s, 1) - 0.5) * step;
        const tq = row + (rand(s, 2) - 0.5) * step;
        if (!ok(tp, tq)) continue;
        b.tree(tp, tq);
        planted++;
      }
    }
  }
  return planted;
}

// ---------------------------------------------------------------------------------------------
// pieces
// ---------------------------------------------------------------------------------------------

/** What a region builds with. */
export interface Style {
  /** Curtain walls and keeps. */
  stone: number;
  /** Towers, where they differ from the walls. */
  tower?: number;
  /** Tower roofs: a cone of this material, or none (a crowned flat top). */
  cone?: number;
  /** Roof of halls and keeps. */
  roof: number;
  /** Houses: walls and roofs to pick from. */
  walls: number[];
  roofs: number[];
  /** Ground inside the walls (cobbles by default; negative for none). */
  floor?: number;
  /** Houses with flat roofs. */
  flat?: boolean;
}

const plain = (wall: number, roof = wall, extra: Partial<Look> = {}): Look => ({
  wall,
  roof,
  glass: R.glassBlack,
  ...extra,
});

/** A box: `hu` and `hv` are half its sides, `angle` turns it from the grid. */
export function block(
  b: SyntheticBuilder,
  p: number,
  q: number,
  hu: number,
  hv: number,
  height: number,
  look: Look | number,
  base = 0,
  angle = 0,
): void {
  b.volume(rect(p, q, hu, hv, angle), height, base, typeof look === "number" ? plain(look) : look);
}

export interface RoundOptions {
  cone?: number;
  /** Height of the cone as a share of the radius. */
  coneRise?: number;
  crown?: boolean;
  base?: number;
  sides?: number;
}

/** A round tower from the ground (or a base) up, crowned and roofed if asked. Returns the height of its tip. */
export function round(
  b: SyntheticBuilder,
  p: number,
  q: number,
  radius: number,
  height: number,
  wall: number,
  opts: RoundOptions = {},
): number {
  const base = opts.base ?? 0;
  const sides = opts.sides ?? (radius > 24 ? 16 : radius > 10 ? 12 : 8);
  const top = base + height;
  b.prism(p, q, radius, sides, top, base, plain(wall));
  let tip = top;
  if (opts.crown ?? true) {
    b.prism(p, q, radius * 1.14, sides, top + radius * 0.22, top - radius * 0.3, plain(wall));
    tip = top + radius * 0.22;
  }
  if (opts.cone !== undefined) {
    const rise = radius * (opts.coneRise ?? 1.5);
    b.prism(p, q, radius * 1.08, sides, tip + rise, tip, {
      wall,
      roof: opts.cone,
      roofShape: Roof.Pyramid,
      roofH: rise,
    });
    tip += rise;
  }
  return tip;
}

export interface HallOptions {
  base?: number;
  angle?: number;
  pattern?: Pattern;
  flat?: boolean;
}

/** A house or a hall under a pitched roof (or a flat one). */
export function hall(
  b: SyntheticBuilder,
  p: number,
  q: number,
  hu: number,
  hv: number,
  height: number,
  wall: number,
  roof: number,
  opts: HallOptions = {},
): void {
  const base = opts.base ?? 0;
  const look: Look = { wall, roof, glass: R.glassBlack, pattern: opts.pattern ?? Pattern.House };
  if (!opts.flat) {
    look.roofShape = Roof.Pitched;
    look.roofH = Math.min(height * 0.42, Math.min(hu, hv) * 0.95);
  }
  b.volume(rect(p, q, hu, hv, opts.angle ?? 0), base + height, base, look);
}

/** A square keep with a turret at each corner. Returns the height of its roof. */
export function keep(
  b: SyntheticBuilder,
  p: number,
  q: number,
  half: number,
  height: number,
  style: Style,
  opts: { base?: number; turrets?: boolean } = {},
): number {
  const base = opts.base ?? 0;
  const look = plain(style.stone, style.roof, { pattern: Pattern.Sparse });
  block(b, p, q, half, half * 0.82, base + height, look, base);
  if (opts.turrets ?? true) {
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      round(b, p + su * half, q + sv * half * 0.82, half * 0.3, height * 1.14, style.tower ?? style.stone, {
        base,
        cone: style.cone,
      });
    }
  }
  return base + height;
}

/** A stepped pyramid: boxes shrinking as they rise, in the given materials turn by turn. */
export function ziggurat(
  b: SyntheticBuilder,
  p: number,
  q: number,
  half: number,
  height: number,
  steps: number,
  walls: number[],
  base = 0,
): number {
  for (let i = 0; i < steps; i++) {
    const size = half * (1 - (i / steps) * 0.86);
    const top = base + (height * (i + 1)) / steps;
    block(b, p, q, size, size, top, walls[i % walls.length], base + (height * i) / steps);
  }
  return base + height;
}

/** A dome on a drum. */
export function dome(
  b: SyntheticBuilder,
  p: number,
  q: number,
  radius: number,
  height: number,
  wall: number,
  roof: number,
  base = 0,
): void {
  b.prism(p, q, radius, radius > 20 ? 16 : 12, base + height, base, {
    wall,
    roof,
    glass: R.glassBlack,
    roofShape: Roof.Dome,
    roofH: Math.min(height * 0.6, radius * 0.95),
  });
}

/** A peak: a pyramid of rock, with a cap (snow, fire) lying on its top if one is given. */
export function peak(
  b: SyntheticBuilder,
  p: number,
  q: number,
  radius: number,
  height: number,
  rock: number,
  seed: number,
  cap?: number,
): void {
  const sides = 5 + (mix(seed, 3) % 3);
  b.prism(p, q, radius, sides, height, 0, {
    wall: rock,
    roof: rock,
    roofShape: Roof.Pyramid,
    roofH: height * 0.97,
  });
  if (cap !== undefined) {
    // the same slope, from part of the way up
    const from = 0.5 + rand(seed, 4) * 0.16;
    b.prism(p, q, radius * (1 - from) * 1.06, sides, height * 1.01, height * from, {
      wall: cap,
      roof: cap,
      roofShape: Roof.Pyramid,
      roofH: height * (1.01 - from),
    });
  }
}

export interface RangeOptions {
  /** Width of the range, across its line. */
  width: number;
  /** Tallest peaks, along the middle. */
  height: number;
  /** Distance between peaks. */
  spacing?: number;
  rock: number;
  /** Peaks taller than `above` get a cap of this material. */
  cap?: { above: number; of: number };
  seed: number;
  /** Where a peak of a given radius may stand (grid metres). */
  ok?: (p: number, q: number, radius: number) => boolean;
  /** Ground kind laid under the range (rock by default; none if negative). */
  floor?: number;
}

/**
 * A mountain range along a path: rows of peaks, tallest along the spine, dying away towards the
 * range's ends and edges. Returns how many peaks were raised.
 */
export function range(b: SyntheticBuilder, path: number[], opts: RangeOptions): number {
  const spacing = opts.spacing ?? 105;
  const floor = opts.floor ?? G.Rock;
  if (floor >= 0) b.ground(floor, ribbon(path, opts.width * 0.92));
  let total = 0;
  for (let i = 2; i < path.length; i += 2)
    total += Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
  const rows = Math.max(1, Math.round(opts.width / spacing));
  let count = 0;
  let walked = 0;
  let index = 0;
  for (let i = 2; i < path.length; i += 2) {
    const ap = path[i - 2];
    const aq = path[i - 1];
    const len = Math.hypot(path[i] - ap, path[i + 1] - aq);
    if (len < 1) continue;
    const up = (path[i] - ap) / len;
    const uq = (path[i + 1] - aq) / len;
    for (let s = (spacing - (walked % spacing)) % spacing; s < len; s += spacing) {
      const along = (walked + s) / total;
      const ends = Math.min(1, 0.35 + along * 4, 0.35 + (1 - along) * 4);
      for (let row = 0; row < rows; row++) {
        const seed = mix(opts.seed, index++);
        const across = rows === 1 ? 0 : (row / (rows - 1) - 0.5) * 2;
        const off = across * (opts.width / 2 - spacing * 0.3) + (rand(seed, 1) - 0.5) * spacing * 0.7;
        const fwd = s + (rand(seed, 2) - 0.5) * spacing * 0.7;
        const p = ap + up * fwd - uq * off;
        const q = aq + uq * fwd + up * off;
        const shoulder = 1 - Math.abs(across) * 0.5;
        const height = opts.height * ends * shoulder * (0.55 + rand(seed, 5) * 0.45);
        const radius =
          spacing * (0.62 + rand(seed, 6) * 0.3) * Math.max(0.62, Math.sqrt(height / opts.height));
        if (opts.ok && !opts.ok(p, q, radius)) continue;
        const capped = opts.cap && height > opts.cap.above ? opts.cap.of : undefined;
        peak(b, p, q, radius, height, opts.rock, seed, capped);
        count++;
      }
    }
    walked += len;
  }
  return count;
}

/** A ring of corners around a centre, each pushed in or out a little; `turn` rotates it. */
export function polygon(
  p: number,
  q: number,
  radius: number,
  sides: number,
  seed: number,
  wobble = 0.1,
  turn = 0,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((i + 0.5) / sides) * Math.PI * 2 + turn;
    const r = radius * (1 + (rand(seed, i) - 0.5) * 2 * wobble);
    out.push(p + Math.cos(a) * r, q + Math.sin(a) * r);
  }
  return out;
}

export interface WallRingOptions {
  height: number;
  thickness: number;
  wall: number;
  towerRadius: number;
  towerHeight: number;
  tower?: number;
  cone?: number;
  /** Edges (corner i to the next) with a gatehouse in the middle. */
  gates?: number[];
  /** Edges left open. */
  open?: number[];
  /** No towers at all: a bare wall. */
  bare?: boolean;
  base?: number;
}

/** A curtain wall around a ring of corners, a tower on each, a gatehouse where asked. */
export function wallRing(b: SyntheticBuilder, ring: number[], opts: WallRingOptions): void {
  const n = ring.length / 2;
  const base = opts.base ?? 0;
  const tower = opts.tower ?? opts.wall;
  const towerOpts = { base, cone: opts.cone };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ap = ring[i * 2];
    const aq = ring[i * 2 + 1];
    const bp = ring[j * 2];
    const bq = ring[j * 2 + 1];
    if (!opts.bare) round(b, ap, aq, opts.towerRadius, opts.towerHeight, tower, towerOpts);
    if (opts.open?.includes(i)) continue;
    const len = Math.hypot(bp - ap, bq - aq);
    const angle = Math.atan2(bq - aq, bp - ap);
    const mp = (ap + bp) / 2;
    const mq = (aq + bq) / 2;
    b.volume(rect(mp, mq, len / 2, opts.thickness / 2, angle), base + opts.height, base, plain(opts.wall));
    if (opts.gates?.includes(i)) {
      b.volume(
        rect(mp, mq, opts.towerRadius * 1.5, opts.thickness * 0.95, angle),
        base + opts.towerHeight * 0.92,
        base,
        plain(opts.wall, opts.wall, { pattern: Pattern.Sparse }),
      );
      const up = (bp - ap) / len;
      const uq = (bq - aq) / len;
      for (const side of [-1, 1])
        round(
          b,
          mp + up * side * opts.towerRadius * 1.7,
          mq + uq * side * opts.towerRadius * 1.7,
          opts.towerRadius * 0.8,
          opts.towerHeight * 1.05,
          tower,
          towerOpts,
        );
    } else if (!opts.bare && len > opts.towerRadius * 13) {
      // a long stretch gets a tower half-way
      round(b, mp, mq, opts.towerRadius * 0.85, opts.towerHeight * 0.92, tower, towerOpts);
    }
  }
}

export interface HousesOptions {
  count: number;
  /** Half the long side of a typical house. */
  size?: number;
  /** Spots to keep clear: [p, q, radius]. */
  avoid?: number[][];
  /** Stay inside this ring, if given. */
  inside?: number[];
  /** Taller houses (a rich or crowded town). */
  tall?: number;
  base?: number;
  ok?: (p: number, q: number) => boolean;
}

/** Houses scattered over a disc, none on top of another. Returns where they stand: [p, q, radius]. */
export function houses(
  b: SyntheticBuilder,
  p: number,
  q: number,
  radius: number,
  style: Style,
  seed: number,
  opts: HousesOptions,
): number[][] {
  const size = opts.size ?? 8;
  const placed: number[][] = [];
  const avoid = opts.avoid ?? [];
  for (let attempt = 0; attempt < opts.count * 14 && placed.length < opts.count; attempt++) {
    const s = mix(seed, attempt);
    const a = rand(s, 1) * Math.PI * 2;
    const r = Math.sqrt(rand(s, 2)) * radius;
    const hp = p + Math.cos(a) * r;
    const hq = q + Math.sin(a) * r;
    const hu = size * (0.8 + rand(s, 3) * 0.55);
    const hv = size * (0.55 + rand(s, 4) * 0.3);
    const reach = Math.max(hu, hv) * 1.2;
    if (opts.inside && !insideRing(opts.inside, hp, hq)) continue;
    if (opts.ok && !opts.ok(hp, hq)) continue;
    let clear = true;
    for (const [op, oq, or] of avoid) {
      if (Math.hypot(hp - op, hq - oq) < or + reach) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    for (const [op, oq, or] of placed) {
      if (Math.hypot(hp - op, hq - oq) < or + reach) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;
    const turned = rand(s, 5) < 0.5;
    const height = size * (0.85 + rand(s, 6) * 0.75) * (opts.tall ?? 1);
    const wall = pick(style.walls, s, 7);
    const roof = pick(style.roofs, s, 8);
    hall(b, hp, hq, turned ? hv : hu, turned ? hu : hv, height, wall, roof, {
      base: opts.base,
      flat: style.flat,
    });
    placed.push([hp, hq, reach]);
  }
  return placed;
}

/** A ship: hull, mast and sail. `angle` is where the bow points (grid radians). */
export function ship(
  b: SyntheticBuilder,
  p: number,
  q: number,
  length: number,
  angle: number,
  hull: number = R.timber,
  sail: number = R.cream,
): void {
  block(b, p, q, length / 2, length * 0.16, length * 0.14, hull, 0, angle);
  b.prism(p, q, length * 0.035, 6, length * 0.75, 0, plain(R.timber));
  block(b, p, q, length * 0.04, length * 0.3, length * 0.68, sail, length * 0.24, angle);
}

/** Piers running out from a shore point along a direction, with ships alongside. */
export function harbour(
  b: SyntheticBuilder,
  p: number,
  q: number,
  dp: number,
  dq: number,
  width: number,
  reach: number,
  seed: number,
  hull: number = R.timber,
): void {
  const len = Math.hypot(dp, dq) || 1;
  const up = dp / len;
  const uq = dq / len;
  const piers = Math.max(2, Math.round(width / 50));
  const angle = Math.atan2(uq, up);
  for (let i = 0; i < piers; i++) {
    const off = (i / (piers - 1) - 0.5) * width;
    const bp = p - uq * off;
    const bq = q + up * off;
    b.ground(G.Pier, rect(bp + up * reach * 0.5, bq + uq * reach * 0.5, reach * 0.5, 5, angle));
    if (rand(seed, i) < 0.8) {
      const out = reach * (0.72 + rand(seed, i + 9) * 0.22);
      ship(b, bp + up * out - uq * 16, bq + uq * out + up * 16, 34, angle, hull);
    }
  }
}

/** Rock piled up to stand a castle on: a few prisms, each smaller than the one below. Returns the top's height. */
export function crag(
  b: SyntheticBuilder,
  p: number,
  q: number,
  radius: number,
  height: number,
  rock: number,
  seed: number,
  tiers = 3,
  top: number = rock,
): number {
  for (let i = 0; i < tiers; i++) {
    const s = mix(seed, i);
    const last = i === tiers - 1;
    b.prism(
      p + (last ? 0 : (rand(s, 1) - 0.5) * radius * 0.12),
      q + (last ? 0 : (rand(s, 2) - 0.5) * radius * 0.12),
      radius * (1 - (i / tiers) * 0.6),
      7 + (s % 3),
      (height * (i + 1)) / tiers,
      (height * i) / tiers,
      plain(rock, last ? top : rock),
    );
  }
  return height;
}

export interface CastleOptions {
  /** A second wall inside the first. */
  double?: boolean;
  moat?: boolean;
  /** Corners of the curtain (4 by default). */
  sides?: number;
  turn?: number;
  keepHeight?: number;
  /** What the castle stands on. */
  base?: number;
  /** Outbuildings inside the walls. */
  yard?: number;
  /** Ground inside (the style's by default; negative for none). */
  floor?: number;
}

/** A castle: curtain wall with towers and a gate, a keep, a hall and a few buildings in the yard. */
export function castle(
  b: SyntheticBuilder,
  p: number,
  q: number,
  size: number,
  style: Style,
  seed: number,
  opts: CastleOptions = {},
): void {
  const base = opts.base ?? 0;
  const sides = opts.sides ?? 4;
  const turn = opts.turn ?? 0;
  const ring = polygon(p, q, size, sides, seed, 0.07, turn);
  const floor = opts.floor ?? style.floor ?? G.Cobble;
  if (base === 0) {
    if (opts.moat) {
      const outer = polygon(p, q, size * 1.4, 14, seed + 1, 0.04);
      b.ground(G.Lake, [outer, polygon(p, q, size * 1.14, 14, seed + 2, 0.03)]);
    }
    if (floor >= 0) b.ground(floor, polygon(p, q, size * 1.02, 14, seed + 3, 0.02));
  }
  const wall: WallRingOptions = {
    height: size * 0.2,
    thickness: size * 0.08,
    wall: style.stone,
    tower: style.tower,
    cone: style.cone,
    towerRadius: size * 0.11,
    towerHeight: size * 0.32,
    gates: [sides - 1],
    base,
  };
  wallRing(b, ring, wall);
  if (opts.double)
    wallRing(b, polygon(p, q, size * 0.74, sides, seed, 0.07, turn), {
      ...wall,
      height: size * 0.27,
      towerHeight: size * 0.4,
      towerRadius: size * 0.09,
    });
  const inner = opts.double ? size * 0.5 : size * 0.62;
  const kp = p - inner * 0.22;
  const kq = q - inner * 0.18;
  keep(b, kp, kq, size * 0.2, opts.keepHeight ?? size * 0.52, style, { base });
  const hp = p + inner * 0.36;
  const hq = q + inner * 0.22;
  hall(b, hp, hq, size * 0.19, size * 0.1, size * 0.2, style.stone, style.roof, {
    base,
    pattern: Pattern.Tall,
  });
  houses(b, p, q, inner * 0.9, style, seed + 7, {
    count: opts.yard ?? 5,
    size: size * 0.06,
    base,
    avoid: [
      [kp, kq, size * 0.3],
      [hp, hq, size * 0.22],
    ],
  });
}

/** A holdfast: a tower house and a hall in a yard of sheds, inside a palisade. */
export function holdfast(
  b: SyntheticBuilder,
  p: number,
  q: number,
  size: number,
  style: Style,
  seed: number,
  opts: { palisade?: number; base?: number; floor?: number } = {},
): void {
  const base = opts.base ?? 0;
  const floor = opts.floor ?? style.floor ?? G.DirtRoad;
  if (base === 0 && floor >= 0) b.ground(floor, polygon(p, q, size * 1.03, 12, seed + 3, 0.03));
  wallRing(b, polygon(p, q, size, 7, seed, 0.1), {
    height: size * 0.16,
    thickness: size * 0.07,
    wall: opts.palisade ?? R.timber,
    towerRadius: size * 0.1,
    towerHeight: size * 0.24,
    bare: true,
    gates: [3],
    base,
  });
  const tp = p - size * 0.2;
  const tq = q - size * 0.15;
  const top = base + size * 0.75;
  block(
    b,
    tp,
    tq,
    size * 0.2,
    size * 0.2,
    top,
    plain(style.stone, style.roof, { pattern: Pattern.Sparse }),
    base,
  );
  b.volume(rect(tp, tq, size * 0.23, size * 0.23), top + size * 0.24, top, {
    wall: style.stone,
    roof: style.roof,
    roofShape: Roof.Pyramid,
    roofH: size * 0.22,
  });
  const hp = p + size * 0.3;
  const hq = q + size * 0.18;
  hall(b, hp, hq, size * 0.26, size * 0.14, size * 0.3, style.walls[0], style.roofs[0], { base });
  houses(b, p, q, size * 0.72, style, seed + 5, {
    count: 4,
    size: size * 0.1,
    base,
    avoid: [
      [tp, tq, size * 0.32],
      [hp, hq, size * 0.3],
    ],
  });
}

/** The edge of a ring (corner i to the next) whose middle looks most squarely along a direction from the centre. */
export function facingEdge(ring: number[], p: number, q: number, dp: number, dq: number): number {
  const n = ring.length / 2;
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mp = (ring[i * 2] + ring[j * 2]) / 2 - p;
    const mq = (ring[i * 2 + 1] + ring[j * 2 + 1]) / 2 - q;
    const dot = mp * dp + mq * dq;
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return best;
}

export type Landmark = "keep" | "sept" | "dome" | "pyramid" | "tower" | "none";

export interface CityOptions {
  houses: number;
  sides?: number;
  landmark?: Landmark;
  /** A castle of its own inside the walls. */
  citadel?: boolean;
  gates?: number[];
  /** Direction (grid) from the centre to the water, and how far the piers reach beyond the walls. */
  port?: { dp: number; dq: number; reach: number };
  /** No walls at all. */
  open?: boolean;
  /** Materials of a pyramid landmark, tier by tier. */
  tiers?: number[];
  /** Taller houses. */
  tall?: number;
  houseSize?: number;
  wallHeight?: number;
  /** More spots for the houses to keep off: [p, q, radius]. */
  avoid?: number[][];
  ok?: (p: number, q: number) => boolean;
}

/**
 * A town or a city: walls, towers and gates, a landmark, a citadel perhaps, piers where it meets
 * the water, and houses. Returns the ring of its walls.
 */
export function city(
  b: SyntheticBuilder,
  p: number,
  q: number,
  radius: number,
  style: Style,
  seed: number,
  opts: CityOptions,
): number[] {
  const sides = opts.sides ?? (radius > 170 ? 12 : radius > 100 ? 10 : 8);
  const ring = polygon(p, q, radius, sides, seed, 0.08);
  const floor = style.floor ?? G.Cobble;
  if (floor >= 0) b.ground(floor, opts.open ? polygon(p, q, radius, 14, seed + 5, 0.14) : ring);
  let open: number[] = [];
  if (opts.port) {
    const { dp, dq } = opts.port;
    const best = facingEdge(ring, p, q, dp, dq);
    open = [best];
    const j = (best + 1) % sides;
    const mp = (ring[best * 2] + ring[j * 2]) / 2;
    const mq = (ring[best * 2 + 1] + ring[j * 2 + 1]) / 2;
    harbour(b, mp, mq, dp, dq, radius * 0.62, opts.port.reach, seed + 11);
  }
  const wallHeight = opts.wallHeight ?? 15;
  if (!opts.open)
    wallRing(b, ring, {
      height: wallHeight,
      thickness: 7,
      wall: style.stone,
      tower: style.tower,
      cone: style.cone,
      towerRadius: 8.5,
      towerHeight: wallHeight * 1.6,
      gates: (opts.gates ?? [1, Math.floor(sides / 2) + 1]).filter((g) => !open.includes(g)),
      open,
    });
  const avoid: number[][] = [...(opts.avoid ?? [])];
  const landmark = opts.landmark ?? "keep";
  const lp = p + radius * 0.1;
  const lq = q - radius * 0.12;
  const scale = Math.min(radius, 150);
  if (landmark === "keep") {
    keep(b, lp, lq, scale * 0.13, scale * 0.36, style);
    avoid.push([lp, lq, scale * 0.2]);
  } else if (landmark === "sept") {
    const cone = style.cone ?? style.roof;
    dome(b, lp, lq, scale * 0.14, scale * 0.3, style.walls[0], cone);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const tp = lp + Math.cos(a) * scale * 0.2;
      const tq = lq + Math.sin(a) * scale * 0.2;
      round(b, tp, tq, scale * 0.028, scale * 0.34, style.walls[0], { cone, crown: false });
    }
    avoid.push([lp, lq, scale * 0.25]);
  } else if (landmark === "dome") {
    dome(b, lp, lq, scale * 0.15, scale * 0.3, style.stone, style.cone ?? style.roof);
    avoid.push([lp, lq, scale * 0.19]);
  } else if (landmark === "pyramid") {
    ziggurat(b, lp, lq, scale * 0.24, scale * 0.5, 7, opts.tiers ?? [style.stone]);
    avoid.push([lp, lq, scale * 0.36]);
  } else if (landmark === "tower") {
    round(b, lp, lq, scale * 0.07, scale * 0.75, style.tower ?? style.stone, { cone: style.cone });
    avoid.push([lp, lq, scale * 0.12]);
  }
  if (opts.citadel) {
    const cp = p - radius * 0.46;
    const cq = q + radius * 0.3;
    castle(b, cp, cq, scale * 0.3, style, seed + 21, { yard: 2 });
    avoid.push([cp, cq, scale * 0.36]);
  }
  houses(b, p, q, radius * (opts.open ? 1 : 0.9), style, seed + 31, {
    count: opts.houses,
    size: opts.houseSize ?? 8,
    avoid,
    inside: opts.open ? undefined : polygon(p, q, radius * 0.87, sides, seed, 0.08),
    tall: opts.tall,
    ok: opts.ok,
  });
  return ring;
}

/** A ruin: stumps of towers and broken lengths of wall around a floor of rubble. */
export function ruin(
  b: SyntheticBuilder,
  p: number,
  q: number,
  radius: number,
  wall: number,
  seed: number,
  towers = 5,
  floor: number = G.Rock,
): void {
  if (floor >= 0) b.ground(floor, polygon(p, q, radius, 9, seed, 0.2));
  const spots: number[][] = [];
  for (let i = 0; i < towers * 6 && spots.length < towers; i++) {
    const s = mix(seed, i);
    const a = rand(s, 1) * Math.PI * 2;
    const r = radius * (0.2 + rand(s, 2) * 0.62);
    const tp = p + Math.cos(a) * r;
    const tq = q + Math.sin(a) * r;
    const tr = radius * (0.08 + rand(s, 3) * 0.06);
    if (spots.some(([op, oq, or]) => Math.hypot(tp - op, tq - oq) < or + tr + radius * 0.08)) continue;
    spots.push([tp, tq, tr]);
    const h = radius * (0.2 + rand(s, 4) * 0.5);
    b.prism(tp, tq, tr, 8, h, 0, plain(wall));
    // a broken top: a thinner stump off-centre
    b.prism(tp + tr * 0.3, tq - tr * 0.2, tr * 0.55, 6, h * (1.15 + rand(s, 5) * 0.3), h, plain(wall));
  }
  for (let i = 0; i < towers + 2; i++) {
    const s = mix(seed, i + 40);
    const a = rand(s, 1) * Math.PI * 2;
    const r = radius * (0.72 + rand(s, 2) * 0.24);
    const len = radius * (0.1 + rand(s, 3) * 0.14);
    const height = radius * (0.06 + rand(s, 4) * 0.12);
    block(b, p + Math.cos(a) * r, q + Math.sin(a) * r, len, radius * 0.03, height, wall, 0, a + Math.PI / 2);
  }
}

/** A camp: tents in a rough ring around a larger one. */
export function camp(
  b: SyntheticBuilder,
  p: number,
  q: number,
  radius: number,
  seed: number,
  count = 14,
): void {
  const tent = (tp: number, tq: number, r: number, wall: number): void =>
    b.prism(tp, tq, r, 7, r * 1.25, 0, { wall, roof: wall, roofShape: Roof.Pyramid, roofH: r * 1.05 });
  tent(p, q, radius * 0.16, R.cream);
  for (let i = 0; i < count; i++) {
    const s = mix(seed, i);
    const a = (i / count) * Math.PI * 2 + rand(s, 1) * 0.5;
    const r = radius * (0.4 + rand(s, 2) * 0.6);
    const size = radius * (0.06 + rand(s, 3) * 0.05);
    tent(p + Math.cos(a) * r, q + Math.sin(a) * r, size, pick([R.tan, R.cream, R.thatch, R.ochre], s, 4));
  }
}

/** A tree built as volumes, for where the sprites cannot grow or would be too small to matter. */
export function bigTree(
  b: SyntheticBuilder,
  p: number,
  q: number,
  size: number,
  leaf: number,
  trunk: number = R.timber,
  base = 0,
): void {
  b.prism(p, q, Math.max(0.6, size * 0.1), 6, base + size * 0.6, base, plain(trunk));
  b.prism(p, q, size * 0.5, 8, base + size * 1.25, base + size * 0.42, {
    wall: leaf,
    roof: leaf,
    roofShape: Roof.Dome,
    roofH: size * 0.5,
  });
}
