import type { ElevatedWay } from "./cell";
import type { BoatKind, CarKind } from "./kinds";
import { GRAVITY } from "./player";
import { clamp, smooth } from "./math";
import { PARAPET_HEIGHT, WATER_Z, type Going, type Parapet, type WalkWorld } from "./world";

/**
 * Cars and boats: their kinds, arcade handling, walls, falls, damage and sinking. No three.js, no
 * DOM. Positions are world metres (east, north), yaw radians from north clockwise, as for you.
 *
 * Who applies damage: `stepCar` and `stepBoat` apply the hits they find themselves (a wall, a
 * parapet, a quay, a landing) and report them in their events for the crunch, the sparks and the
 * shake; the game must not apply those again. A hit between two vehicles is the game's: it finds
 * it with `overlap`, answers it with `resolve` (collide.ts) and gives each its share with
 * `applyDamage(v, closing, otherMass)`.
 */

/** Top speed m/s, mass kg, acceleration from a standstill m/s², grip (how fast a slide dies, per
 * second), toughness (a hit's damage is divided by it), and the body's box in metres. */
export interface CarSpec {
  vmax: number;
  mass: number;
  accel: number;
  grip: number;
  tough: number;
  length: number;
  width: number;
  height: number;
}

/** Top speed m/s, mass kg, thrust from a standstill m/s², and the hull's box in metres (its
 * height is what stands above the water). */
export interface BoatSpec {
  vmax: number;
  mass: number;
  accel: number;
  length: number;
  width: number;
  height: number;
}

// prettier-ignore
export const CARS: Record<CarKind, CarSpec> = {
  hatchback: { vmax: 40, mass: 1100, accel: 7.5, grip: 11.5, tough: 1, length: 3.9, width: 1.75, height: 1.45 },
  sedan: { vmax: 42, mass: 1500, accel: 7, grip: 11, tough: 1, length: 4.7, width: 1.8, height: 1.45 },
  taxi: { vmax: 40, mass: 1600, accel: 7, grip: 11, tough: 1, length: 4.7, width: 1.8, height: 1.45 },
  suv: { vmax: 38, mass: 2100, accel: 6.2, grip: 10, tough: 1, length: 4.8, width: 1.95, height: 1.8 },
  pickup: { vmax: 40, mass: 2300, accel: 6.5, grip: 9.5, tough: 1, length: 5.4, width: 2, height: 1.85 },
  limousine: { vmax: 40, mass: 2600, accel: 5.5, grip: 9, tough: 1, length: 8.5, width: 2, height: 1.5 },
  police: { vmax: 52, mass: 1800, accel: 10, grip: 12, tough: 1, length: 4.9, width: 1.85, height: 1.5 },
  muscle: { vmax: 60, mass: 1650, accel: 12, grip: 7.5, tough: 1, length: 4.9, width: 1.9, height: 1.35 },
  sports: { vmax: 64, mass: 1350, accel: 13, grip: 13, tough: 1, length: 4.4, width: 1.9, height: 1.2 },
  supercar: { vmax: 82, mass: 1400, accel: 18, grip: 14.5, tough: 1, length: 4.5, width: 2, height: 1.1 },
  motorcycle: { vmax: 58, mass: 310, accel: 15, grip: 14, tough: 0.85, length: 2.2, width: 0.88, height: 1.15 },
  boxTruck: { vmax: 28, mass: 5500, accel: 3.6, grip: 9, tough: 2, length: 7.5, width: 2.5, height: 3.4 },
  bus: { vmax: 24, mass: 12000, accel: 2.4, grip: 9, tough: 3, length: 12, width: 2.55, height: 3.1 },
};

// prettier-ignore
export const BOATS: Record<BoatKind, BoatSpec> = {
  speedboat: { vmax: 28, mass: 1800, accel: 7, length: 6.5, width: 2.4, height: 1.4 },
  motorboat: { vmax: 14, mass: 6000, accel: 2.8, length: 10, width: 3.4, height: 2.6 },
  ferry: { vmax: 9, mass: 150000, accel: 0.8, length: 30, width: 9, height: 7 },
};

/** How often each kind is met in traffic and parked at the kerb (they add up to 100). */
export const TRAFFIC_MIX: Record<CarKind, number> = {
  sedan: 22,
  taxi: 20,
  suv: 13,
  hatchback: 10,
  pickup: 6,
  police: 6,
  boxTruck: 5,
  bus: 4,
  motorcycle: 6,
  muscle: 3.5,
  sports: 2.5,
  limousine: 1.5,
  supercar: 0.5,
};

const MIX_KINDS = Object.keys(TRAFFIC_MIX) as CarKind[];
const MIX_TOTAL = MIX_KINDS.reduce((s, k) => s + TRAFFIC_MIX[k], 0);

/** The kind of car a number from 0 to 1 stands for, by `TRAFFIC_MIX` (a random number, or a hash). */
export function pickCar(r: number): CarKind {
  const x = r * MIX_TOTAL;
  let acc = 0;
  for (const k of MIX_KINDS) {
    acc += TRAFFIC_MIX[k];
    if (x < acc) return k;
  }
  return MIX_KINDS[MIX_KINDS.length - 1];
}

