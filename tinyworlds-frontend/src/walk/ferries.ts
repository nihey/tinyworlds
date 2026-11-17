import type { LifeFile } from "../map/life";
import { lonLatToEN, type WalkGeo } from "./geo";
import { clamp, smooth } from "./math";
import { newVehicle, nextVehicleId, stepBoat, type Vehicle } from "./vehicles";
import { WATER_Z, type WalkWorld } from "./world";

/**
 * The ferries on the `life.json` routes, there and back with a wait at each end. A boat on its
 * route is moved by its route (state "traffic", like the traffic's cars on their lanes) and is
 * pushed by nothing; taken off it (got into, sinking), it is the game's, and the route gets
 * another boat later where nobody sees it come. No three.js.
 */

/** The ferries' routes, as `life.json` has them. */
export type LifeRoutes = LifeFile["ferries"];

const SPEED = 7;
const STATEN_SPEED = 8;
/** Whitehall Terminal, lower Manhattan: where the Staten Island Ferry docks (lon, lat). */
const WHITEHALL = [-74.013, 40.701] as const;
/** The Staten Island boat's own box, m: three times a ferry's length, twice its beam. */
const STATEN_SIZE = { length: 90, width: 20 };
/** Seconds a ferry waits at each end. */
const PAUSE = 15;
/** A ferry faces along its route from this far behind it to this far ahead, m. */
const LOOK = 15;
/** Seconds it takes to turn round at an end, in the middle of its wait there. */
const TURN = 10;
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

/** A point `d` metres along a route (clamped to it). */
function pointAt(r: Route, d: number): { e: number; n: number } {
  const x = clamp(d, 0, r.len);
  let lo = 0;
  let hi = r.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.cum[mid] <= x) lo = mid;
    else hi = mid;
  }
  const seg = r.cum[hi] - r.cum[lo] || 1;
  const k = clamp((x - r.cum[lo]) / seg, 0, 1);
  return {
    e: r.pts[lo * 2] + (r.pts[hi * 2] - r.pts[lo * 2]) * k,
    n: r.pts[lo * 2 + 1] + (r.pts[hi * 2 + 1] - r.pts[lo * 2 + 1]) * k,
  };
}

/** The way a ferry faces `d` metres along: from a little behind to a little ahead, so it turns a corner over a few seconds. */
function headingAt(r: Route, d: number, back: boolean): number {
  const a = pointAt(r, d - LOOK);
  const b = pointAt(r, d + LOOK);
  return Math.atan2(b.e - a.e, b.n - a.n) + (back ? Math.PI : 0);
}

/**
 * Where a ferry is on its route at time t: out, a wait at the far end (turning round in the
 * middle of it), back, a wait at the start (turning round again).
 */
function poseAt(r: Route, t: number) {
  const run = r.len / r.speed;
  const cycle = 2 * (run + PAUSE);
  const c = (((t + r.phase * cycle) % cycle) + cycle) % cycle;
  // how far through its turn round, during a wait that began at `from`
  const turned = (from: number) => smooth(clamp((c - from - (PAUSE - TURN) / 2) / TURN, 0, 1));
  if (c < run) {
    const d = c * r.speed;
    return { ...pointAt(r, d), yaw: headingAt(r, d, false), speed: r.speed };
  }
  if (c < run + PAUSE)
    return {
      ...pointAt(r, r.len),
      yaw: headingAt(r, r.len, false) + Math.PI * turned(run),
      speed: 0,
    };
  if (c < 2 * run + PAUSE) {
    const d = r.len - (c - run - PAUSE) * r.speed;
    return { ...pointAt(r, d), yaw: headingAt(r, d, true), speed: r.speed };
  }
  return {
    ...pointAt(r, 0),
    yaw: headingAt(r, 0, true) + Math.PI * turned(2 * run + PAUSE),
    speed: 0,
  };
}

function boatOf(r: Route, pose: { e: number; n: number; yaw: number }): Vehicle {
  const v = newVehicle(
    nextVehicleId(),
    "ferry",
    pose.e,
    pose.n,
    pose.yaw,
    "traffic",
    r.staten ? 1 : 0,
  );
  if (r.staten) v.size = STATEN_SIZE;
  return v;
}

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
    // the Staten Island route's boat is the long orange one: of the routes from St. George (its
    // terminal), the one whose other end is nearest Whitehall, where the real one docks in
    // Manhattan; with none, the longest route
    const [we, wn] = lonLatToEN(geo, WHITEHALL[0], WHITEHALL[1]);
    const toWhitehall = (r: Route) => {
      const last = r.pts.length - 2;
      return Math.min(
        Math.hypot(r.pts[0] - we, r.pts[1] - wn),
        Math.hypot(r.pts[last] - we, r.pts[last + 1] - wn),
      );
    };
    const fromStGeorge = this.routes.filter((r) => /staten island|st\.? george/i.test(r.name));
    const staten =
      fromStGeorge.reduce<Route | undefined>(
        (a, b) => (!a || toWhitehall(b) < toWhitehall(a) ? b : a),
        undefined,
      ) ??
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
