import type { LifeFile } from "../map/life";
import { lonLatToEN, type WalkGeo } from "./geo";
import { newVehicle, nextVehicleId, stepBoat, type Vehicle } from "./vehicles";
import type { WalkWorld } from "./world";

/**
 * The ferries on the `life.json` routes, there and back with a wait at each end. A boat on its
 * route is moved by its route (state "traffic", like the traffic's cars on their lanes) and is
 * pushed by nothing; taken off it (got into, sinking), it is the game's, and the route gets
 * another boat later where nobody sees it come. No three.js.
 */

/** The ferries' routes, as `life.json` has them. */
export type LifeRoutes = LifeFile["ferries"];

const WATER_Z = -0.6;
const SPEED = 7;
const STATEN_SPEED = 8;
/** Seconds a ferry waits at each end. */
const PAUSE = 15;
/** Routes shorter than this, m, have no boat. */
const SHORTEST = 200;

/** Whether a vehicle is a ferry on its route (moved by it, pushed by nothing). */
export const onRoute = (v: Vehicle): boolean => v.boat && v.state === "traffic";

interface Route {
  name: string;
  /** e, n pairs, and the distance along at each */
  pts: number[];
  cum: number[];
  len: number;
  speed: number;
  phase: number;
  /** the Staten Island boat: the long orange one */
  staten: boolean;
  boat: Vehicle | null;
}

/** Where a ferry is on its route at time t: out, a wait at the far end, back, a wait at the start. */
function poseAt(r: Route, t: number) {
  const run = r.len / r.speed;
  const cycle = 2 * (run + PAUSE);
  const c = (((t + r.phase * cycle) % cycle) + cycle) % cycle;
  let d: number;
  let back: boolean;
  let speed = r.speed;
  if (c < run) {
    d = c * r.speed;
    back = false;
  } else if (c < run + PAUSE) {
    d = r.len;
    back = false;
    speed = 0;
  } else if (c < 2 * run + PAUSE) {
    d = r.len - (c - run - PAUSE) * r.speed;
    back = true;
  } else {
    d = 0;
    back = true;
    speed = 0;
  }
  let lo = 0;
  let hi = r.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = r.cum[hi] - r.cum[lo] || 1;
  const k = Math.max(0, Math.min(1, (d - r.cum[lo]) / seg));
  const de = r.pts[hi * 2] - r.pts[lo * 2];
  const dn = r.pts[hi * 2 + 1] - r.pts[lo * 2 + 1];
  const yaw = Math.atan2(de, dn) + (back ? Math.PI : 0);
  return { e: r.pts[lo * 2] + de * k, n: r.pts[lo * 2 + 1] + dn * k, yaw, speed };
}

const boatOf = (r: Route, pose: { e: number; n: number; yaw: number }) =>
  newVehicle(nextVehicleId(), "ferry", pose.e, pose.n, pose.yaw, "traffic", r.staten ? 1 : 0);

export class Ferries {
  private readonly routes: Route[] = [];

  constructor(life: LifeRoutes, geo: WalkGeo) {
    (life ?? []).forEach((route, i) => {
      const pts: number[] = [];
      const cum: number[] = [];
      for (let k = 0; k + 1 < route.path.length; k += 2) {
        const [e, n] = lonLatToEN(geo, route.path[k], route.path[k + 1]);
        if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
        const m = pts.length;
        cum.push(m ? cum[cum.length - 1] + Math.hypot(e - pts[m - 2], n - pts[m - 1]) : 0);
        pts.push(e, n);
      }
      const len = cum[cum.length - 1] ?? 0;
      if (!(len >= SHORTEST)) return;
      this.routes.push({
        name: route.name,
        pts,
        cum,
        len,
        speed: SPEED,
        phase: (i * 0.618034) % 1,
        staten: false,
        boat: null,
      });
    });
    // the Staten Island route's boat is the long orange one: by its name (St. George is its
    // terminal), else the longest route
    const staten =
      this.routes.find((r) => /staten island|st\.? george/i.test(r.name)) ??
      this.routes.reduce<Route | undefined>((a, b) => (!a || b.len > a.len ? b : a), undefined);
    if (staten) {
      staten.staten = true;
      staten.speed = STATEN_SPEED;
    }
    for (const r of this.routes) r.boat = boatOf(r, poseAt(r, 0));
  }

  /** The boats on their routes now. */
  boats(): Vehicle[] {
    const out: Vehicle[] = [];
    for (const r of this.routes) if (r.boat) out.push(r.boat);
    return out;
  }

  /** Takes a boat off its route (you took its wheel): the route gets another later. */
  release(v: Vehicle): void {
    for (const r of this.routes) if (r.boat === v) r.boat = null;
  }

  /**
   * Each route's boat to where it is at time t, riding the swell if `near` it (under reduced
   * motion, `calm`: none). A boat that left its route (taken, sinking) is answered, for the game
   * to keep; a route without a boat gets one where `hidden` says nobody sees it come.
   */
  step(
    t: number,
    h: number,
    world: WalkWorld,
    calm: boolean,
    near: (v: Vehicle) => boolean,
    hidden: (e: number, n: number) => boolean,
  ): Vehicle[] {
    const left: Vehicle[] = [];
    for (const r of this.routes) {
      const pose = poseAt(r, t);
      let b = r.boat;
      if (b && b.state !== "traffic") {
        left.push(b);
        b = r.boat = null;
      }
      if (!b) {
        if (!hidden(pose.e, pose.n)) continue;
        b = r.boat = boatOf(r, pose);
      }
      b.e = pose.e;
      b.n = pose.n;
      b.yaw = pose.yaw;
      b.z = WATER_Z;
      // standing still, a boat only rides the swell; its route moves it
      b.v = 0;
      b.vs = 0;
      b.w = 0;
      if (near(b)) stepBoat(b, null, world, h, t, { calm });
      b.v = pose.speed;
    }
    return left;
  }
}