export type VehicleState =
  "parked" | "traffic" | "loose" | "driven" | "wrecked" | "sinking" | "sunk";

export interface Vehicle {
  id: number;
  kind: CarKind | BoatKind;
  boat: boolean;
  /** metres east, north of the projection origin; z the bottom of the body above the land (a
   * boat's waterline, the water's surface while it floats) */
  e: number;
  n: number;
  z: number;
  /** metres per second, up */
  vz: number;
  /** radians from north, clockwise */
  yaw: number;
  /** speed along the heading, m/s, negative backing up */
  v: number;
  /** speed sideways, to the right of the heading, m/s: a slide */
  vs: number;
  /** turning, radians per second, clockwise */
  w: number;
  /** 0 to 1; at 1 a car is a wreck and a boat goes down */
  damage: number;
  state: VehicleState;
  /** Seconds until a critical wreck explodes, or null when there is no active fuse. */
  fuse: number | null;
  /** seconds of fire left after an explosion */
  fire: number;
  /** seconds since it went into the water: afloat for the first 1, going under over the next 4 */
  sink: number;
  /** seconds a traffic car stays stopped after a knock (the traffic counts it) */
  stopFor: number;
  /** its paint, a palette ramp, chosen by whoever puts it there */
  color: number;
  /** a boat on the swell: metres up, and radians of roll (to the right, down) */
  heave: number;
  roll: number;
  /** its own box, when it is not its kind's (the long Staten Island ferry) */
  size?: { length: number; width: number };
  /** the elevated way it stands on, kept so it follows its own where ways overlap */
  on?: ElevatedWay;
}

export interface DriveInput {
  /** 0 to 1 */
  throttle: number;
  /** 0 to 1: brakes, then backs up (a boat's reverse) */
  brake: number;
  /** -1 (left) to 1 (right) */
  steer: number;
  handbrake: boolean;
}

export interface VehicleEvents {
  /** the hardest hit against a wall, a parapet or a quay this step: the speed into it, m/s (already damage) */
  impact: number;
  /** the speed it landed at after a fall, m/s (already damage, as a hit at that speed) */
  fell: number;
  /** it went into the water this step (a splash; whoever is in it comes out swimming) */
  sank: boolean;
  /** it was wrecked this step (a car starts its fuse, a boat goes down) */
  wrecked: boolean;
}

/** What a vehicle asks of the world. */
export type VehicleWorld = Pick<
  WalkWorld,
  "surfaceUnder" | "blocked" | "wallNormal" | "parapets" | "isWater"
>;

export interface Size {
  length: number;
  width: number;
  height: number;
  mass: number;
  tough: number;
}

export function isBoatKind(kind: CarKind | BoatKind): kind is BoatKind {
  return kind in BOATS;
}

const SIZES = {} as Record<CarKind | BoatKind, Size>;
for (const [k, s] of Object.entries(CARS)) SIZES[k as CarKind] = s;
for (const [k, s] of Object.entries(BOATS)) SIZES[k as BoatKind] = { ...s, tough: 1 };

/** The box, weight and toughness of a kind of car or boat. */
export function sizeOf(kind: CarKind | BoatKind): Size {
  return SIZES[kind];
}

const own = new WeakMap<{ length: number; width: number }, Size>();
/**
 * A vehicle's box: its own when it has one (its height and its weight then go with its length:
 * the long ferry is as much taller and heavier), else its kind's.
 */
export function sizeFor(v: Vehicle): Size {
  if (!v.size) return SIZES[v.kind];
  let s = own.get(v.size);
  if (!s) {
    const kind = SIZES[v.kind];
    const longer = v.size.length / kind.length;
    s = {
      ...kind,
      length: v.size.length,
      width: v.size.width,
      height: kind.height * longer,
      mass: kind.mass * longer,
    };
    own.set(v.size, s);
  }
  return s;
}

/** The water's surface, metres below the land (as the world and the swimmer have it). */
const MAX_DT = 0.1;
const SUBSTEP = 0.02;
/** No step moves any part of a vehicle further than this, so nothing is passed through. */
const MAX_MOVE = 0.5;
const MAX_STEPS = 64;
/** How far up a car drives onto a surface without a ramp. */
export const STEP_UP = 0.5;
/** This little above the surface is still on it: a car follows a ramp down instead of falling. */
const SNAP = 0.25;
/** A falling car lands on what it crossed this step, never on a deck above it. */
const LAND_EPS = 0.02;
/** The radius of a car's middle, for what holds it up from below. */
const MIDDLE = 0.05;
/** Slower than this, m/s, a car held on a building's top is settling, not landing. */
const SETTLE = 1;
/** As the world's walls: a volume no higher than this above the floor is not in the way. */
const WALL_EPS = 0.05;
/** A vehicle found inside a wall is eased out of it this far a step. */
const PUSH_OUT = 0.1;
/** Halvings that find how far a blocked move gets: to a 128th of it, 4 mm at most. */
const BISECT = 7;

