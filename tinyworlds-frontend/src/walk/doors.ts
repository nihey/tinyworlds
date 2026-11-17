import { fromBox, span } from "./crashes";
import { HEIGHT, RADIUS, STEP_UP, type Player } from "./player";
import { sizeFor, type Vehicle } from "./vehicles";
import { WATER_Z, type WalkWorld } from "./world";

/**
 * Getting in and out: which car or boat you can take from where you stand or swim, and where you
 * stand (or swim) when you leave one. No three.js.
 */

/** You take a car or boat within this of its side, m. */
const REACH = 2.4;
/** Faster than this, m/s, you cannot get out. */
export const EXIT_SPEED = 4;
/** Out by the front or the back only this slowly, m/s: anything quicker would run you over. */
const ENDS_SPEED = 1;
/** Out of a car this far beside it, or ahead of it or behind. */
const EXIT_SIDE = 0.6;
const EXIT_END = 0.7;
/** Off a boat onto land this near its side, m, else into the water this far out. */
const STEP_OFF = [0.5, 1, 1.5];
const SWIM_OFF = 0.8;
/** The order the ways out are tried in: the driver's side (the left), the other, the front, the back. */
const DOORS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, 1],
  [0, -1],
];

/** Where you stand (or swim) on leaving a vehicle. */
export interface Spot {
  e: number;
  n: number;
  z: number;
  swim: boolean;
}

/**
 * The car or boat nearest you within 2.4 m that you could take: parked, loose, in traffic, moored
 * or a ferry; from the street or a pier, or a boat from the water beside it. Not a wreck, not
 * what is sinking.
 */
export function toTake(p: Player, nearby: Vehicle[]): Vehicle | null {
  if (p.mode !== "foot" && p.mode !== "swim") return null;
  let best: Vehicle | null = null;
  let bestD = REACH;
  for (const v of nearby) {
    if (v.state === "wrecked" || v.state === "sinking" || v.state === "sunk") continue;
    if (p.mode === "swim" && !v.boat) continue;
    if (Math.abs(v.e - p.e) > 40 || Math.abs(v.n - p.n) > 40) continue;
    if (Math.abs(v.z - p.z) > 2.5) continue;
    const d = Math.max(0, fromBox(v, p.e, p.n).d);
    if (d <= bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

/** Whether another vehicle stands at a point (with room for you) at that height. */
function occupied(nearby: Vehicle[], e: number, n: number, z: number, except: Vehicle): boolean {
  for (const v of nearby) {
    if (v === except || v.state === "sunk") continue;
    if (Math.abs(v.e - e) > 20 || Math.abs(v.n - n) > 20) continue;
    const [lo, hi] = span(v);
    if (z >= hi || z + HEIGHT <= lo) continue;
    if (fromBox(v, e, n).d < RADIUS) return true;
  }
  return false;
}

/** The point `out` metres beyond a vehicle's side (`side` ±1) or end (`end` ±1). */
function beside(v: Vehicle, side: number, end: number, out: number): [number, number] {
  const s = sizeFor(v);
  const sy = Math.sin(v.yaw);
  const cy = Math.cos(v.yaw);
  const off = side * (s.width / 2 + out);
  const fwd = end * (s.length / 2 + out);
  return [v.e + cy * off + sy * fwd, v.n - sy * off + cy * fwd];
}

/**
 * Out of a car: the driver's side if there is room, else the other, the front, the back (`ends`:
 * only when it has all but stopped); the water only if nothing else.
 */
function carExit(v: Vehicle, world: WalkWorld, nearby: Vehicle[], ends: boolean): Spot | null {
  let water: Spot | null = null;
  for (const [side, end] of DOORS) {
    if (end && !ends) continue;
    const [e, n] = beside(v, side, end, side ? EXIT_SIDE : EXIT_END);
    if (!world.inData(e, n)) continue;
    const under = world.surfaceUnder(e, n, v.z, STEP_UP);
    // a drop (a deck's edge, a quay above deep water) is no way out
    if (under.z < v.z - 0.65) continue;
    const swim = under.kind === "water";
    const z = swim ? WATER_Z : under.z;
    if (world.blocked(e, n, RADIUS, z, HEIGHT) || occupied(nearby, e, n, z, v)) continue;
    if (!swim) return { e, n, z, swim };
    water ??= { e, n, z, swim };
  }
  return water;
}

/** Off a boat: onto a pier or the shore within 1.5 m (off the bow or stern only when `ends`), else into the water beside it. */
function boatExit(v: Vehicle, world: WalkWorld, nearby: Vehicle[], ends: boolean): Spot | null {
  for (const [side, end] of DOORS)
    for (const out of STEP_OFF) {
      if (end && !ends) continue;
      const [e, n] = beside(v, side, end, out);
      if (!world.inData(e, n) || world.isWater(e, n)) continue;
      const land = world.surfaceUnder(e, n, WATER_Z, 1.2);
      if (land.kind === "water") continue;
      if (world.blocked(e, n, RADIUS, land.z, HEIGHT) || occupied(nearby, e, n, land.z, v))
        continue;
      return { e, n, z: land.z, swim: false };
    }
  for (const [side, end] of DOORS) {
    if (end && !ends) continue;
    const [e, n] = beside(v, side, end, SWIM_OFF);
    if (!world.inData(e, n) || !world.isWater(e, n)) continue;
    if (world.blocked(e, n, RADIUS, WATER_Z, HEIGHT) || occupied(nearby, e, n, WATER_Z, v))
      continue;
    return { e, n, z: WATER_Z, swim: true };
  }
  return null;
}

/**
 * Where you stand (or swim) leaving a vehicle; "slower" when only its front or back is free and it
 * is still rolling; null when there is no room. `anyway`: every way out whatever its speed (you
 * going down in it).
 */
export function wayOut(
  v: Vehicle,
  world: WalkWorld,
  nearby: Vehicle[],
  anyway = false,
): Spot | "slower" | null {
  const ends = anyway || Math.hypot(v.v, v.vs) < ENDS_SPEED;
  const exit = v.boat ? boatExit : carExit;
  const spot = exit(v, world, nearby, ends);
  if (spot || ends) return spot;
  return exit(v, world, nearby, true) ? "slower" : null;
}

/** Out of what is going under: swimming beside it on the driver's side, else where it is. */
export function swimOut(v: Vehicle, world: WalkWorld): Spot {
  const [e, n] = beside(v, -1, 0, EXIT_SIDE);
  const ok = world.inData(e, n) && world.isWater(e, n);
  return { e: ok ? e : v.e, n: ok ? n : v.n, z: WATER_Z, swim: true };
}
