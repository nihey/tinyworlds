import type { RoadNode, StreetEdge, WalkCell } from "./cell";
import { bodyOf, overlap } from "./collide";
import { CELL } from "./geo";
import type { CarKind } from "./kinds";
import { phaseOf, signal } from "./lights";
import { CARS, newVehicle, pickCar, vehicleBlocked, type Vehicle } from "./vehicles";
import type { WalkIndex } from "./walk-index";
import type { WalkWorld } from "./world";

/**
 * Traffic on the real streets: the road network of the squares that are in, its lanes, the cars
 * that drive them (following their lanes, turning on curves between them, keeping their gaps,
 * stopping at the lights, passing through tunnels), and the cars parked along the kerbs. No
 * three.js, no DOM. World metres east and north; headings radians from north, clockwise.
 *
 * A traffic car is a `Vehicle` in state "traffic" that the traffic moves along its lane itself
 * (no physics: its place, heading and speed come from its route). Once the game changes its state
 * (you get in, a hard knock sends it loose, it is wrecked or sinks), it is the game's, and the
 * traffic lets go of it on its next step. Hits between traffic cars and anything else are the
 * game's to find; it tells the traffic with `hit`.
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

// spawning
export const SPAWN_NEAR = 170;
export const SPAWN_FAR = 320;
export const DROP_FAR = 380;
const BUDGET = 70;
/** Places tried for a new car each step while there are too few. */
const SPAWN_TRIES = 3;
/** A new car keeps this far from traffic, and from anything else. */
const SPAWN_CLEAR_TRAFFIC = 12;
const SPAWN_CLEAR = 8;
/** An edge shorter than this, or a lane with less than this left before its end, gets no new car. */
const SPAWN_EDGE = 14;
const SPAWN_ROOM = 8;

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
/** A car about to change lanes looks at the lane it goes to from this far before the change, m. */
const MERGE_LOOK = 20;
/** ...and wants room for this many seconds of a faster car closing on it there, looking back 60 m at most. */
const MERGE_TIME = 2;
const MERGE_BACK = 60;
/** Turns: under 30° is straight on, three times as likely as each turn; over 150° hardly ever. */
const STRAIGHT = Math.PI / 6;
const SHARP = (5 * Math.PI) / 6;
const W_STRAIGHT = 3;
const W_TURN = 1;
const W_SHARP = 0.05;
/** A lane fits a car this much narrower than it. */
const FIT = 0.3;

// driving
const MAX_DT = 0.1;
const ACCEL = 2.4;
const BRAKE = 8;
/** Comfortable decelerations: into a turn, to a stop line; on yellow, whether it can stop at all. */
const EASE_TURN = 2.6;
const EASE_STOP = 3;
const YELLOW_DECEL = 3.5;
/** How far ahead a light holds a car back (for the patience below). */
const HELD_REACH = 40;
/** The gap kept from what is ahead: 2 m plus 1.2 s of its own speed, and room to stop behind it. */
const GAP = 2;
const HEADWAY = 1.2;
const FOLLOW_DECEL = 3.5;
/** A car looks along a corridor of its half width and this, out to its stopping distance. */
const CLEAR = 0.15;
const SAMPLE = 1.5;
const LOOK_MIN = 8;
const LOOK_MAX = 90;
/** What is this much above or below a car's way is not on it (a deck, a street under it). */
const LEVEL = 2.5;
/** Metres of route each car knows ahead, and of the way behind it kept for its heading. */
const AHEAD = 60;
const KEEP = 3;
const MAX_APPEND = 12;
/** Patience: stuck this long behind something still, a car squeezes past for at least 4 s. */
const STILL = 0.2;
const STUCK = 10;
const SQUEEZE = 4;
const SQUEEZE_MORE = 0.25;
const SQUEEZE_MAX = 12;
/**
 * At a crossing a car gives way to one from another way in whose path its own turn runs (within
 * their half widths and this) and that is in the crossing already or gets there first; it looks
 * at those within 15 m or 3 s of it, waits 1 m short of the crossing, and, standing, wants 1.5 s
 * more than one already moving.
 */
const CROSS_CLEAR = 0.3;
const CROSS_LOOK = 15;
const CROSS_TIME = 3;
const CROSS_BACK = 1;
const CROSS_START = 1.5;
/** A knock stops a car this long; one that changes its speed by more sends it loose. */
const KNOCKED = 2.5;
const LOOSE_KNOCK = 2.2;
/** In a tunnel a car is taken at no less than this speed; portals match a tunnel's ends this near. */
const TUNNEL_SPEED = 3;
const PORTAL_MATCH = 2;
const TURN_SPEED_MIN = 4.5;
const TURN_SPEED_ADD = 7;
const TURN_SPEED_ANGLE = (95 * Math.PI) / 180;
const TURN_SAME = (20 * Math.PI) / 180;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const smooth = (t: number) => t * t * (3 - 2 * t);
/** An angle in (−π, π]. */
const wrap = (a: number) => {
  const x = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return x === 0 ? Math.PI : x - Math.PI;
};

let lastId = 0;
/** A vehicle id never given before on this page: the traffic's cars take theirs here, and the game may too. */
export function nextVehicleId(): number {
  return ++lastId;
}

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

/**
 * Which of the ways out of a crossing a car takes, by how far each turns from the way it came
 * (radians, right positive) and a number `r` from 0 to 1: straight on three times as likely as
 * each turn, nearly turning back hardly ever.
 */
export function pickWay(turns: number[], r: number): number {
  const weights = turns.map((t) => {
    const a = Math.abs(t);
    return a < STRAIGHT ? W_STRAIGHT : a < SHARP ? W_TURN : W_SHARP;
  });
  let x = r * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return turns.length - 1;
}

// ---------- polylines ----------

/** An edge's centreline in one direction of travel: e, n, z per point and the plan distance to each. */
interface Line {
  p: number[];
  c: number[];
  len: number;
}

interface Point {
  e: number;
  n: number;
  z: number;
  /** the unit tangent, east and north */
  te: number;
  tn: number;
}

const lines = new WeakMap<StreetEdge, [Line, Line]>();