// driving, as the spike had it
const BRAKE = 11;
const REVERSE = 4.5;
const REVERSE_TOP = 9;
/** A rider can walk the motorcycle backwards, at walking speed. */
const MOTORCYCLE_REVERSE_TOP = 1.4;
const ROLLING = 0.7;
const AIR_DRAG = 0.008;
const HANDBRAKE = 5;
const HANDBRAKE_GRIP = 1.4;
const HANDBRAKE_TURN = 1.4;
/** the wheels' full lock at a standstill, radians; it halves by `STEER_FADE` m/s */
const STEER = 0.6;
const STEER_FADE = 15;
/** wheelbase, as a share of the length */
const WHEELBASE = 0.6;
/** how fast the turn follows the wheel, per second */
const HELM = 7;
const HELM_HANDBRAKE = 3;
/** Grip at which the tyres carry the whole speed round a turn; below it the back steps out. */
const GRIP_FULL = 12;
const HANDBRAKE_CARRY = 0.1;
// nobody at the wheel: m/s² rolling (a wreck's wheels hardly turn), m/s² scrubbing sideways, rad/s² spin
const LOOSE_ROLL = 1.4;
const WRECK_ROLL = 6;
const LOOSE_SCRUB = 9;
const LOOSE_SPIN = 2.5;

// damage
const HARMLESS = 3;
/** Damage a metre a second over `HARMLESS`, before the share and the toughness. Halved from the
 * spike's 0.022 when the owner asked to "increase the level of damage cars can sustain". */
export const DAMAGE_PER_MS = 0.011;
const DAMAGE_SLOWS = 0.45;
const EXPLOSION_DELAY = 8;
const FIRE = 9;

// sinking
const AFLOAT = 1;
const GOING_UNDER = 4;
const SUNK_Z = -3;
const WATER_DRAG = 1.5;
/** how deep a car settles while it floats, and a boat, as shares of their height */
const CAR_FLOAT = 0.5;
const BOAT_FLOAT = 0.15;

// boats
const BOAT_REVERSE = 0.5;
const BOAT_REVERSE_TOP = 0.3;
const BOAT_DRAG = 0.3;
const BOAT_DRAG_FLAT = 0.2;
/** how fast a boat's sideways slide dies, per second: the loose stern */
const STERN = 1.2;
/** the share of a turn the hull carries the speed round; the rest is the stern sliding out */
const BOAT_CARRY = 0.6;
/** the rudder bites fully from this speed, m/s, and not at all standing still */
const WAY = 5;
/** turning at full rudder and way on, radians per second times the hull's length */
const RUDDER = 7;
const BOAT_HELM = 1.5;
const PROBE_R = 0.3;
const PROBE_HEIGHT = 3;
const HEAVE = 0.12;
const ROLL = 0.06;

const toward0 = (x: number, by: number) => (x > 0 ? Math.max(0, x - by) : Math.min(0, x + by));
/** Read through a call: a step can sink what the type checker saw afloat. */
const isSunk = (v: Vehicle) => v.state === "sunk";

let lastId = 0;
/** A vehicle id never given before on this page: the traffic's cars take theirs here, and the game's do too. */
export function nextVehicleId(): number {
  return ++lastId;
}

export function newVehicle(
  id: number,
  kind: CarKind | BoatKind,
  e: number,
  n: number,
  yaw: number,
  state: VehicleState = "parked",
  color = 0,
): Vehicle {
  const boat = isBoatKind(kind);
  return {
    id,
    kind,
    boat,
    e,
    n,
    z: boat ? WATER_Z : 0,
    vz: 0,
    yaw,
    v: 0,
    vs: 0,
    w: 0,
    damage: 0,
    state,
    fuse: null,
    fire: 0,
    sink: 0,
    stopFor: 0,
    color,
    heave: 0,
    roll: 0,
  };
}

/** What is left of a car's acceleration: damage costs up to 45% of it, and a wreck has none. */
export function accelFactor(v: Vehicle): number {
  if (v.state === "wrecked" || v.damage >= 1) return 0;
  return 1 - DAMAGE_SLOWS * v.damage;
}

/**
 * Damage from a hit at `impact` m/s: (impact − 3) × 0.011 ÷ toughness, times the share the vehicle
 * takes of it; every hit and every fall, cars and boats alike, comes through here. Against another
 * of `otherMass` that share is 2·M / (m + M): once against its own weight, more against a heavier
 * one, less against a lighter one; against what does not give (a wall, the ground: no
 * `otherMass`) it is 2. So a hatchback hitting a wall at 30 m/s is left at about 60% (smoking) and
 * is wrecked from about 48 m/s, and a bus at 30 m/s takes a fifth. Answers whether this hit wrecked
 * it: a car starts its explosion countdown, a boat goes down.
 */
