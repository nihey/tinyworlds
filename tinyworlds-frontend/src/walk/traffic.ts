import { bodyOf, overlap } from "./collide";
import type { RoadNode, StreetEdge } from "./cell";
import type { CarKind } from "./kinds";
import { phaseOf, signal } from "./lights";
import {
  PAINTS,
  PORTAL_MATCH,
  RoadNet,
  STOP_LINE,
  bucketKey,
  changeAt,
  clamp,
  fits,
  headingOf,
  lanePath,
  laneSet,
  leaving,
  lineOf,
  packKey,
  pointOn,
  speedOf,
  wrap,
  type Line,
  type Point,
} from "./roads";
import { CARS, newVehicle, nextVehicleId, pickCar, type Vehicle } from "./vehicles";
import type { WalkIndex } from "./walk-index";
import type { WalkWorld } from "./world";

export {
  LANE,
  PAINT_RED,
  PAINTS,
  RoadNet,
  SPEEDS,
  STOP_LINE,
  parkedOn,
  speedOf,
  starterCar,
  type KerbSpot,
  type ParkedCar,
} from "./roads";

/**
 * Traffic on the real streets (`roads.ts`): the cars that drive them, following their lanes,
 * turning on curves between them, keeping their gaps, stopping at the lights, giving way at the
 * crossings and passing through tunnels. No three.js, no DOM. World metres east and north;
 * headings radians from north, clockwise.
 *
 * A traffic car is a `Vehicle` in state "traffic" that the traffic moves along its lane itself
 * (no physics: its place, heading and speed come from its route). Once the game changes its state
 * (you get in, a hard knock sends it loose, it is wrecked or sinks), it is the game's, and the
 * traffic lets go of it on its next step. Hits between traffic cars and anything else are the
 * game's to find; it tells the traffic with `hit`.
 */

