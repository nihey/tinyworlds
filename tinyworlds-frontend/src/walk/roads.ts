import type { RoadNode, StreetEdge, WalkCell } from "./cell";
import { CELL } from "./geo";
import type { CarKind } from "./kinds";
import { CARS, newVehicle, nextVehicleId, pickCar, vehicleBlocked, type Vehicle } from "./vehicles";
import { cellExists } from "./walk-index";
import type { WalkWorld } from "./world";

/**
 * The streets traffic drives: the road network of the squares that are in, its lanes and how far
 * they keep from the crossings, and the cars parked along the kerbs. No three.js, no DOM. World
 * metres east and north; headings radians from north, clockwise.
 */

/** Speeds by class, m/s (0 motorway … 6 unclassified); a link goes at 0.7 of its class's. */
export const SPEEDS = [22, 18, 12, 12, 10, 8.5, 8];
const LINK_SPEED = 0.7;
/** A lane's width, m. */
export const LANE = 3.3;

// parking
/** Cars park on streets this wide or wider, on the ground, neither motorway nor trunk nor a link. */
const PARK_WIDTH = 9;
/** A parked car stands this far off the kerb; a kerb's parking takes this much of the street. */
const KERB_GAP = 0.2;
const PARK_STRIP = 2.2;
/** A spot's length along the kerb, and how many of them have a car. */
const SPOT = 6.5;
const FILLED = 2 / 3;
/** How far parking keeps from a crossing beyond the crossing street's half width, and from a dead end, m. */
const PARK_CORNER = 5;
const PARK_END = 3;
/** Paints a car may have: an index the renderer turns into the palette's colours. 0 is red. */
export const PAINTS = 8;
export const PAINT_RED = 0;

// the lanes and their junctions
/** The stop line: this far before a lane meets the crossing, m; the front of a car stops at it. */
export const STOP_LINE = 2;
/** Lanes stop this far beyond a crossing street's half width: at least 0.6 m, at most 42% of the edge. */
const JUNCTION = 1;
const JUNCTION_MIN = 0.6;
const JUNCTION_SHARE = 0.42;
/** A lane change begins this share of its lane from the lane's start and takes 30 m at most, never the last share. */
const CHANGE_END = 0.15;
const CHANGE_LENGTH = 30;
const CHANGE_STEP = 4;
/** Streets meeting at a narrower angle than this sine's are reckoned at it (a fork's reach is capped by its edge's share anyway). */
const MIN_SINE = 0.1;
/** A lane fits a car this much narrower than it. */
const FIT = 0.3;
/** Portals match a tunnel's ends this near, m. */
export const PORTAL_MATCH = 2;

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const smooth = (t: number) => t * t * (3 - 2 * t);
/** An angle in (−π, π]. */
export const wrap = (a: number) => {
  const x = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return x === 0 ? Math.PI : x - Math.PI;
};

/** A key for a pair of grid indices (each within ±32768), for maps of buckets. */
export const packKey = (x: number, y: number) => (x + 32768) * 65536 + (y + 32768);
/** The key of the `size`-metre bucket a point is in. */
export const bucketKey = (e: number, n: number, size: number) =>
  packKey(Math.floor(e / size), Math.floor(n / size));

/** A street's speed for its class, m/s. */
export function speedOf(edge: StreetEdge): number {
  return (SPEEDS[edge.cls] ?? SPEEDS[SPEEDS.length - 1]) * (edge.link ? LINK_SPEED : 1);
}