export function applyDamage(v: Vehicle, impact: number, otherMass?: number): boolean {
  const size = SIZES[v.kind];
  const share =
    otherMass === undefined || !Number.isFinite(otherMass)
      ? 2
      : (2 * otherMass) / (size.mass + otherMass);
  return addDamage(v, (Math.max(0, impact - HARMLESS) * DAMAGE_PER_MS * share) / size.tough);
}

/** Blast damage is a share of full damage, reduced by the hull's toughness. */
export function applyBlastDamage(v: Vehicle, strength: number): boolean {
  return addDamage(v, strength / SIZES[v.kind].tough);
}

function addDamage(v: Vehicle, amount: number): boolean {
  if (v.state === "wrecked" || v.state === "sinking" || v.state === "sunk") return false;
  if (!(amount > 0)) return false;
  v.damage = Math.min(1, v.damage + amount);
  if (v.damage < 1) return false;
  if (v.boat) {
    v.state = "sinking";
    v.sink = 0;
  } else {
    v.state = "wrecked";
    v.fuse = EXPLOSION_DELAY;
  }
  return true;
}

/** What a vehicle's body is, for the walls: whether a pose is free, and the way out when it is not. */
interface Shape {
  /** half its length: how far its ends swing when it turns */
  reach: number;
  blocked(e: number, n: number, yaw: number): boolean;
  normal(e: number, n: number, yaw: number): [number, number] | null;
}

/** Circles of the car's half width along its axis, a radius apart at most: its box, rounded at the corners. */
function axisOffsets(halfLength: number, r: number): number[] {
  const span = Math.max(0, halfLength - r);
  if (span === 0) return [0];
  const k = Math.ceil((2 * span) / r) + 1;
  return Array.from({ length: k }, (_, i) => -span + (2 * span * i) / (k - 1));
}

const CIRCLES = {} as Record<CarKind, number[]>;
for (const [k, s] of Object.entries(CARS))
  CIRCLES[k as CarKind] = axisOffsets(s.length / 2, s.width / 2);

/** Where a boat looks for land: its bow, its stern, and along both sides. */
function boatProbes(hl: number, hw: number): [number, number][] {
  const out: [number, number][] = [
    [hl, 0],
    [-hl, 0],
  ];
  const k = Math.max(2, Math.ceil((1.6 * hl) / 3) + 1);
  for (let i = 0; i < k; i++) {
    const f = -0.8 * hl + (1.6 * hl * i) / (k - 1);
    out.push([f, hw], [f, -hw]);
  }
  return out;
}

const PROBES = {} as Record<BoatKind, [number, number][]>;
for (const [k, s] of Object.entries(BOATS))
  PROBES[k as BoatKind] = boatProbes(s.length / 2, s.width / 2);

function nearestOn(p: Parapet, e: number, n: number): [number, number] {
  const de = p.e1 - p.e0;
  const dn = p.n1 - p.n0;
  const len2 = de * de + dn * dn;
  const t = len2 > 0 ? clamp(((e - p.e0) * de + (n - p.n0) * dn) / len2, 0, 1) : 0;
  return [p.e0 + de * t, p.n0 + dn * t];
}

/** A unit vector along a sum of them, or null when they cancel out (no way out can be told). */
function unit(se: number, sn: number): [number, number] | null {
  const len = Math.hypot(se, sn);
  return len >= 0.5 ? [se / len, sn / len] : null;
}

/** A car at height z near (e, n), on the way `on` (or last on it, in the air): buildings and the
 * parapets that stand for it (`WalkWorld.parapets`) of decks it is level with stop it. */
function carShape(
  world: VehicleWorld,
  kind: CarKind,
  z: number,
  e: number,
  n: number,
  on?: ElevatedWay,
): Shape {
  const s = CARS[kind];
  const r = s.width / 2;
  const offs = CIRCLES[kind];
  const rails = world
    .parapets(e, n, s.length / 2 + r + MAX_MOVE, on)
    .filter((p) => p.z < z + s.height && p.z + PARAPET_HEIGHT > z + WALL_EPS);
  return {
    reach: s.length / 2,
    blocked(e, n, yaw) {
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      for (const f of offs) {
        const ce = e + sy * f;
        const cn = n + cy * f;
        if (world.blocked(ce, cn, r, z, s.height)) return true;
        for (const p of rails) {
          const [qe, qn] = nearestOn(p, ce, cn);
          if (Math.hypot(ce - qe, cn - qn) < r) return true;
        }
      }
      return false;
    },
    normal(e, n, yaw) {
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      let se = 0;
      let sn = 0;
      for (const f of offs) {
        const ce = e + sy * f;
        const cn = n + cy * f;
        const wall = world.wallNormal(ce, cn, r, z, s.height);
        if (wall) {
          se += wall[0];
          sn += wall[1];
        }
        for (const p of rails) {
          const [qe, qn] = nearestOn(p, ce, cn);
          const d = Math.hypot(ce - qe, cn - qn);
          if (d < r && d > 1e-9) {
            se += (ce - qe) / d;
            sn += (cn - qn) / d;
          }
        }
      }
      return unit(se, sn);
    },
  };
}