// spawning
export const SPAWN_NEAR = 170;
export const SPAWN_FAR = 320;
export const DROP_FAR = 380;
const BUDGET = 70;
/** A walk's first traffic (`prime`) comes in as near as this, tried this many times a car. */
const PRIME_NEAR = 20;
const PRIME_TRIES = 20;
/** Places tried for a new car each step while there are too few. */
const SPAWN_TRIES = 3;
/** A new car keeps this far from traffic, and from anything else. */
const SPAWN_CLEAR_TRAFFIC = 12;
const SPAWN_CLEAR = 8;
/** An edge shorter than this, or a lane with less than this left before its end, gets no new car. */
const SPAWN_EDGE = 14;
const SPAWN_ROOM = 8;

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
/** In a tunnel a car is taken at no less than this speed. */
const TUNNEL_SPEED = 3;
const TURN_SPEED_MIN = 4.5;
const TURN_SPEED_ADD = 7;
const TURN_SPEED_ANGLE = (95 * Math.PI) / 180;
const TURN_SAME = (20 * Math.PI) / 180;

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
  private focus = { e: 0, n: 0 };

  constructor(
    private net: RoadNet,
    private world: WalkWorld,
    private tunnels: WalkIndex["tunnels"],
    private random: () => number,
  ) {}

  /** Advances the traffic by dt seconds (at most 0.1) at time t (the lights' clock). */
  step(dt: number, t: number, focus: { e: number; n: number }, others: Vehicle[]): void {
    const h = clamp(dt, 0, MAX_DT);
    this.focus = focus;
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
   * Fills the streets round `focus` up to the budget at once, anywhere from 20 to 320 m away, in
   * the camera's view or not: for when a walk opens, or you are moved (cars beyond 380 m of the
   * new place go first). Afterwards `step` brings cars in out of sight, as ever.
   */
  prime(focus: { e: number; n: number }, others: Vehicle[] = []): void {
    this.focus = focus;
    this.release();
    this.dropFar(focus);
    for (let k = 0; k < this.budget * PRIME_TRIES && this.count() < this.budget; k++)
      this.spawn(focus, others, PRIME_NEAR, true);
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

  /**
   * Tries one place for a new car between `near` and 320 m of the focus; `anywhere`: in the
   * camera's view too, spread evenly over the area (when priming), else out of view and evenly
   * over the distance.
   */
  private spawn(
    focus: { e: number; n: number },
    others: Vehicle[],
    near = SPAWN_NEAR,
    anywhere = false,
  ) {
    const angle = this.random() * 2 * Math.PI;
    const u = this.random();
    const r = anywhere
      ? Math.sqrt(near * near + u * (SPAWN_FAR * SPAWN_FAR - near * near))
      : near + u * (SPAWN_FAR - near);
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
    if (dist < near || dist > SPAWN_FAR) return;
    if (!this.world.inData(p.e, p.n) || (!anywhere && this.visible?.(p.e, p.n))) return;
    const close = (e: number, n: number, by: number) =>
      Math.abs(e - p.e) < by && Math.abs(n - p.n) < by;
    if (this.drivers.some((d) => close(d.car.e, d.car.n, SPAWN_CLEAR_TRAFFIC))) return;
    if (others.some((v) => close(v.e, v.n, SPAWN_CLEAR))) return;
    if (this.blockers.some((b) => close(b.e, b.n, SPAWN_CLEAR))) return;
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
    // a closed tunnel takes it away, and so does one that comes out too far from you
    if (!exit || Math.hypot(exit[0] - this.focus.e, exit[1] - this.focus.n) > DROP_FAR) return;
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
      let r = d.hl + lookAt(Math.max(0, d.car.v)) + d.hw + CLEAR + SAMPLE + REACH_MAX;
      // about to change lanes: it looks back along the lane it goes to as well
      const pending = this.changing(d);
      if (pending)
        r = Math.max(
          r,
          d.hl + MERGE_BACK + Math.abs(pending.change.off1) + pending.change.lw + REACH_MAX,
        );
      const x0 = Math.floor((d.car.e - r) / REACH_BUCKET);
      const x1 = Math.floor((d.car.e + r) / REACH_BUCKET);
      const y0 = Math.floor((d.car.n - r) / REACH_BUCKET);
      const y1 = Math.floor((d.car.n + r) / REACH_BUCKET);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) reached.add(packKey(x, y));
    }
    const isReached = (e: number, n: number) => reached.has(bucketKey(e, n, REACH_BUCKET));
    const file = (o: Obstacle) => {
      const x0 = Math.floor((o.e - o.r) / OBSTACLE_BUCKET);
      const x1 = Math.floor((o.e + o.r) / OBSTACLE_BUCKET);
      const y0 = Math.floor((o.n - o.r) / OBSTACLE_BUCKET);
      const y1 = Math.floor((o.n + o.r) / OBSTACLE_BUCKET);
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          const k = packKey(x, y);
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
        for (const o of grid.get(packKey(x, y)) ?? []) {
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
    const pending = this.changing(d);
    if (!pending) return;
    const { change: c, ws } = pending;
    const q = pointOn(c.line, c.at, 0);
    const heading = Math.atan2(q.te, q.tn);
    const v = Math.max(0, d.car.v);
    const me = -ws;
    // the buckets along the lane it goes to, from MERGE_BACK behind it to just ahead
    const keys = new Set<number>();
    const side = c.lw / 2 + REACH_MAX;
    for (let x = me - MERGE_BACK; x <= me + 2 * d.hl + GAP + REACH_MAX; x += OBSTACLE_BUCKET / 2) {
      const pe = q.e + q.te * x + q.tn * c.off1;
      const pn = q.n + q.tn * x - q.te * c.off1;
      for (const de of [-side, side])
        for (const dn of [-side, side]) keys.add(bucketKey(pe + de, pn + dn, OBSTACLE_BUCKET));
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
  }

  /** The lane change a car is about to begin (within 20 m of its front), and how far its middle is from where it begins. */
  private changing(d: Driver): { change: Change; ws: number } | null {
    let s = -d.d;
    for (const L of d.legs) {
      const start = s;
      s += L.len;
      if (s < 0 || !L.change) continue;
      const ws = start + L.change.from;
      return ws <= 0 || ws - d.hl > MERGE_LOOK ? null : { change: L.change, ws };
    }
    return null;
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
    const x = Math.floor(d.car.e / OBSTACLE_BUCKET);
    const y = Math.floor(d.car.n / OBSTACLE_BUCKET);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const o of grid.get(packKey(x + dx, y + dy)) ?? [])
          if (o.vehicle && o.vehicle !== d.car && overlap(mine, bodyOf(o.vehicle))) return true;
    return false;
  }
}