/** FNV-1a over a string: what a parked car's place comes from, the same every visit. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small deterministic sequence of numbers in [0, 1) from a seed (mulberry32). */
function sequence(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- polylines ----------

/** An edge's centreline in one direction of travel: e, n, z per point and the plan distance to each. */
export interface Line {
  p: number[];
  c: number[];
  len: number;
}

export interface Point {
  e: number;
  n: number;
  z: number;
  /** the unit tangent, east and north */
  te: number;
  tn: number;
}

const lines = new WeakMap<StreetEdge, [Line, Line]>();

export function lineOf(edge: StreetEdge, forward: boolean): Line {
  let pair = lines.get(edge);
  if (!pair) {
    const pts: number[] = [];
    const q = edge.pts;
    for (let k = 0; k < q.length; k += 3) {
      const m = pts.length;
      if (m >= 3 && Math.hypot(q[k] - pts[m - 3], q[k + 1] - pts[m - 2]) < 1e-3) continue;
      pts.push(q[k], q[k + 1], q[k + 2]);
    }
    if (pts.length < 6) pts.push(pts[0] + 1e-3, pts[1], pts[2]);
    const back: number[] = [];
    for (let k = pts.length - 3; k >= 0; k -= 3) back.push(pts[k], pts[k + 1], pts[k + 2]);
    const make = (p: number[]): Line => {
      const c = [0];
      for (let k = 3; k < p.length; k += 3)
        c.push(c[c.length - 1] + Math.hypot(p[k] - p[k - 3], p[k + 1] - p[k - 2]));
      return { p, c, len: c[c.length - 1] };
    };
    lines.set(edge, (pair = [make(pts), make(back)]));
  }
  return forward ? pair[0] : pair[1];
}

/** The segment of a line that distance s falls in. */
function segmentAt(line: Line, s: number): number {
  let lo = 0;
  let hi = line.c.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line.c[mid] <= s) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The point `s` along a line (clamped), moved `off` metres to its right, and the line's direction there. */
export function pointOn(line: Line, s: number, off: number): Point {
  s = clamp(s, 0, line.len);
  const i = segmentAt(line, s);
  const p = line.p;
  const de = p[i * 3 + 3] - p[i * 3];
  const dn = p[i * 3 + 4] - p[i * 3 + 1];
  const seg = line.c[i + 1] - line.c[i];
  const t = seg > 1e-9 ? (s - line.c[i]) / seg : 0;
  const l = Math.hypot(de, dn) || 1;
  const te = de / l;
  const tn = dn / l;
  return {
    e: p[i * 3] + de * t + tn * off,
    n: p[i * 3 + 1] + dn * t - te * off,
    z: p[i * 3 + 2] + (p[i * 3 + 5] - p[i * 3 + 2]) * t,
    te,
    tn,
  };
}

/** The heading a line leaves its start with (or, `atEnd`, arrives at its end with), over its first (last) 6 m. */
export function headingOf(line: Line, atEnd: boolean): number {
  const d = Math.min(6, line.len / 2);
  const a = pointOn(line, atEnd ? line.len - d : 0, 0);
  const b = pointOn(line, atEnd ? line.len : d, 0);
  return Math.atan2(b.e - a.e, b.n - a.n);
}

/** The heading a street leaves one of its nodes with. */
export function leaving(edge: StreetEdge, nodeId: number): number {
  return headingOf(lineOf(edge, edge.a === nodeId), false);
}

/** Where a lane change between s0 and s1 begins. */
export const changeAt = (s0: number, s1: number) => s0 + CHANGE_END * (s1 - s0);

/**
 * A lane along a line from distance s0 to s1, `off0` metres right of the centreline at s0 easing
 * to `off1` (a lane change early in it, at most 30 m long): flat e, n, z, mitred at the corners.
 */
export function lanePath(line: Line, s0: number, s1: number, off0: number, off1: number): number[] {
  const xs = [s0, s1];
  const corners = new Set<number>();
  for (let i = 1; i < line.c.length - 1; i++)
    if (line.c[i] > s0 + 0.05 && line.c[i] < s1 - 0.05) {
      xs.push(line.c[i]);
      corners.add(line.c[i]);
    }
  const w0 = changeAt(s0, s1);
  const w1 = Math.min(s1 - CHANGE_END * (s1 - s0), w0 + CHANGE_LENGTH);
  if (off0 !== off1) for (let x = w0; x <= w1; x += CHANGE_STEP) xs.push(x);
  xs.push(w1);
  xs.sort((a, b) => a - b);
  const offAt = (x: number) =>
    off0 + (off1 - off0) * smooth(w1 > w0 ? clamp((x - w0) / (w1 - w0), 0, 1) : 1);
  const out: number[] = [];
  let last = -Infinity;
  for (const x of xs) {
    if (x - last < 0.01) continue;
    last = x;
    const off = offAt(x);
    if (corners.has(x) && off !== 0) {
      const i = line.c.indexOf(x);
      const p = line.p;
      const normal = (j: number): [number, number] => {
        const de = p[j * 3 + 3] - p[j * 3];
        const dn = p[j * 3 + 4] - p[j * 3 + 1];
        const l = Math.hypot(de, dn) || 1;
        return [dn / l, -de / l];
      };
      const [ae, an] = normal(i - 1);
      const [be, bn] = normal(i);
      const l = Math.hypot(ae + be, an + bn) || 1;
      const me = (ae + be) / l;
      const mn = (an + bn) / l;
      const k = off / Math.max(0.5, me * be + mn * bn);
      out.push(p[i * 3] + me * k, p[i * 3 + 1] + mn * k, p[i * 3 + 2]);
    } else {
      const q = pointOn(line, x, off);
      out.push(q.e, q.n, q.z);
    }
  }
  return out;
}

// ---------- lanes ----------

/** Whether cars park along a street's kerbs. */
function parks(edge: StreetEdge): boolean {
  return !edge.elevated && !edge.link && edge.cls >= 2 && edge.width >= PARK_WIDTH;
}

/**
 * A street's lanes one way: max(1, floor(w / 3.3)) lanes in all over the width w left to traffic
 * (the street's width less its two parking strips where cars park), each at most 3.3 m wide; a
 * one-way street's centred, a two-way street's half each way (rounded up), right of the middle.
 * Offsets are metres right of the centreline in the direction of travel, left lane first; none
 * the wrong way down a one-way street.
 */
export function laneSet(edge: StreetEdge, forward: boolean): { offsets: number[]; width: number } {
  if ((forward && edge.ow === -1) || (!forward && edge.ow === 1)) return { offsets: [], width: 0 };
  const road = Math.max(0, edge.width - (parks(edge) ? 2 * PARK_STRIP : 0));
  const all = Math.max(1, Math.floor(road / LANE + 1e-9));
  if (edge.ow !== 0) {
    const w = Math.min(LANE, road / all);
    return { offsets: Array.from({ length: all }, (_, k) => (k - (all - 1) / 2) * w), width: w };
  }
  const each = Math.max(1, Math.round(all / 2));
  const w = Math.min(LANE, road / 2 / each);
  return { offsets: Array.from({ length: each }, (_, k) => (k + 0.5) * w), width: w };
}

/** Whether a kind of car fits a street's lanes one way. */
export function fits(kind: CarKind, edge: StreetEdge, forward: boolean): boolean {
  const { offsets, width } = laneSet(edge, forward);
  return offsets.length > 0 && CARS[kind].width + FIT <= width + 1e-9;
}

/**
 * How far from a node the street `edge` keeps clear for the others meeting there, so that all of
 * its width stands `extra` beyond each other street's side. One at θ ≤ 90° from it needs
 * (w_other/2 + extra + (w_mine/2)·cos θ) / sin θ: its half width and our near kerb's slant over
 * the sine, which grows as the angle narrows (two 20 m streets at 30° need 39 m for `extra` 1).
 * One beyond 90° lies behind our kerb: its half width and `extra` times sin θ, fading to nothing
 * for one that carries straight on.
 */
export function cornerReach(
  edge: StreetEdge,
  nodeId: number,
  others: Iterable<StreetEdge>,
  extra: number,
): number {
  const mine = leaving(edge, nodeId);
  let r = 0;
  for (const o of others) {
    if (o.key === edge.key) continue;
    const angle = Math.abs(wrap(leaving(o, nodeId) - mine));
    const side = o.width / 2 + extra;
    const reach =
      angle <= Math.PI / 2
        ? (side + (edge.width / 2) * Math.cos(angle)) / Math.max(Math.sin(angle), MIN_SINE)
        : side * Math.sin(angle);
    r = Math.max(r, reach);
  }
  return r;
}

// ---------- the network ----------

const BUCKET = 50;
const bucketOf = (e: number, n: number) => bucketKey(e, n, BUCKET);

/**
 * The streets of the squares that are in. A street is filed under every square it touches, so
 * each comes once however many squares hold it, and goes when the last of them does.
 */
export class RoadNet {
  private edges = new Map<string, { edge: StreetEdge; squares: Set<string>; buckets: number[] }>();
  private nodes = new Map<number, { node: RoadNode; squares: Set<string> }>();
  private touching = new Map<number, Set<string>>();
  private filed = new Map<string, { edges: string[]; nodes: number[] }>();
  private grid = new Map<number, Set<string>>();
  private portalIds = new Set<number>();

  add(cell: WalkCell): void {
    if (this.filed.has(cell.key)) this.remove(cell.key);
    const edges: string[] = [];
    const nodes: number[] = [];
    for (const node of cell.nodes) {
      let rec = this.nodes.get(node.id);
      if (!rec) {
        this.nodes.set(node.id, (rec = { node, squares: new Set() }));
        if (node.portal) this.portalIds.add(node.id);
      }
      rec.squares.add(cell.key);
      nodes.push(node.id);
    }
    for (const edge of cell.streets) {
      if (edge.a === edge.b) continue;
      let rec = this.edges.get(edge.key);
      if (!rec) {
        const buckets = this.bucketsOf(edge);
        this.edges.set(edge.key, (rec = { edge, squares: new Set(), buckets }));
        for (const b of buckets) {
          let set = this.grid.get(b);
          if (!set) this.grid.set(b, (set = new Set()));
          set.add(edge.key);
        }
        for (const id of [edge.a, edge.b]) {
          let set = this.touching.get(id);
          if (!set) this.touching.set(id, (set = new Set()));
          set.add(edge.key);
        }
      }
      rec.squares.add(cell.key);
      edges.push(edge.key);
    }
    this.filed.set(cell.key, { edges, nodes });
  }

  remove(key: string): void {
    const filed = this.filed.get(key);
    if (!filed) return;
    this.filed.delete(key);
    for (const k of filed.edges) {
      const rec = this.edges.get(k);
      if (!rec) continue;
      rec.squares.delete(key);
      if (rec.squares.size > 0) continue;
      this.edges.delete(k);
      for (const b of rec.buckets) {
        const set = this.grid.get(b);
        set?.delete(k);
        if (set?.size === 0) this.grid.delete(b);
      }
      for (const id of [rec.edge.a, rec.edge.b]) {
        const set = this.touching.get(id);
        set?.delete(k);
        if (set?.size === 0) this.touching.delete(id);
      }
    }
    for (const id of filed.nodes) {
      const rec = this.nodes.get(id);
      if (!rec) continue;
      rec.squares.delete(key);
      if (rec.squares.size > 0) continue;
      this.nodes.delete(id);
      this.portalIds.delete(id);
    }
  }

  edge(key: string): StreetEdge | undefined {
    return this.edges.get(key)?.edge;
  }

  node(id: number): RoadNode | undefined {
    return this.nodes.get(id)?.node;
  }

  /** The streets a car may leave a node by (one-way streets only their way), but `from`. */
  outOf(nodeId: number, from?: string): StreetEdge[] {
    const out: StreetEdge[] = [];
    for (const k of this.touching.get(nodeId) ?? []) {
      if (k === from) continue;
      const edge = this.edges.get(k)!.edge;
      if (edge.a === nodeId ? edge.ow !== -1 : edge.ow !== 1) out.push(edge);
    }
    return out;
  }

  /** Lateral offsets of a street's lanes one way, metres right of its centreline in the direction of travel, left lane first. */
  lanes(edge: StreetEdge, forward: boolean): number[] {
    return laneSet(edge, forward).offsets;
  }

  /** How far from a node a street's lanes stop and its turns begin, m (its stop line is `STOP_LINE` before that). */
  junction(nodeId: number, edge: StreetEdge): number {
    const others: StreetEdge[] = [];
    for (const k of this.touching.get(nodeId) ?? []) others.push(this.edges.get(k)!.edge);
    const r = cornerReach(edge, nodeId, others, JUNCTION);
    return Math.min(Math.max(r, JUNCTION_MIN), edge.length * JUNCTION_SHARE);
  }

  /** The streets that pass through the 50 m bucket a point is in. */
  near(e: number, n: number): StreetEdge[] {
    const out: StreetEdge[] = [];
    for (const k of this.grid.get(bucketOf(e, n)) ?? []) out.push(this.edges.get(k)!.edge);
    return out;
  }

  /** The tunnel portal node within 2 m of a point, if its square is in. */
  portalAt(e: number, n: number): RoadNode | undefined {
    for (const id of this.portalIds) {
      const node = this.nodes.get(id)!.node;
      if (Math.hypot(node.e - e, node.n - n) <= PORTAL_MATCH) return node;
    }
    return undefined;
  }

  private bucketsOf(edge: StreetEdge): number[] {
    const set = new Set<number>();
    const p = edge.pts;
    for (let q = 0; q < p.length; q += 3) {
      set.add(bucketOf(p[q], p[q + 1]));
      if (q === 0) continue;
      const len = Math.hypot(p[q] - p[q - 3], p[q + 1] - p[q - 2]);
      const steps = Math.ceil(len / (BUCKET / 4));
      for (let k = 1; k < steps; k++)
        set.add(
          bucketOf(
            p[q - 3] + ((p[q] - p[q - 3]) * k) / steps,
            p[q - 2] + ((p[q + 1] - p[q - 2]) * k) / steps,
          ),
        );
    }
    return [...set];
  }
}

// ---------- parked cars ----------

export interface ParkedCar {
  e: number;
  n: number;
  yaw: number;
  kind: CarKind;
  /** an index from 0 to PAINTS − 1, the renderer's to colour */
  color: number;
  /** the spot it stands in along its street (what `KerbSpot.spot` names) */
  spot: number;
}

/** A kerb spot: its street's key and its number along it. */
export interface KerbSpot {
  edge: string;
  spot: number;
}

interface Spot extends ParkedCar {
  filled: boolean;
  /** the kerb's point on the centreline, and the way out to the kerb (unit) */
  ce: number;
  cn: number;
  oe: number;
  on: number;
}

/** A kind that fits a kerb spot: no wider than the parking strip, no longer than the spot. */
const kerbable = (kind: CarKind) =>
  CARS[kind].width <= PARK_STRIP - KERB_GAP && CARS[kind].length <= SPOT - 0.5;

/** How far a kerb's spots are from its centreline for a kind of car. */
const kerbOffset = (edge: StreetEdge, kind: CarKind) =>
  edge.width / 2 - KERB_GAP - CARS[kind].width / 2;

/** A square by its key, from the world's squares. */
type CellAt = (key: string) => WalkCell | undefined;

function cellsOf(world: WalkWorld): CellAt {
  const map = new Map<string, WalkCell>();
  for (const c of world.cells()) map.set(c.key, c);
  return (key) => map.get(key);
}

/** How far the parking along an edge keeps from one of its ends: clear of the crossing, or of a dead end. */
function setback(edge: StreetEdge, nodeId: number, cellAt: CellAt): number {
  const atStart = nodeId === edge.a;
  const k = atStart ? 0 : edge.pts.length - 3;
  const cell = cellAt(`${Math.floor(edge.pts[k] / CELL)}_${Math.floor(edge.pts[k + 1] / CELL)}`);
  const others = new Map<string, StreetEdge>();
  for (const s of cell?.streets ?? [])
    if (s.key !== edge.key && s.a !== s.b && (s.a === nodeId || s.b === nodeId))
      others.set(s.key, s);
  if (others.size === 0) return PARK_END;
  return Math.max(cornerReach(edge, nodeId, others.values(), PARK_CORNER), 0.5);
}

/** Every kerb spot along an edge, filled or not, with the car the street's key gives it. */
function kerbSpots(edge: StreetEdge, cellAt: CellAt): Spot[] {
  if (!parks(edge)) return [];
  const rand = sequence(fnv1a(edge.key));
  const line = lineOf(edge, true);
  const s0 = setback(edge, edge.a, cellAt);
  const s1 = line.len - setback(edge, edge.b, cellAt);
  const count = Math.floor((s1 - s0) / SPOT);
  const out: Spot[] = [];
  for (let k = 0; k < count; k++) {
    const mid = pointOn(line, s0 + SPOT * (k + 0.5), 0);
    const heading = Math.atan2(mid.te, mid.tn);
    for (const side of [1, -1]) {
      let filled = rand() < FILLED;
      let kind = pickCar(rand());
      for (let tries = 0; tries < 3 && !kerbable(kind); tries++) kind = pickCar(rand());
      if (!kerbable(kind)) filled = false;
      const color = Math.min(PAINTS - 1, Math.floor(rand() * PAINTS));
      // the kerb to the right of a to b is side 1; traffic beside it goes a to b on a two-way street
      const oe = mid.tn * side;
      const on = -mid.te * side;
      const off = kerbOffset(edge, kind);
      const along = edge.ow === 0 ? side === 1 : edge.ow === 1;
      out.push({
        e: mid.e + oe * off,
        n: mid.n + on * off,
        yaw: wrap(along ? heading : heading + Math.PI),
        kind,
        color,
        spot: out.length,
        filled,
        ce: mid.e,
        cn: mid.n,
        oe,
        on,
      });
    }
  }
  return out;
}

/** Whether a car stands clear of walls and water: its middle and its four corners on land. */
function standsClear(world: WalkWorld, kind: CarKind, e: number, n: number, yaw: number): boolean {
  if (vehicleBlocked(kind, e, n, yaw, 0, world)) return false;
  const s = CARS[kind];
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  for (const [f, r] of [
    [0, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const fe = (f * s.length) / 2;
    const rw = (r * s.width) / 2;
    if (world.isWater(e + sy * fe + cy * rw, n + cy * fe - sy * rw)) return false;
  }
  return true;
}

/** Whether a square is in, or is one the data has no file for (nothing will ever come for it). */
function settled(world: WalkWorld, i: number, j: number): boolean {
  if (world.has(i, j)) return true;
  const ix = world.index;
  return typeof ix?.cells === "string" && !cellExists(ix, i, j);
}

/**
 * Whether where a street's cars park can be told yet: every square it touches is in, and so is
 * every square round those (the crossings at its ends, the walls and the water beside it are
 * there), or has no data. Until then its layout would come out differently.
 */
function parkingReady(edge: StreetEdge, world: WalkWorld): boolean {
  const squares = new Map<number, [number, number]>();
  const add = (e: number, n: number) => {
    const i = Math.floor(e / CELL);
    const j = Math.floor(n / CELL);
    squares.set(packKey(i, j), [i, j]);
  };
  const p = edge.pts;
  add(p[0], p[1]);
  for (let q = 3; q < p.length; q += 3) {
    // a square a segment only clips between two samples is a neighbour of theirs: checked below
    const steps = Math.max(1, Math.ceil(Math.hypot(p[q] - p[q - 3], p[q + 1] - p[q - 2]) / 50));
    for (let k = 1; k <= steps; k++)
      add(
        p[q - 3] + ((p[q] - p[q - 3]) * k) / steps,
        p[q - 2] + ((p[q + 1] - p[q - 2]) * k) / steps,
      );
  }
  for (const [i, j] of squares.values())
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) if (!settled(world, i + di, j + dj)) return false;
  return true;
}

/**
 * The cars parked along a street, the same every visit (from an FNV hash of its key): along both
 * kerbs where it is at least 9 m wide, on the ground and neither motorway, trunk nor link; a spot
 * every 6.5 m clear of the crossings, two in three filled, by `TRAFFIC_MIX` (of the kinds that fit
 * a spot), facing the traffic beside them. One that would stand in a wall or the water is left
 * out, and so is the spot `leave` names (the starter's: `parkedOn(edge, world, starter?.spot)`).
 * Null while the squares round the street are not all in: ask again when they are. A street where
 * nothing parks answers `[]` at once.
 */
export function parkedOn(
  edge: StreetEdge,
  world: WalkWorld,
  leave?: KerbSpot | null,
): ParkedCar[] | null {
  if (!parks(edge)) return [];
  if (!parkingReady(edge, world)) return null;
  const skip = leave && leave.edge === edge.key ? leave.spot : -1;
  const out: ParkedCar[] = [];
  for (const s of kerbSpots(edge, cellsOf(world)))
    if (s.filled && s.spot !== skip && standsClear(world, s.kind, s.e, s.n, s.yaw))
      out.push({ e: s.e, n: s.n, yaw: s.yaw, kind: s.kind, color: s.color, spot: s.spot });
  return out;
}

/**
 * The red supercar waiting where the walk opens, in the kerb spot nearest to `near` on the
 * streets whose parking can be told, and that spot (for `parkedOn` to leave out); null where
 * nothing parks.
 */
export function starterCar(
  world: WalkWorld,
  near: { e: number; n: number },
): { car: Vehicle; spot: KerbSpot } | null {
  const cellAt = cellsOf(world);
  const seen = new Set<string>();
  let best: { e: number; n: number; yaw: number; spot: KerbSpot } | null = null;
  let bestD = Infinity;
  for (const c of world.cells())
    for (const edge of c.streets) {
      if (seen.has(edge.key) || !parks(edge)) continue;
      seen.add(edge.key);
      if (!parkingReady(edge, world)) continue;
      for (const s of kerbSpots(edge, cellAt)) {
        const off = kerbOffset(edge, "supercar");
        const e = s.ce + s.oe * off;
        const n = s.cn + s.on * off;
        const d = Math.hypot(e - near.e, n - near.n);
        if (d >= bestD || !standsClear(world, "supercar", e, n, s.yaw)) continue;
        best = { e, n, yaw: s.yaw, spot: { edge: edge.key, spot: s.spot } };
        bestD = d;
      }
    }
  if (!best) return null;
  return {
    car: newVehicle(nextVehicleId(), "supercar", best.e, best.n, best.yaw, "parked", PAINT_RED),
    spot: best.spot,
  };
}