const ownProbes = new WeakMap<{ length: number; width: number }, [number, number][]>();

/** A boat: anything that is not open water at its probes stops it (land, piers, a bridge's piers). */
function boatShape(world: VehicleWorld, v: Vehicle): Shape {
  const kind = v.kind as BoatKind;
  let probes = PROBES[kind];
  if (v.size) {
    probes = ownProbes.get(v.size) ?? boatProbes(v.size.length / 2, v.size.width / 2);
    ownProbes.set(v.size, probes);
  }
  const dry = (e: number, n: number) =>
    !world.isWater(e, n) || world.blocked(e, n, PROBE_R, WATER_Z, PROBE_HEIGHT);
  return {
    reach: sizeFor(v).length / 2,
    blocked(e, n, yaw) {
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      for (const [f, r] of probes) if (dry(e + sy * f + cy * r, n + cy * f - sy * r)) return true;
      return false;
    },
    normal(e, n, yaw) {
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      let se = 0;
      let sn = 0;
      for (const [f, r] of probes) {
        const oe = sy * f + cy * r;
        const on = cy * f - sy * r;
        if (!dry(e + oe, n + on)) continue;
        const d = Math.hypot(oe, on);
        se -= oe / d;
        sn -= on / d;
      }
      return unit(se, sn);
    },
  };
}

/** Whether a vehicle of this kind would stand in a wall (a car), on anything but water (a boat), or outside the data. */
export function vehicleBlocked(
  kind: CarKind | BoatKind,
  e: number,
  n: number,
  yaw: number,
  z: number,
  world: VehicleWorld,
): boolean {
  const shape = isBoatKind(kind)
    ? boatShape(world, newVehicle(0, kind, e, n, yaw))
    : carShape(world, kind, z, e, n);
  return shape.blocked(e, n, yaw);
}

interface Moved {
  ve: number;
  vn: number;
  impact: number;
}

/**
 * Moves a vehicle by (ve, vn) m/s and its turn for h seconds, as far as its shape lets it, then
 * slides the rest of the step along what stopped it (turning away from it if it is turning, else
 * not turning). The speed into what it hit is taken out of the velocity and answered as `impact`.
 */
function moveAndSlide(v: Vehicle, ve: number, vn: number, h: number, shape: Shape): Moved {
  const de = ve * h;
  const dn = vn * h;
  const dyaw = v.w * h;
  if (de === 0 && dn === 0 && dyaw === 0) return { ve, vn, impact: 0 };
  const e0 = v.e;
  const n0 = v.n;
  const y0 = v.yaw;
  if (!shape.blocked(e0 + de, n0 + dn, y0 + dyaw)) {
    v.e = e0 + de;
    v.n = n0 + dn;
    v.yaw = y0 + dyaw;
    return { ve, vn, impact: 0 };
  }
  v.w = 0;
  if (shape.blocked(e0, n0, y0)) {
    // already in something (pushed there, or a square came in around it): ease out instead of moving
    const out = shape.normal(e0, n0, y0);
    if (!out) return { ve: 0, vn: 0, impact: 0 };
    v.e += out[0] * PUSH_OUT;
    v.n += out[1] * PUSH_OUT;
    const into = ve * out[0] + vn * out[1];
    return into < 0
      ? { ve: ve - into * out[0], vn: vn - into * out[1], impact: 0 }
      : { ve, vn, impact: 0 };
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < BISECT; i++) {
    const mid = (lo + hi) / 2;
    if (shape.blocked(e0 + de * mid, n0 + dn * mid, y0 + dyaw * mid)) hi = mid;
    else lo = mid;
  }
  // the way out of what it ran into; when that cannot be told, straight back the way it came
  const step = Math.hypot(de, dn);
  const nrm: [number, number] | null =
    shape.normal(e0 + de * hi, n0 + dn * hi, y0 + dyaw * hi) ??
    (step > 1e-12 ? [-de / step, -dn / step] : null);
  v.e = e0 + de * lo;
  v.n = n0 + dn * lo;
  v.yaw = y0 + dyaw * lo;
  let impact = 0;
  if (nrm) {
    const into = ve * nrm[0] + vn * nrm[1];
    if (into < 0) {
      impact = -into;
      ve -= into * nrm[0];
      vn -= into * nrm[1];
    }
  }
  const rest = (1 - lo) * h;
  const turn = (1 - lo) * dyaw;
  const se = v.e + ve * rest;
  const sn = v.n + vn * rest;
  // turning away from a wall swings its other end into it: pivot clear by as much as an end swings
  const swing = Math.abs(turn) * shape.reach;
  const pe = nrm ? se + nrm[0] * swing : se;
  const pn = nrm ? sn + nrm[1] * swing : sn;
  if (turn !== 0 && !shape.blocked(se, sn, v.yaw + turn)) {
    v.e = se;
    v.n = sn;
    v.yaw += turn;
    v.w = dyaw / h;
  } else if (turn !== 0 && nrm && !shape.blocked(pe, pn, v.yaw + turn)) {
    v.e = pe;
    v.n = pn;
    v.yaw += turn;
    v.w = dyaw / h;
  } else if (!shape.blocked(se, sn, v.yaw)) {
    v.e = se;
    v.n = sn;
  }
  return { ve, vn, impact };
}

