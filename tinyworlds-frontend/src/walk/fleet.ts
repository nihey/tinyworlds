import type { StreetEdge, WalkCell } from "./cell";
import { parkedOn, type KerbSpot } from "./traffic";
import { newVehicle, nextVehicleId, type Vehicle } from "./vehicles";
import type { WalkWorld } from "./world";

/**
 * The vehicles the game keeps itself: the cars parked along the streets round you (the same every
 * visit), the boats at their moorings, and the free ones (loose cars, wrecks, what sinks, what you
 * left, the starter). A parked car or a moored boat taken or hit leaves its spot empty for good.
 * No three.js.
 */

/** Streets this near you get their parked cars, m; beyond the second they are let go. */
const PARK_REACH = 500;
const PARK_DROP = 600;
/** Parked cars and moored boats this near are the ones gathered for the frame (what can be hit)... */
const KEPT = 300;
/** ...and out to this they are drawn, so they do not pop up where the fog is still thin. */
export const SHOWN = 480;

type Box = [number, number, number, number];

const boxes = new WeakMap<StreetEdge, Box>();
function streetBox(s: StreetEdge): Box {
  let b = boxes.get(s);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let q = 0; q < s.pts.length; q += 3) {
      b[0] = Math.min(b[0], s.pts[q]);
      b[1] = Math.min(b[1], s.pts[q + 1]);
      b[2] = Math.max(b[2], s.pts[q]);
      b[3] = Math.max(b[3], s.pts[q + 1]);
    }
    boxes.set(s, b);
  }
  return b;
}

const boxDistance = (b: Box, e: number, n: number) =>
  Math.hypot(Math.max(b[0] - e, 0, e - b[2]), Math.max(b[1] - n, 0, n - b[3]));

/** Whether a vehicle is within `r` of a point, east and north (a square, not a circle: cheap). */
export const within = (v: { e: number; n: number }, at: { e: number; n: number }, r: number) =>
  Math.abs(v.e - at.e) <= r && Math.abs(v.n - at.n) <= r;

export class Fleet {
  /** Loose cars, wrecks, what sinks, what you left, the starter. */
  free: Vehicle[] = [];
  /** The parked cars and moored boats within 300 m, as last gathered. */
  kept: Vehicle[] = [];
  /** Those beyond 300 m and within 480 m: only drawn. */
  far: Vehicle[] = [];
  private streets = new Map<string, { box: Box; cars: Vehicle[] }>();
  private moored = new Map<string, Vehicle[]>();
  /** where a parked car or a moored boat came from, and the spot it leaves empty when it goes */
  private home = new WeakMap<Vehicle, { list: Vehicle[]; tag: string }>();
  private vacated = new Set<string>();

  constructor(private readonly world: WalkWorld) {}

  /** A square came in: its moorings get their boats (but the spots left empty). */
  moor(c: WalkCell): void {
    const list: Vehicle[] = [];
    c.moorings.forEach((m, k) => {
      const tag = `m:${c.key}#${k}`;
      if (this.vacated.has(tag)) return;
      const paint = ((c.i * 73856093) ^ (c.j * 19349663) ^ (k * 83492791)) >>> 0;
      const v = newVehicle(nextVehicleId(), m.kind, m.e, m.n, m.heading, "parked", paint & 7);
      this.home.set(v, { list, tag });
      list.push(v);
    });
    this.moored.set(c.key, list);
  }

  /** A square went: its moored boats go with it. */
  unmoor(key: string): void {
    this.moored.delete(key);
  }

  /**
   * The streets near `me` get their parked cars, once each can tell where (`parkedOn` answers
   * null until the squares round a street are in: it is asked again next time), leaving out the
   * starter's spot; streets far away, or no longer in, are let go.
   */
  park(me: { e: number; n: number }, leave: KerbSpot | null): void {
    const seen = new Set<string>();
    for (const c of this.world.cells())
      for (const s of c.streets) {
        if (seen.has(s.key)) continue;
        seen.add(s.key);
        if (this.streets.has(s.key)) continue;
        const box = streetBox(s);
        if (boxDistance(box, me.e, me.n) > PARK_REACH) continue;
        const spots = parkedOn(s, this.world, leave);
        if (!spots) continue;
        const cars: Vehicle[] = [];
        for (const pc of spots) {
          const tag = `s:${s.key}#${pc.spot}`;
          if (this.vacated.has(tag)) continue;
          const v = newVehicle(nextVehicleId(), pc.kind, pc.e, pc.n, pc.yaw, "parked", pc.color);
          this.home.set(v, { list: cars, tag });
          cars.push(v);
        }
        this.streets.set(s.key, { box, cars });
      }
    for (const [key, st] of this.streets)
      if (!seen.has(key) || boxDistance(st.box, me.e, me.n) > PARK_DROP) this.streets.delete(key);
  }

  /** The parked cars and moored boats within 300 m, and those out to 480 m: a few times a second is often enough. */
  gather(me: { e: number; n: number }): void {
    const kept: Vehicle[] = [];
    const far: Vehicle[] = [];
    const sort = (v: Vehicle) => {
      if (within(v, me, KEPT)) kept.push(v);
      else if (within(v, me, SHOWN)) far.push(v);
    };
    for (const st of this.streets.values())
      if (boxDistance(st.box, me.e, me.n) <= SHOWN) for (const v of st.cars) sort(v);
    for (const list of this.moored.values()) for (const v of list) sort(v);
    this.kept = kept;
    this.far = far;
  }

  /** Keeps a vehicle among the free ones (once). */
  keep(v: Vehicle): void {
    if (!this.free.includes(v)) this.free.push(v);
  }

  /** Takes a vehicle off whatever list held it (its street, its mooring, the free ones). */
  detach(v: Vehicle): void {
    const home = this.home.get(v);
    if (home) {
      const i = home.list.indexOf(v);
      if (i >= 0) home.list.splice(i, 1);
      this.vacated.add(home.tag);
      this.home.delete(v);
    }
    const i = this.free.indexOf(v);
    if (i >= 0) this.free.splice(i, 1);
  }

  /** A parked car or a moored boat that was hit: loose now, and free. */
  loosen(v: Vehicle): void {
    this.detach(v);
    v.state = "loose";
    this.free.push(v);
  }

  /** Every parked car and moored boat held now. */
  *standing(): Iterable<Vehicle> {
    for (const st of this.streets.values()) yield* st.cars;
    for (const list of this.moored.values()) yield* list;
  }
}