function lineOf(edge: StreetEdge, forward: boolean): Line {
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
function pointOn(line: Line, s: number, off: number): Point {
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
function headingOf(line: Line, atEnd: boolean): number {
  const d = Math.min(6, line.len / 2);
  const a = pointOn(line, atEnd ? line.len - d : 0, 0);
  const b = pointOn(line, atEnd ? line.len : d, 0);
  return Math.atan2(b.e - a.e, b.n - a.n);
}

/** The heading a street leaves one of its nodes with. */
function leaving(edge: StreetEdge, nodeId: number): number {
  return headingOf(lineOf(edge, edge.a === nodeId), false);
}

/** Where a lane change between s0 and s1 begins. */
const changeAt = (s0: number, s1: number) => s0 + CHANGE_END * (s1 - s0);

/**
 * A lane along a line from distance s0 to s1, `off0` metres right of the centreline at s0 easing
 * to `off1` (a lane change early in it, at most 30 m long): flat e, n, z, mitred at the corners.
 */
function lanePath(line: Line, s0: number, s1: number, off0: number, off1: number): number[] {
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
function laneSet(edge: StreetEdge, forward: boolean): { offsets: number[]; width: number } {
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
function fits(kind: CarKind, edge: StreetEdge, forward: boolean): boolean {
  const { offsets, width } = laneSet(edge, forward);
  return offsets.length > 0 && CARS[kind].width + FIT <= width + 1e-9;
}

/**
 * How far from a node the street `edge` keeps clear for the others meeting there: each other
 * street's half width and `extra`, in full for one at a right angle or sharper, fading to nothing
 * for one that carries straight on.
 */
function cornerReach(
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
    const k = angle <= Math.PI / 2 ? 1 : Math.sin(angle);
    r = Math.max(r, (o.width / 2 + extra) * k);
  }
  return r;
}

// ---------- the network ----------

const BUCKET = 50;
const bucketOf = (e: number, n: number) =>
  (Math.floor(e / BUCKET) + 32768) * 65536 + (Math.floor(n / BUCKET) + 32768);

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

/**
 * The cars parked along a street, the same every visit (from an FNV hash of its key): along both
 * kerbs where it is at least 9 m wide, on the ground and neither motorway, trunk nor link; a spot
 * every 6.5 m clear of the crossings, two in three filled, by `TRAFFIC_MIX` (of the kinds that fit
 * a spot), facing the traffic beside them. One that would stand in a wall or the water is left
 * out, and so is one in a square that is not in: ask once the squares around the street are in.
 */
export function parkedOn(edge: StreetEdge, world: WalkWorld): ParkedCar[] {
  const out: ParkedCar[] = [];
  for (const s of kerbSpots(edge, cellsOf(world)))
    if (s.filled && standsClear(world, s.kind, s.e, s.n, s.yaw))
      out.push({ e: s.e, n: s.n, yaw: s.yaw, kind: s.kind, color: s.color });
  return out;
}

/**
 * The red supercar waiting where the walk opens: in the kerb spot nearest to `near` on the
 * streets that are in, or null where nothing parks. That spot's own parked car (`parkedOn` gives
 * one there two times in three) is the game's to leave out.
 */
export function starterCar(world: WalkWorld, near: { e: number; n: number }): Vehicle | null {
  const cellAt = cellsOf(world);
  const seen = new Set<string>();
  let best: { e: number; n: number; yaw: number } | null = null;
  let bestD = Infinity;
  for (const c of world.cells())
    for (const edge of c.streets) {
      if (seen.has(edge.key) || !parks(edge)) continue;
      seen.add(edge.key);
      for (const s of kerbSpots(edge, cellAt)) {
        const off = kerbOffset(edge, "supercar");
        const e = s.ce + s.oe * off;
        const n = s.cn + s.on * off;
        const d = Math.hypot(e - near.e, n - near.n);
        if (d >= bestD || !standsClear(world, "supercar", e, n, s.yaw)) continue;
        best = { e, n, yaw: s.yaw };
        bestD = d;
      }
    }
  return best
    ? newVehicle(nextVehicleId(), "supercar", best.e, best.n, best.yaw, "parked", PAINT_RED)
    : null;
}

// ---------- traffic ----------

type Tunnel = WalkIndex["tunnels"][number];

/** Something a car must not drive into: you on foot or someone in the street (`z`: their feet, if known). */
export interface Blocker {
  e: number;
  n: number;
  r: number;
  z?: number;
}

/** A piece of a car's route: a lane or a turn between lanes. */
interface Leg {
  p: number[];
  c: number[];
  len: number;
  /** m/s */
  speed: number;
  /** the lights phase at its end, when there are lights there */
  stop?: 0 | 1;
  /** the lane change along it, if it changes lanes */
  change?: Change;
  /** a turn: the node it crosses, and the way it comes from there */
  node?: number;
  approach?: string;
  /** a turn's plan box, and whether it meets other turns (asked again every frame while both are ahead) */
  box?: [number, number, number, number];
  meets?: WeakMap<Leg, boolean>;
}

/** A lane change along a lane leg: the street it is on, where the change begins, the lanes. */
interface Change {
  line: Line;
  /** where it begins: along the street's centreline, and along the leg */
  at: number;
  from: number;
  off0: number;
  off1: number;
  /** the lanes' width */
  lw: number;
}

function legOf(p: number[], speed: number, stop?: 0 | 1, change?: Change): Leg {
  const c = [0];
  for (let k = 3; k < p.length; k += 3)
    c.push(c[c.length - 1] + Math.hypot(p[k] - p[k - 3], p[k + 1] - p[k - 2]));
  return { p, c, len: c[c.length - 1], speed, stop, change };
}

/** The edge a car is about to drive (its lane leg not yet laid), from s0 to s1 along it in lane `lane`. */
interface Tail {
  edge: StreetEdge;
  forward: boolean;
  lane: number;
  s0: number;
  s1: number;
}

interface Driver {
  car: Vehicle;
  hl: number;
  hw: number;
  legs: Leg[];
  /** where the car's middle is along the legs, from the start of the first */
  d: number;
  tail: Tail | null;
  /** what happens at the end of the last leg: a tunnel, or the end of the road */
  end: { tunnel: Tunnel; from: "a" | "b" } | "gone" | null;
  /** its liking for speed: 0.82 to 1.1 of the street's */
  temper: number;
  gap: number;
  leadSpeed: number;
  blocker: Obstacle | null;
  /** held back by a light, or behind someone who is */
  held: boolean;
  wait: number;
  /** seconds of squeezing past still things left, and how long it has been at it */
  squeeze: number;
  squeezed: number;
  /** the one it goes before, two of them having waited on each other */
  ignore: Driver | null;
  sawIgnored: boolean;
  /** the light it chose to go through on yellow, and the one it is stopping for */
  through: Leg | null;
  stopping: Leg | null;
}

interface Obstacle {
  e: number;
  n: number;
  z: number | null;
  yaw: number;
  hl: number;
  hw: number;
  /** what it reaches from its middle */
  r: number;
  /** m/s along its heading */
  speed: number;
  still: boolean;
  round: boolean;
  driver: Driver | null;
  vehicle: Vehicle | null;
  mark: number;
}

interface Hidden {
  driver: Driver;
  left: number;
  exit: [number, number, number];
}

const OBSTACLE_BUCKET = 16;
/** Vehicles are only filed where some car could look this coarse grid's squares (m). */
const REACH_BUCKET = 64;
/** The most anything reaches from its middle (half a bus's diagonal), m. */
const REACH_MAX = 7;

/** How far ahead of its front a car looks at speed v: its stopping distance and its gap. */
const lookAt = (v: number) =>
  Math.min(LOOK_MAX, LOOK_MIN + HEADWAY * v + (v * v) / (2 * FOLLOW_DECEL));

/** The least distance between segments ab and cd, in plan. */
function segmentGap(
  ae: number,
  an: number,
  be: number,
  bn: number,
  ce: number,
  cn: number,
  de: number,
  dn: number,
): number {
  const ux = be - ae;
  const uy = bn - an;
  const vx = de - ce;
  const vy = dn - cn;
  const cross = ux * vy - uy * vx;
  if (Math.abs(cross) > 1e-12) {
    const t = ((ce - ae) * vy - (cn - an) * vx) / cross;
    const u = ((ce - ae) * uy - (cn - an) * ux) / cross;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  const toSeg = (pe: number, pn: number, qe: number, qn: number, re: number, rn: number) => {
    const sx = re - qe;
    const sy = rn - qn;
    const l2 = sx * sx + sy * sy;
    const k = l2 > 0 ? clamp(((pe - qe) * sx + (pn - qn) * sy) / l2, 0, 1) : 0;
    return Math.hypot(pe - qe - sx * k, pn - qn - sy * k);
  };
  return Math.min(
    toSeg(ae, an, ce, cn, de, dn),
    toSeg(be, bn, ce, cn, de, dn),
    toSeg(ce, cn, ae, an, be, bn),
    toSeg(de, dn, ae, an, be, bn),
  );
}

function boxOf(L: Leg): [number, number, number, number] {
  if (!L.box) {
    let e0 = Infinity;
    let n0 = Infinity;
    let e1 = -Infinity;
    let n1 = -Infinity;
    for (let k = 0; k < L.p.length; k += 3) {
      e0 = Math.min(e0, L.p[k]);
      e1 = Math.max(e1, L.p[k]);
      n0 = Math.min(n0, L.p[k + 1]);
      n1 = Math.max(n1, L.p[k + 1]);
    }
    L.box = [e0, n0, e1, n1];
  }
  return L.box;
}

/** Whether two legs pass within `limit` of each other anywhere (the answer kept for the pair). */
function pathsMeet(a: Leg, b: Leg, limit: number): boolean {
  const known = a.meets?.get(b);
  if (known !== undefined) return known;
  const meet = legsMeet(a, b, limit);
  (a.meets ??= new WeakMap()).set(b, meet);
  (b.meets ??= new WeakMap()).set(a, meet);
  return meet;
}

function legsMeet(a: Leg, b: Leg, limit: number): boolean {
  const [ae0, an0, ae1, an1] = boxOf(a);
  const [be0, bn0, be1, bn1] = boxOf(b);
  if (ae0 - limit > be1 || be0 - limit > ae1 || an0 - limit > bn1 || bn0 - limit > an1)
    return false;
  const p = a.p;
  const q = b.p;
  for (let i = 3; i < p.length; i += 3)
    for (let j = 3; j < q.length; j += 3)
      if (
        segmentGap(p[i - 3], p[i - 2], p[i], p[i + 1], q[j - 3], q[j - 2], q[j], q[j + 1]) < limit
      )
        return true;
  return false;
}

/** The part of an obstacle inside a car's corridor (half width `w` either side of p along t): how far along it begins, or null. */
function alongCorridor(o: Obstacle, p: Point, w: number): number | null {
  const ne = p.tn;
  const nn = -p.te;
  if (o.round) {
    const ca = (o.e - p.e) * p.te + (o.n - p.n) * p.tn;
    const cl = Math.abs((o.e - p.e) * ne + (o.n - p.n) * nn);
    if (cl >= w + o.r) return null;
    const dy = Math.max(0, cl - w);
    return ca - Math.sqrt(o.r * o.r - dy * dy);
  }
  const s = Math.sin(o.yaw);
  const c = Math.cos(o.yaw);
  let poly: [number, number][] = [];
  for (const [f, r] of [
    [o.hl, o.hw],
    [o.hl, -o.hw],
    [-o.hl, -o.hw],
    [-o.hl, o.hw],
  ]) {
    const de = o.e + s * f + c * r - p.e;
    const dn = o.n + c * f - s * r - p.n;
    poly.push([de * p.te + dn * p.tn, de * ne + dn * nn]);
  }
  // clip to |lateral| ≤ w
  for (const sign of [1, -1]) {
    const next: [number, number][] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ina = a[1] * sign <= w;
      const inb = b[1] * sign <= w;
      if (ina) next.push(a);
      if (ina !== inb) {
        const t = (w * sign - a[1]) / (b[1] - a[1]);
        next.push([a[0] + (b[0] - a[0]) * t, w * sign]);
      }
    }
    poly = next;
    if (poly.length === 0) return null;
  }
  let min = Infinity;
  for (const [x] of poly) min = Math.min(min, x);
  return min;
}

/**
 * The cars driving the streets around a point (the focus: you), about `budget` of them within
 * 320 m. Each step brings cars in out of sight between 170 and 320 m away (never where `visible`
 * says the camera looks), lets them go beyond 380 m, and drives the rest: along their lanes,
 * turning on curves between lanes (straight on three times as likely as each turn, the right
 * lane for a right turn), slowing for turns, stopping at red and at yellow unless too close to
 * stop, keeping 2 m and 1.2 s of their speed from whatever is ahead on their way (the traffic,
 * `others`: the vehicles not in traffic, and `blockers`: you on foot and the people). Of two
 * waiting on each other the older goes; one stuck 10 s behind something still squeezes past it
 * (`squeezing`: the game leaves it out of its collisions meanwhile). A car reaching a tunnel
 * portal is hidden for the tunnel's length at its speed and comes out of the other portal; a
 * closed tunnel takes it away.
 */
export class Traffic {
  budget = BUDGET;
  /** Set by the game each frame: what is not a vehicle that cars stop for (you on foot, the people). */
  blockers: Blocker[] = [];
  /** Set by the game: whether a point is in the camera's view; no car is brought in where it is. */
  visible: ((e: number, n: number) => boolean) | null = null;
  /** The cars in the streets now (not those in a tunnel). */
  readonly cars: Vehicle[] = [];

  private drivers: Driver[] = [];
  private byCar = new Map<Vehicle, Driver>();
  private hidden: Hidden[] = [];
  private portals = new Map<number, { tunnel: Tunnel; from: "a" | "b"; heading: number }[]>();
  private boxes = new WeakMap<Vehicle, Obstacle>();
  private mark = 0;

  constructor(
    private net: RoadNet,
    private world: WalkWorld,
    private tunnels: WalkIndex["tunnels"],
    private random: () => number,
  ) {}

  /** Advances the traffic by dt seconds (at most 0.1) at time t (the lights' clock). */
  step(dt: number, t: number, focus: { e: number; n: number }, others: Vehicle[]): void {
    const h = clamp(dt, 0, MAX_DT);
    this.release();
    if (h > 0) this.tunnelling(h, focus);
    this.dropFar(focus);
    this.trim(focus);
    for (let k = 0; k < SPAWN_TRIES && this.count() < this.budget; k++) this.spawn(focus, others);
    for (const d of this.drivers) this.extend(d);
    if (h > 0) {
      const grid = this.obstacles(others);
      for (const d of this.drivers) this.look(d, grid);
      this.giveWay(t);
      this.untangle(grid);
      for (const d of [...this.drivers]) this.drive(d, h, t, grid);
    }
    this.sync();
  }

  /**
   * Puts a traffic car on a street at `s` metres along it in its direction of travel (the lane
   * and kind chosen at random unless given), whatever is near: for the game's own placements and
   * for tests. Null the wrong way down a one-way street.
   */
  spawnAt(
    edge: StreetEdge,
    forward: boolean,
    s: number,
    opts: { kind?: CarKind; lane?: number } = {},
  ): Vehicle | null {
    const { offsets } = laneSet(edge, forward);
    if (offsets.length === 0) return null;
    const kind = opts.kind ?? pickCar(this.random());
    const lane = clamp(
      opts.lane ?? Math.floor(this.random() * offsets.length),
      0,
      offsets.length - 1,
    );
    const d = this.put(edge, forward, s, kind, lane);
    this.sync();
    return d.car;
  }

  /**
   * A traffic car was hit, its speed changed by `knock` m/s: it stops for 2.5 s, or, above
   * 2.2 m/s, goes loose (the game's from now on: answers true).
   */
  hit(car: Vehicle, knock: number): boolean {
    const d = this.byCar.get(car);
    if (!d) return false;
    if (knock > LOOSE_KNOCK) {
      car.state = "loose";
      car.vs = 0;
      this.forget(d);
      this.sync();
      return true;
    }
    car.stopFor = KNOCKED;
    car.v = 0;
    return false;
  }

  /** Whether a traffic car is squeezing past something now: no collisions for it until it is clear. */
  squeezing(car: Vehicle): boolean {
    const d = this.byCar.get(car);
    return d !== undefined && (d.squeeze > 0 || d.ignore !== null);
  }

  // ---------- coming and going ----------

  private count(): number {
    return this.drivers.length + this.hidden.length;
  }

  private sync() {
    this.cars.length = 0;
    for (const d of this.drivers) this.cars.push(d.car);
  }

  private forget(d: Driver) {
    const i = this.drivers.indexOf(d);
    if (i >= 0) this.drivers.splice(i, 1);
    this.byCar.delete(d.car);
    for (const o of this.drivers) if (o.ignore === d) o.ignore = null;
  }

  /** Cars the game has taken (driven, loose, wrecked, sinking) are its own now. */
  private release() {
    for (const d of [...this.drivers]) if (d.car.state !== "traffic") this.forget(d);
  }

  private dropFar(focus: { e: number; n: number }) {
    for (const d of [...this.drivers])
      if (Math.hypot(d.car.e - focus.e, d.car.n - focus.n) > DROP_FAR) this.forget(d);
  }

  /** Over the budget (the game lowered it): the farthest car out of sight beyond 170 m goes. */
  private trim(focus: { e: number; n: number }) {
    if (this.count() <= this.budget) return;
    let worst: Driver | null = null;
    let far = SPAWN_NEAR;
    for (const d of this.drivers) {
      const dist = Math.hypot(d.car.e - focus.e, d.car.n - focus.n);
      if (dist > far && !this.visible?.(d.car.e, d.car.n)) {
        far = dist;
        worst = d;
      }
    }
    if (worst) this.forget(worst);
  }

  private spawn(focus: { e: number; n: number }, others: Vehicle[]) {
    const angle = this.random() * 2 * Math.PI;
    const r = SPAWN_NEAR + this.random() * (SPAWN_FAR - SPAWN_NEAR);
    const list = this.net.near(focus.e + Math.sin(angle) * r, focus.n + Math.cos(angle) * r);
    if (list.length === 0) return;
    const edge = list[Math.min(list.length - 1, Math.floor(this.random() * list.length))];
    if (edge.length < SPAWN_EDGE) return;
    const forward = edge.ow !== 0 ? edge.ow === 1 : this.random() < 0.5;
    const { offsets } = laneSet(edge, forward);
    if (offsets.length === 0) return;
    const lane = Math.min(offsets.length - 1, Math.floor(this.random() * offsets.length));
    const line = lineOf(edge, forward);
    const r0 = this.net.junction(forward ? edge.a : edge.b, edge);
    const r1 = this.net.junction(forward ? edge.b : edge.a, edge);
    const room = line.len - r0 - r1;
    if (room < SPAWN_ROOM) return;
    const s = r0 + this.random() * (room - SPAWN_ROOM / 2);
    const p = pointOn(line, s, offsets[lane]);
    const dist = Math.hypot(p.e - focus.e, p.n - focus.n);
    if (dist < SPAWN_NEAR || dist > SPAWN_FAR) return;
    if (!this.world.inData(p.e, p.n) || this.visible?.(p.e, p.n)) return;
    const near = (e: number, n: number, by: number) =>
      Math.abs(e - p.e) < by && Math.abs(n - p.n) < by;
    if (this.drivers.some((d) => near(d.car.e, d.car.n, SPAWN_CLEAR_TRAFFIC))) return;
    if (others.some((v) => near(v.e, v.n, SPAWN_CLEAR))) return;
    if (this.blockers.some((b) => near(b.e, b.n, SPAWN_CLEAR))) return;
    const kind = pickCar(this.random());
    if (!fits(kind, edge, forward)) return;
    this.put(edge, forward, s, kind, lane);
  }

  private put(edge: StreetEdge, forward: boolean, s: number, kind: CarKind, lane: number): Driver {
    const line = lineOf(edge, forward);
    const far = forward ? edge.b : edge.a;
    const s0 = clamp(s, 0, Math.max(0, line.len - 0.3));
    const s1 = Math.min(line.len, Math.max(line.len - this.net.junction(far, edge), s0 + 0.3));
    const color = Math.min(PAINTS - 1, Math.floor(this.random() * PAINTS));
    const car = newVehicle(nextVehicleId(), kind, 0, 0, 0, "traffic", color);
    car.v = speedOf(edge) * 0.5;
    const d = this.driverOf(car, 0.82 + this.random() * 0.28);
    d.tail = { edge, forward, lane, s0, s1 };
    this.extend(d);
    this.place(d, 0);
    this.drivers.push(d);
    this.byCar.set(car, d);
    return d;
  }

  private driverOf(car: Vehicle, temper: number): Driver {
    const spec = CARS[car.kind as CarKind];
    return {
      car,
      hl: spec.length / 2,
      hw: spec.width / 2,
      legs: [],
      d: 0,
      tail: null,
      end: null,
      temper,
      gap: Infinity,
      leadSpeed: 0,
      blocker: null,
      held: false,
      wait: 0,
      squeeze: 0,
      squeezed: 0,
      ignore: null,
      sawIgnored: false,
      through: null,
      stopping: null,
    };
  }

  // ---------- tunnels ----------

  /** The tunnels a portal node leads into, each with the heading into it. */
  private tunnelsAt(node: RoadNode) {
    let list = this.portals.get(node.id);
    if (!list) {
      list = [];
      for (const tunnel of this.tunnels) {
        const ends: ["a" | "b", [number, number, number] | null][] = [
          ["a", tunnel.a],
          ["b", tunnel.b],
        ];
        for (const [from, end] of ends)
          if (end && Math.hypot(end[0] - node.e, end[1] - node.n) <= PORTAL_MATCH)
            list.push({ tunnel, from, heading: end[2] });
      }
      this.portals.set(node.id, list);
    }
    return list;
  }

  /** A car at the end of its route: into its tunnel (hidden), or away. */
  private finish(d: Driver) {
    const end = d.end;
    this.forget(d);
    if (end === null || end === "gone") return;
    const exit = end.from === "a" ? end.tunnel.b : end.tunnel.a;
    if (!exit) return;
    d.legs = [];
    d.end = null;
    d.tail = null;
    d.ignore = null;
    d.squeeze = 0;
    d.wait = 0;
    d.through = null;
    d.stopping = null;
    this.hidden.push({
      driver: d,
      left: end.tunnel.length / Math.max(TUNNEL_SPEED, d.car.v),
      exit: [exit[0], exit[1], exit[2] + Math.PI],
    });
  }

  /** Cars in tunnels count down, and come out of the other portal onto the street leaving it. */
  private tunnelling(h: number, focus: { e: number; n: number }) {
    for (const x of [...this.hidden]) {
      x.left -= h;
      if (x.left > 0) continue;
      const [e, n, heading] = x.exit;
      const drop = () => this.hidden.splice(this.hidden.indexOf(x), 1);
      const node = this.net.portalAt(e, n);
      if (
        !node ||
        x.driver.car.state !== "traffic" ||
        Math.hypot(e - focus.e, n - focus.n) > DROP_FAR
      ) {
        drop();
        continue;
      }
      let best: StreetEdge | null = null;
      let bestTurn = Math.PI / 2;
      for (const o of this.net.outOf(node.id)) {
        const turn = Math.abs(wrap(leaving(o, node.id) - heading));
        if (turn < bestTurn) {
          bestTurn = turn;
          best = o;
        }
      }
      if (!best) {
        drop();
        continue;
      }
      // wait in the tunnel while a car stands in the portal
      if (this.drivers.some((o) => Math.hypot(o.car.e - e, o.car.n - n) < SPAWN_CLEAR)) {
        x.left = SQUEEZE_MORE;
        continue;
      }
      drop();
      const d = x.driver;
      const forward = best.a === node.id;
      const { offsets } = laneSet(best, forward);
      const line = lineOf(best, forward);
      const s0 = this.net.junction(node.id, best);
      const s1 = Math.max(s0 + 0.3, line.len - this.net.junction(forward ? best.b : best.a, best));
      const lane = Math.min(offsets.length - 1, Math.floor(this.random() * offsets.length));
      d.tail = { edge: best, forward, lane, s0, s1: Math.min(line.len, s1) };
      d.d = 0;
      this.extend(d);
      this.place(d, 0);
      d.car.yaw = heading;
      this.drivers.push(d);
      this.byCar.set(d.car, d);
    }
  }

  // ---------- routes ----------

  private ahead(d: Driver): number {
    let s = -d.d;
    for (const L of d.legs) s += L.len;
    return s;
  }

  private extend(d: Driver) {
    for (let k = 0; k < MAX_APPEND && d.end === null && d.tail && this.ahead(d) < AHEAD; k++)
      this.append(d);
  }

  /** Lays the tail's lane and the turn onto the way chosen out of the node at its end. */
  private append(d: Driver) {
    const tail = d.tail!;
    const { edge, forward, s0, s1 } = tail;
    const nodeId = forward ? edge.b : edge.a;
    const node = this.net.node(nodeId);
    const line = lineOf(edge, forward);
    const arrive = headingOf(line, true);
    const kind = d.car.kind as CarKind;
    const lanes = laneSet(edge, forward).offsets;
    const lane = clamp(tail.lane, 0, lanes.length - 1);
    const speed = speedOf(edge);

    interface Way {
      turn: number;
      edge?: StreetEdge;
      forward?: boolean;
      tunnel?: { tunnel: Tunnel; from: "a" | "b" };
    }
    let ways: Way[] = this.net.outOf(nodeId, edge.key).map((o) => ({
      turn: wrap(leaving(o, nodeId) - arrive),
      edge: o,
      forward: o.a === nodeId,
    }));
    const fitting = ways.filter((w) => fits(kind, w.edge!, w.forward!));
    if (fitting.length > 0) ways = fitting;
    if (node?.portal)
      for (const x of this.tunnelsAt(node))
        ways.push({ turn: wrap(x.heading - arrive), tunnel: { tunnel: x.tunnel, from: x.from } });
    // a dead end turns back on a two-way street; a portal with no tunnel takes the car away
    if (ways.length === 0 && !node?.portal && edge.ow === 0)
      ways.push({ turn: Math.PI, edge, forward: !forward });

    if (ways.length === 0) {
      d.legs.push(legOf(lanePath(line, s0, line.len, lanes[lane], lanes[lane]), speed));
      d.end = "gone";
      d.tail = null;
      return;
    }
    const way =
      ways[
        pickWay(
          ways.map((w) => w.turn),
          this.random(),
        )
      ];
    if (way.tunnel) {
      d.legs.push(legOf(lanePath(line, s0, line.len, lanes[lane], lanes[lane]), speed));
      d.end = way.tunnel;
      d.tail = null;
      return;
    }

    const right = way.turn > STRAIGHT;
    const left = way.turn < -STRAIGHT;
    const endLane = right ? lanes.length - 1 : left ? 0 : lane;
    const stop = node?.lights ? phaseOf(node.bearing, arrive) : undefined;
    const change: Change | undefined =
      lanes[lane] === lanes[endLane]
        ? undefined
        : {
            line,
            at: changeAt(s0, s1),
            from: changeAt(s0, s1) - s0,
            off0: lanes[lane],
            off1: lanes[endLane],
            lw: laneSet(edge, forward).width,
          };
    d.legs.push(legOf(lanePath(line, s0, s1, lanes[lane], lanes[endLane]), speed, stop, change));

    const next = way.edge!;
    const f2 = way.forward!;
    const line2 = lineOf(next, f2);
    const lanes2 = laneSet(next, f2).offsets;
    let r0 = this.net.junction(nodeId, next);
    let r1 = line2.len - this.net.junction(f2 ? next.b : next.a, next);
    if (r1 - r0 < 0.6) {
      const m = (r0 + r1) / 2;
      r0 = Math.max(0, m - 0.3);
      r1 = Math.min(line2.len, m + 0.3);
    }
    // a right turn into the right lane, a left into the left, straight on as far from the right
    const lane2 = right
      ? lanes2.length - 1
      : left
        ? 0
        : clamp(lanes2.length - lanes.length + endLane, 0, lanes2.length - 1);

    const a = pointOn(line, s1, lanes[endLane]);
    const b = pointOn(line2, r0, lanes2[lane2]);
    const k = Math.max(0.42 * Math.hypot(b.e - a.e, b.n - a.n), 0.5);
    const c1e = a.e + a.te * k;
    const c1n = a.n + a.tn * k;
    const c2e = b.e - b.te * k;
    const c2n = b.n - b.tn * k;
    const curve: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const u = 1 - t;
      curve.push(
        u * u * u * a.e + 3 * u * u * t * c1e + 3 * u * t * t * c2e + t * t * t * b.e,
        u * u * u * a.n + 3 * u * u * t * c1n + 3 * u * t * t * c2n + t * t * t * b.n,
        a.z + (b.z - a.z) * t,
      );
    }
    const angle = Math.abs(way.turn);
    const turnSpeed =
      angle < TURN_SAME
        ? Math.min(speed, speedOf(next))
        : TURN_SPEED_MIN + TURN_SPEED_ADD * Math.max(0, 1 - angle / TURN_SPEED_ANGLE);
    const turnLeg = legOf(curve, turnSpeed);
    turnLeg.node = nodeId;
    turnLeg.approach = `${edge.key}:${forward}`;
    d.legs.push(turnLeg);
    d.tail = { edge: next, forward: f2, lane: lane2, s0: r0, s1: r1 };
  }

  /** The point x metres along a car's legs (clamped to them). */
  private routeAt(d: Driver, x: number): Point {
    let i = 0;
    while (i < d.legs.length - 1 && x > d.legs[i].len) {
      x -= d.legs[i].len;
      i++;
    }
    return pointOn(d.legs[i], x, 0);
  }

  /** Puts a car where its route says it is, facing along its way; `h` is the step, for its turning rate. */
  private place(d: Driver, h: number) {
    const car = d.car;
    const p = this.routeAt(d, d.d);
    const q0 = this.routeAt(d, Math.max(0, d.d - 1.2));
    const q1 = this.routeAt(d, d.d + 1.2);
    car.e = p.e;
    car.n = p.n;
    car.z = p.z;
    car.vz = 0;
    car.vs = 0;
    if (Math.hypot(q1.e - q0.e, q1.n - q0.n) > 0.05) {
      const yaw = Math.atan2(q1.e - q0.e, q1.n - q0.n);
      car.w = h > 0 ? wrap(yaw - car.yaw) / h : 0;
      car.yaw = yaw;
    } else car.w = 0;
  }

  // ---------- looking ahead ----------

  /** Everything cars may meet, filed in 16 m buckets: the traffic, the other vehicles near it, the blockers. */
  private obstacles(others: Vehicle[]) {
    const grid = new Map<number, Obstacle[]>();
    // the coarse squares some car could look into
    const reached = new Set<number>();
    for (const d of this.drivers) {
      const r = d.hl + lookAt(Math.max(0, d.car.v)) + d.hw + CLEAR + SAMPLE + REACH_MAX;
      const x0 = Math.floor((d.car.e - r) / REACH_BUCKET);
      const x1 = Math.floor((d.car.e + r) / REACH_BUCKET);
      const y0 = Math.floor((d.car.n - r) / REACH_BUCKET);
      const y1 = Math.floor((d.car.n + r) / REACH_BUCKET);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) reached.add((x + 32768) * 65536 + (y + 32768));
    }
    const isReached = (e: number, n: number) =>
      reached.has(
        (Math.floor(e / REACH_BUCKET) + 32768) * 65536 + (Math.floor(n / REACH_BUCKET) + 32768),
      );
    const file = (o: Obstacle) => {
      const x0 = Math.floor((o.e - o.r) / OBSTACLE_BUCKET);
      const x1 = Math.floor((o.e + o.r) / OBSTACLE_BUCKET);
      const y0 = Math.floor((o.n - o.r) / OBSTACLE_BUCKET);
      const y1 = Math.floor((o.n + o.r) / OBSTACLE_BUCKET);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const k = (x + 32768) * 65536 + (y + 32768);
          let list = grid.get(k);
          if (!list) grid.set(k, (list = []));
          list.push(o);
        }
    };
    const box = (v: Vehicle, driver: Driver | null): Obstacle => {
      let o = this.boxes.get(v);
      if (!o) {
        const spec = CARS[v.kind as CarKind];
        o = {
          e: 0,
          n: 0,
          z: 0,
          yaw: 0,
          hl: spec.length / 2,
          hw: spec.width / 2,
          r: Math.hypot(spec.length, spec.width) / 2,
          speed: 0,
          still: false,
          round: false,
          driver,
          vehicle: v,
          mark: 0,
        };
        this.boxes.set(v, o);
      }
      o.e = v.e;
      o.n = v.n;
      o.z = v.z;
      o.yaw = v.yaw;
      o.speed = v.v;
      o.still = Math.hypot(v.v, v.vs) < STILL;
      o.driver = driver;
      return o;
    };
    for (const d of this.drivers) file(box(d.car, d));
    for (const v of others)
      if (!v.boat && v.state !== "sunk" && !this.byCar.has(v) && isReached(v.e, v.n))
        file(box(v, null));
    for (const b of this.blockers)
      file({
        e: b.e,
        n: b.n,
        z: b.z ?? null,
        yaw: 0,
        hl: 0,
        hw: 0,
        r: b.r,
        speed: 0,
        still: false,
        round: true,
        driver: null,
        vehicle: null,
        mark: 0,
      });
    return { grid };
  }

  /** What is nearest ahead on a car's way: its gap from the car's front, its speed along the way. */
  private look(d: Driver, { grid }: { grid: Map<number, Obstacle[]> }) {
    d.gap = Infinity;
    d.blocker = null;
    d.leadSpeed = 0;
    d.sawIgnored = false;
    const look = lookAt(Math.max(0, d.car.v));
    const w = d.hw + CLEAR;
    const samples: { s: number; p: Point }[] = [];
    let e0 = Infinity;
    let n0 = Infinity;
    let e1 = -Infinity;
    let n1 = -Infinity;
    const end = this.ahead(d);
    for (let s = d.hl * 0.5; s <= d.hl + look && s <= end; s += SAMPLE) {
      const p = this.routeAt(d, d.d + s);
      samples.push({ s, p });
      e0 = Math.min(e0, p.e);
      e1 = Math.max(e1, p.e);
      n0 = Math.min(n0, p.n);
      n1 = Math.max(n1, p.n);
    }
    if (samples.length === 0) return;
    const reach = w + SAMPLE;
    const stamp = ++this.mark;
    const x0 = Math.floor((e0 - reach) / OBSTACLE_BUCKET);
    const x1 = Math.floor((e1 + reach) / OBSTACLE_BUCKET);
    const y0 = Math.floor((n0 - reach) / OBSTACLE_BUCKET);
    const y1 = Math.floor((n1 + reach) / OBSTACLE_BUCKET);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (const o of grid.get((x + 32768) * 65536 + (y + 32768)) ?? []) {
          if (o.mark === stamp || o.driver === d) continue;
          o.mark = stamp;
          if (o.e + o.r < e0 - reach || o.e - o.r > e1 + reach) continue;
          if (o.n + o.r < n0 - reach || o.n - o.r > n1 + reach) continue;
          const ignored = o.driver !== null && o.driver === d.ignore;
          // squeezing past: only people and you stop it
          if (!o.round && d.squeeze > 0) continue;
          for (const { s, p } of samples) {
            if (o.z !== null && Math.abs(o.z - p.z) > LEVEL) continue;
            if (Math.hypot(o.e - p.e, o.n - p.n) - o.r > reach) continue;
            const along = alongCorridor(o, p, w);
            if (along === null) continue;
            const gap = s + along - d.hl;
            if (ignored) {
              d.sawIgnored = true;
              break;
            }
            if (gap < d.gap) {
              d.gap = gap;
              d.blocker = o;
              const heading = Math.atan2(p.te, p.tn);
              d.leadSpeed = Math.max(0, o.speed * Math.cos(o.yaw - heading));
            }
            break;
          }
        }
    this.merging(d, grid);
  }

  /**
   * Before changing lanes a car looks beside and behind itself in the lane it goes to, and waits
   * where its change begins while something is there (or coming up faster); once under way, it is
   * for those behind to keep clear of it.
   */
  private merging(d: Driver, grid: Map<number, Obstacle[]>) {
    let s = -d.d;
    for (const L of d.legs) {
      const start = s;
      s += L.len;
      if (s < 0 || !L.change) continue;
      const c = L.change;
      const ws = start + c.from;
      if (ws <= 0 || ws - d.hl > MERGE_LOOK) return;
      const q = pointOn(c.line, c.at, 0);
      const heading = Math.atan2(q.te, q.tn);
      const v = Math.max(0, d.car.v);
      const me = -ws;
      // the buckets along the lane it goes to, from MERGE_BACK behind it to just ahead
      const keys = new Set<number>();
      const side = c.lw / 2 + REACH_MAX;
      for (
        let x = me - MERGE_BACK;
        x <= me + 2 * d.hl + GAP + REACH_MAX;
        x += OBSTACLE_BUCKET / 2
      ) {
        const pe = q.e + q.te * x + q.tn * c.off1;
        const pn = q.n + q.tn * x - q.te * c.off1;
        for (const de of [-side, side])
          for (const dn of [-side, side])
            keys.add(
              (Math.floor((pe + de) / OBSTACLE_BUCKET) + 32768) * 65536 +
                (Math.floor((pn + dn) / OBSTACLE_BUCKET) + 32768),
            );
      }
      const stamp = ++this.mark;
      for (const key of keys)
        for (const o of grid.get(key) ?? []) {
          if (o.mark === stamp || o.round || o.driver === d) continue;
          o.mark = stamp;
          if (d.squeeze > 0) continue;
          if (o.z !== null && Math.abs(o.z - q.z) > LEVEL) continue;
          const along = (o.e - q.e) * q.te + (o.n - q.n) * q.tn;
          const lat = (o.e - q.e) * q.tn - (o.n - q.n) * q.te;
          // in the lane it goes to, not the one it is in
          if (Math.abs(lat - c.off1) > c.lw / 2) continue;
          if (Math.abs(lat - c.off0) < Math.abs(lat - c.off1)) continue;
          const speed = Math.max(0, o.speed * Math.cos(o.yaw - heading));
          const behind = Math.min(
            MERGE_BACK,
            d.hl + o.hl + GAP + HEADWAY * speed + Math.max(0, speed - v) * MERGE_TIME,
          );
          if (along < me - behind || along > me + d.hl + o.hl + GAP) continue;
          if (o.driver !== null && o.driver === d.ignore) {
            d.sawIgnored = true;
            continue;
          }
          // its middle waits where the change begins
          const gap = ws + GAP;
          if (gap < d.gap) {
            d.gap = gap;
            d.blocker = o;
            d.leadSpeed = 0;
          }
        }
      return;
    }
  }

  /**
   * Who goes first at each crossing: of two cars whose turns run into each other's (from
   * different ways in), the one in the crossing already, else the one that gets there first (a
   * standing car counting 1.5 s later); the other waits short of it if it still can.
   */
  private giveWay(t: number) {
    interface Entry {
      d: Driver;
      leg: Leg;
      /** from its front to the crossing, m */
      dist: number;
      inside: boolean;
      score: number;
    }
    const at = new Map<number, Entry[]>();
    for (const d of this.drivers) {
      const v = Math.max(0, d.car.v);
      let s = -d.d;
      for (let i = 0; i < d.legs.length; i++) {
        const L = d.legs[i];
        const start = s;
        s += L.len;
        if (L.node === undefined || s + d.hl < 0) continue;
        const dist = start - d.hl;
        if (dist > CROSS_LOOK && dist > v * CROSS_TIME) break;
        // waiting at its light, it is not coming
        const before = d.legs[i - 1];
        if (
          before?.stop !== undefined &&
          signal(t, before.stop) !== "green" &&
          before !== d.through
        )
          break;
        const inside = dist <= 0;
        const eta = inside ? 0 : (2 * dist) / (v + Math.sqrt(v * v + 2 * ACCEL * dist));
        const entry = { d, leg: L, dist, inside, score: eta + (v < 1 ? CROSS_START : 0) };
        const list = at.get(L.node);
        if (list) list.push(entry);
        else at.set(L.node, [entry]);
        break;
      }
    }
    for (const list of at.values()) {
      if (list.length < 2) continue;
      for (const x of list) {
        if (x.inside) continue;
        const v = Math.max(0, x.d.car.v);
        // too near to stop: it goes, and the others see it come
        if (x.dist < (v * v) / (2 * BRAKE)) continue;
        for (const y of list) {
          if (y === x || y.leg.approach === x.leg.approach || y.d === x.d.ignore) continue;
          const first =
            y.inside || y.score < x.score || (y.score === x.score && y.d.car.id < x.d.car.id);
          if (!first || !pathsMeet(x.leg, y.leg, x.d.hw + y.d.hw + CROSS_CLEAR)) continue;
          const gap = x.dist - CROSS_BACK + GAP;
          if (gap < x.d.gap) {
            x.d.gap = gap;
            x.d.blocker = this.boxes.get(y.d.car) ?? null;
            x.d.leadSpeed = 0;
          }
          break;
        }
      }
    }
  }

  /** Two cars each waiting for the other: the older goes, driving past the other until clear. */
  private untangle(grid: { grid: Map<number, Obstacle[]> }) {
    for (const d of this.drivers) {
      const other = d.blocker?.driver;
      if (!other || other.blocker?.driver !== d || d.car.id > other.car.id) continue;
      d.ignore = other;
      this.look(d, grid);
    }
  }

  // ---------- driving ----------

  /** The speed a car wants now: its street's, slowing for turns ahead, the lights, what is ahead. */
  private wanted(d: Driver, t: number): number {
    const car = d.car;
    const v = Math.max(0, car.v);
    let want = CARS[car.kind as CarKind].vmax;
    let held = false;
    let s = -d.d;
    for (const L of d.legs) {
      if (s + L.len < 0) {
        s += L.len;
        continue;
      }
      if (s > LOOK_MAX + AHEAD) break;
      const limit = L.speed * d.temper;
      want = Math.min(want, s <= 0 ? limit : Math.sqrt(limit * limit + 2 * EASE_TURN * s));
      if (L.stop !== undefined && L !== d.through) {
        const toLine = s + L.len - STOP_LINE - d.hl;
        if (toLine > -0.5) {
          const light = signal(t, L.stop);
          // on yellow: stop if it can, and once stopping, keep stopping
          if (
            light === "red" ||
            (light === "yellow" && (d.stopping === L || toLine > (v * v) / (2 * YELLOW_DECEL) + 1))
          ) {
            d.stopping = L;
            want = Math.min(want, toLine < 0.3 ? 0 : Math.sqrt(2 * EASE_STOP * toLine));
            held = toLine < HELD_REACH;
            break;
          }
          if (light === "yellow") d.through = L;
          if (d.stopping === L) d.stopping = null;
        }
      }
      s += L.len;
    }
    if (d.gap < Infinity) {
      const g = d.gap - GAP;
      want = Math.min(
        want,
        g <= 0
          ? 0
          : Math.min(g / HEADWAY, Math.sqrt(d.leadSpeed * d.leadSpeed + 2 * FOLLOW_DECEL * g)),
      );
      if (d.blocker?.driver?.held) held = true;
    }
    d.held = held;
    return want;
  }

  private drive(d: Driver, h: number, t: number, grid: { grid: Map<number, Obstacle[]> }) {
    const car = d.car;
    let want = this.wanted(d, t);
    if (car.stopFor > 0) {
      car.stopFor = Math.max(0, car.stopFor - h);
      want = 0;
    }
    const v = Math.max(0, car.v);
    car.v = want > v ? Math.min(want, v + ACCEL * h) : Math.max(want, v - BRAKE * h);

    // patience
    const b = d.blocker;
    const stuck = b !== null && !b.round && b.still && !(b.driver?.held ?? false);
    d.wait = car.v < STILL && !d.held && stuck && car.stopFor <= 0 ? d.wait + h : 0;
    if (d.wait >= STUCK) {
      d.wait = 0;
      d.squeeze = SQUEEZE;
      d.squeezed = 0;
    }

    d.d += car.v * h;
    while (d.legs.length > 1 && d.d > d.legs[0].len + KEEP) {
      if (d.legs[0] === d.through) d.through = null;
      if (d.legs[0] === d.stopping) d.stopping = null;
      d.d -= d.legs[0].len;
      d.legs.shift();
    }
    const left = this.ahead(d);
    if (d.end !== null && left <= 0.05) {
      d.d += Math.min(0, left);
      this.place(d, h);
      this.finish(d);
      return;
    }
    this.place(d, h);

    if (d.squeeze > 0) {
      d.squeeze -= h;
      d.squeezed += h;
      if (d.squeeze <= 0 && d.squeezed < SQUEEZE_MAX && this.touches(d, grid))
        d.squeeze = SQUEEZE_MORE;
      if (d.squeeze < 0) d.squeeze = 0;
    }
    if (d.ignore) {
      const other = d.ignore;
      if (!this.byCar.has(other.car)) d.ignore = null;
      else if (!d.sawIgnored && !overlap(bodyOf(car), bodyOf(other.car))) d.ignore = null;
    }
  }

  /** Whether a car's box overlaps any vehicle's near it. */
  private touches(d: Driver, { grid }: { grid: Map<number, Obstacle[]> }): boolean {
    const mine = bodyOf(d.car);
    const k = (Math.floor(d.car.e / OBSTACLE_BUCKET) + 32768) * 65536;
    const y = Math.floor(d.car.n / OBSTACLE_BUCKET) + 32768;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const o of grid.get(k + dx * 65536 + y + dy) ?? [])
          if (o.vehicle && o.vehicle !== d.car && overlap(mine, bodyOf(o.vehicle))) return true;
    return false;
  }
}