/** The velocity in the world's axes, put back along and across the vehicle's (new) heading. */
function setVelocity(v: Vehicle, ve: number, vn: number) {
  const sy = Math.sin(v.yaw);
  const cy = Math.cos(v.yaw);
  v.v = ve * sy + vn * cy;
  v.vs = ve * cy - vn * sy;
}

function noEvents(): VehicleEvents {
  return { impact: 0, fell: 0, sank: false, wrecked: false };
}

function substeps(v: Vehicle, total: number, reach: number): number {
  const move = (Math.hypot(v.v, v.vs) + Math.abs(v.w) * reach) * total;
  return Math.min(
    MAX_STEPS,
    Math.max(1, Math.ceil(total / SUBSTEP - 1e-9), Math.ceil(move / MAX_MOVE - 1e-9)),
  );
}

function hit(v: Vehicle, impact: number, out: VehicleEvents) {
  out.impact = Math.max(out.impact, impact);
  if (!applyDamage(v, impact)) return;
  out.wrecked = true;
  if (v.state === "sinking") out.sank = true;
}

function startSinking(v: Vehicle, out: VehicleEvents) {
  v.state = "sinking";
  v.sink = 0;
  v.z = WATER_Z;
  v.vz = 0;
  v.fuse = null;
  v.fire = 0;
  out.sank = true;
}

/** Where the bottom of a sinking body is, `s` seconds after it went in. */
function sinkDepth(s: number, height: number, floatShare: number): number {
  const afloat = WATER_Z - floatShare * height;
  if (s <= AFLOAT) return WATER_Z - floatShare * height * smooth(s / AFLOAT);
  // all the way under, a tall one too
  const bottom = Math.min(SUNK_Z, WATER_Z - height - 0.3);
  return afloat + (bottom - afloat) * smooth(Math.min(1, (s - AFLOAT) / GOING_UNDER));
}

function sinkStep(v: Vehicle, floatShare: number, h: number) {
  v.sink += h;
  const k = Math.exp(-WATER_DRAG * h);
  v.v *= k;
  v.vs *= k;
  v.w *= k;
  const sy = Math.sin(v.yaw);
  const cy = Math.cos(v.yaw);
  v.e += (v.v * sy + v.vs * cy) * h;
  v.n += (v.v * cy - v.vs * sy) * h;
  v.yaw += v.w * h;
  v.vz = 0;
  v.z = sinkDepth(v.sink, SIZES[v.kind].height, floatShare);
  if (v.sink >= AFLOAT + GOING_UNDER) {
    v.state = "sunk";
    v.v = 0;
    v.vs = 0;
    v.w = 0;
  }
}

/** The wheel, the pedals and the handbrake: the speeds along and across after `h` seconds, and the turn. */
function drive(
  v: Vehicle,
  s: CarSpec,
  input: DriveInput,
  skid: boolean,
  vf: number,
  vl: number,
  h: number,
) {
  const thr = clamp(input.throttle - input.brake, -1, 1);
  if (thr > 0.05) {
    if (vf < -0.5) vf = Math.min(0, vf + BRAKE * thr * h);
    else vf += s.accel * accelFactor(v) * thr * Math.max(0, 1 - vf / s.vmax) * h;
  } else if (thr < -0.05) {
    if (vf > 0.5) vf = Math.max(0, vf + BRAKE * thr * h);
    else {
      const top =
        v.kind === "motorcycle" ? MOTORCYCLE_REVERSE_TOP : Math.min(REVERSE_TOP, s.vmax / 4);
      vf = Math.max(-top, vf + REVERSE * thr * h);
    }
  } else vf = toward0(vf, (ROLLING + AIR_DRAG * vf * vf) * h);
  if (input.handbrake) vf = toward0(vf, HANDBRAKE * h);
  vl *= Math.exp(-(skid ? HANDBRAKE_GRIP : s.grip) * h);
  // the faster, the less lock: steering tightens at speed
  const lock = STEER / (1 + Math.abs(vf) / STEER_FADE);
  const turn =
    (vf / (s.length * WHEELBASE)) *
    Math.tan(clamp(input.steer, -1, 1) * lock) *
    (skid ? HANDBRAKE_TURN : 1);
  v.w += (turn - v.w) * Math.min(1, (skid ? HELM_HANDBRAKE : HELM) * h);
  return [vf, vl];
}

/** Nobody at the wheel (or a wreck): it rolls to a stop, scrubs off a slide and stops spinning. */
function coast(v: Vehicle, vf: number, vl: number, h: number) {
  vf = toward0(vf, (v.state === "wrecked" ? WRECK_ROLL : LOOSE_ROLL) * h);
  vl = toward0(vl, LOOSE_SCRUB * h);
  v.w = toward0(v.w, LOOSE_SPIN * h);
  if (Math.abs(vf) < 0.05 && Math.abs(vl) < 0.05 && Math.abs(v.w) < 0.03) {
    v.w = 0;
    return [0, 0];
  }
  return [vf, vl];
}

/** Seconds ahead a car's turn is followed to tell where it is headed. */
const HEADED = 0.5;

/** Where a car is headed, for which of overlapping ways it is on: where it will point in a moment,
 * as it turns (at a fork a driver is already turning onto the branch as the car crosses the node). */
function goingOf(v: Vehicle): Going {
  const yaw = v.yaw + v.w * HEADED;
  return { de: Math.sin(yaw), dn: Math.cos(yaw), car: true };
}

/** Gravity, stepping up onto surfaces, following ramps, landing, and going into the water. In the
 * air a car keeps the way it was last on (`on`), whose rails still stand for it, until it lands. */
function ground(v: Vehicle, world: VehicleWorld, h: number, out: VehicleEvents) {
  const going = goingOf(v);
  const surf = world.surfaceUnder(v.e, v.n, v.z, STEP_UP, v.on, going);
  // on its surface (a falling car is not, however near the ground: it lands)
  if (v.vz === 0 && v.z - surf.z <= SNAP) {
    if (surf.kind === "water") startSinking(v, out);
    else {
      v.z = surf.z;
      v.vz = 0;
      v.on = surf.way;
    }
    return;
  }
  const prevZ = v.z;
  v.vz -= GRAVITY * h;
  v.z += v.vz * h;
  const land = world.surfaceUnder(v.e, v.n, prevZ, LAND_EPS, v.on, going);
  let fell = 0;
  if (v.vz <= 0 && v.z <= land.z) {
    if (land.kind === "water") {
      startSinking(v, out);
      return;
    }
    fell = -v.vz;
    v.z = land.z;
    v.on = land.way;
  } else if (
    // coming down with its middle onto a building's top: the building holds it up (a deck's rail,
    // or a building it only overhangs, does not: it falls on past them)
    v.vz < 0 &&
    world.blocked(v.e, v.n, MIDDLE, v.z, SIZES[v.kind].height) &&
    !world.blocked(v.e, v.n, MIDDLE, prevZ, SIZES[v.kind].height)
  ) {
    // down to the top (as far as the walls let it, found as a blocked move is); held there it
    // settles a hair each step, and only the first touch is a landing
    let lo = v.z;
    let hi = prevZ;
    for (let i = 0; i < BISECT; i++) {
      const mid = (lo + hi) / 2;
      if (world.blocked(v.e, v.n, MIDDLE, mid, SIZES[v.kind].height)) lo = mid;
      else hi = mid;
    }
    fell = -v.vz > SETTLE ? -v.vz : 0;
    v.z = hi;
    v.on = undefined;
  } else return;
  v.vz = 0;
  out.fell = Math.max(out.fell, fell);
  if (applyDamage(v, fell)) out.wrecked = true;
}

function carStep(
  v: Vehicle,
  input: DriveInput | null,
  world: VehicleWorld,
  h: number,
  out: VehicleEvents,
) {
  const s = CARS[v.kind as CarKind];
  const driving = input !== null && v.state !== "wrecked";
  const skid = driving && input.handbrake && v.kind !== "motorcycle";
  const [vf, vl] = driving ? drive(v, s, input, skid, v.v, v.vs, h) : coast(v, v.v, v.vs, h);
  // the tyres carry the speed round the turn as far as they grip; the rest is the back stepping
  // out (all of it with nobody at the wheel: a spinning car slides on the way it was going)
  const carry = !driving ? 0 : skid ? HANDBRAKE_CARRY : Math.min(1, s.grip / GRIP_FULL);
  const frame = v.yaw + carry * v.w * h;
  const sy = Math.sin(frame);
  const cy = Math.cos(frame);
  const moved = moveAndSlide(
    v,
    vf * sy + vl * cy,
    vf * cy - vl * sy,
    h,
    carShape(world, v.kind as CarKind, v.z, v.e, v.n, v.on),
  );
  if (moved.impact > 0) hit(v, moved.impact, out);
  setVelocity(v, moved.ve, moved.vn);
  ground(v, world, h, out);
}

/**
 * Advances a car by `dt` (at most 0.1 s, in steps of at most 0.02 s and 0.5 m): driven by `input`,
 * or rolling with nobody at the wheel when it is null (parked, loose, a wreck). Buildings and the
 * parapets of the deck it is on stop it and it slides along them; it steps up 0.5 m onto surfaces,
 * falls off edges and, when its middle comes down on the water, sinks: afloat 1 s, under over 4 s,
 * then `sunk`. Traffic is the traffic's to move; this is for whatever is not on its rails.
 */
export function stepCar(
  v: Vehicle,
  input: DriveInput | null,
  world: VehicleWorld,
  dt: number,
): VehicleEvents {
  const out = noEvents();
  if (v.boat || v.state === "sunk") return out;
  const total = Math.min(Math.max(dt, 0), MAX_DT);
  if (total <= 0) return out;
  if (v.fuse !== null) {
    v.fuse -= total;
    if (v.fuse <= 1e-9) {
      v.fuse = null;
      v.fire = FIRE;
    }
  } else {
    v.fire = Math.max(0, v.fire - total);
  }
  const driver = v.state === "wrecked" || v.state === "sinking" ? null : input;
  if (!driver && v.state !== "sinking" && v.v === 0 && v.vs === 0 && v.w === 0 && v.vz === 0) {
    // at rest: nothing to do while the ground stays where it was
    const surf = world.surfaceUnder(v.e, v.n, v.z, STEP_UP, v.on, goingOf(v));
    if (surf.kind !== "water" && surf.z === v.z) return out;
  }
  const steps = substeps(v, total, CARS[v.kind as CarKind].length / 2);
  const h = total / steps;
  for (let i = 0; i < steps && !isSunk(v); i++) {
    if (v.state === "sinking") sinkStep(v, CAR_FLOAT, h);
    else carStep(v, v.state === "wrecked" ? null : driver, world, h, out);
  }
  return out;
}

/** The swell under a boat at time t: none under reduced motion, less for a bigger hull, none once it is going down. */
function swell(v: Vehicle, t: number, calm: boolean) {
  if (calm || v.state === "sunk") {
    v.heave = 0;
    v.roll = 0;
    return;
  }
  const size = sizeFor(v);
  const k = Math.min(1, 8 / size.length) * (v.state === "sinking" ? Math.max(0, 1 - v.sink) : 1);
  const ph = v.e * 0.13 + v.n * 0.07;
  v.heave = k * HEAVE * (Math.sin(t * 1.5 + ph) + 0.4 * Math.sin(t * 2.3 + ph * 1.7));
  v.roll = k * ROLL * Math.sin(t * 1.1 + ph * 0.6);
}

function boatStep(
  v: Vehicle,
  input: DriveInput | null,
  world: VehicleWorld,
  h: number,
  out: VehicleEvents,
) {
  const s = BOATS[v.kind as BoatKind];
  let vf = v.v;
  let vl = v.vs;
  const thr = input ? clamp(input.throttle - input.brake, -1, 1) : 0;
  if (thr > 0.05) vf += s.accel * thr * Math.max(0, 1 - vf / s.vmax) * h;
  else if (thr < -0.05)
    vf += s.accel * BOAT_REVERSE * thr * Math.max(0, 1 + vf / (s.vmax * BOAT_REVERSE_TOP)) * h;
  else vf = toward0(vf * Math.exp(-BOAT_DRAG * h), BOAT_DRAG_FLAT * h);
  vl *= Math.exp(-STERN * h);
  // a rudder needs way on: no speed, no turn
  const rudder = input ? clamp(input.steer, -1, 1) : 0;
  const turn = rudder * (RUDDER / sizeFor(v).length) * clamp(vf / WAY, -1, 1);
  v.w += (turn - v.w) * Math.min(1, BOAT_HELM * h);
  if (!input && Math.abs(vf) < 0.02 && Math.abs(vl) < 0.02 && Math.abs(v.w) < 0.005) {
    vf = 0;
    vl = 0;
    v.w = 0;
  }
  const frame = v.yaw + BOAT_CARRY * v.w * h;
  const sy = Math.sin(frame);
  const cy = Math.cos(frame);
  const moved = moveAndSlide(v, vf * sy + vl * cy, vf * cy - vl * sy, h, boatShape(world, v));
  if (moved.impact > 0) hit(v, moved.impact, out);
  setVelocity(v, moved.ve, moved.vn);
  if (v.state !== "sinking") v.z = WATER_Z;
  v.vz = 0;
}

/**
 * Advances a boat by `dt` (as `stepCar` does a car), `t` being the time in seconds for the swell
 * (`calm`: none, under reduced motion). Thrust and reverse, a rudder that needs way on, a loose
 * stern, drag; anything that is not open water stops it, and a wrecked boat sinks.
 */
export function stepBoat(
  v: Vehicle,
  input: DriveInput | null,
  world: VehicleWorld,
  dt: number,
  t: number,
  opts: { calm?: boolean } = {},
): VehicleEvents {
  const out = noEvents();
  if (!v.boat || v.state === "sunk") return out;
  const total = Math.min(Math.max(dt, 0), MAX_DT);
  if (total <= 0) return out;
  if (input || v.state === "sinking" || v.v !== 0 || v.vs !== 0 || v.w !== 0) {
    const steps = substeps(v, total, sizeFor(v).length / 2);
    const h = total / steps;
    for (let i = 0; i < steps && !isSunk(v); i++) {
      if (v.state === "sinking") sinkStep(v, BOAT_FLOAT, h);
      else boatStep(v, input, world, h, out);
    }
  }
  swell(v, t + total, opts.calm === true);
  return out;
}
