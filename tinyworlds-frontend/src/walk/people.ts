import type { WalkEdge } from "./cell";
import { greenLeft, signal } from "./lights";
import { sizeOf, type Vehicle } from "./vehicles";
import type { WalkWorld } from "./world";

/**
 * The people of the city: pedestrians on the walking edges (sidewalks, crosswalks, elevated
 * walkways). Pure simulation, no three.js and no DOM. Positions are world metres (east, north),
 * yaw radians from north clockwise, as everywhere in the walk. Nobody dies: a hit is a fall, the
 * water is a swim back to shore.
 */

export type PersonState = "walking" | "waiting" | "dodging" | "down" | "running" | "swimming";

export interface Person {
  e: number;
  n: number;
  /** feet, metres above the land (the water's surface, -0.6, while swimming) */
  z: number;
  yaw: number;
  state: PersonState;
  /** seconds left lying down after a knock; 0 otherwise */
  downFor: number;
  /** seconds left running scared; 0 otherwise */
  runFor: number;
  /**
   * Skin, hair, top and bottom: small integers 0 to 7 drawn from `random`. The renderer maps each
   * to one of its palette ramps (its own table per part), so the crowd needs no palette.
   */
  look: { skin: number; hair: number; top: number; bottom: number };
  /** the walk cycle, radians: the renderer's swing of arms and legs */
  phase: number;
}

export interface CrowdEvents {
  /** each person a vehicle knocked down this step: where, and how fast the vehicle was going */
  knocks: { e: number; n: number; speed: number }[];
}

/** Metres from the focus: people are spawned between SPAWN_MIN and SPAWN_MAX, dropped beyond DROP. */
const SPAWN_MIN = 60;
const SPAWN_MAX = 170;
const DROP = 200;
/** `prime` leaves this much clear round the focus. */
const PRIME_CLEAR = 15;
/** People per step at most (the crowd fills in over a few frames, not one). */
const SPAWNS_PER_STEP = 4;
const WALK_MIN = 1.3;
const WALK_SPREAD = 0.3;
const RUN = 4.3;
const ACCEL = 3;
const BRAKE = 6;
/** The radius of a person for a car's touch, metres. */
const BODY = 0.3;
/** A car over this speed (m/s) coming at someone makes them jump. */
const DODGE_SPEED = 6;
const DODGE_REACH = 11;
const DODGE_JUMP = 5.5;
const DODGE_TIME = 0.55;
/** Three in four jump aside. */
const DODGE_CHANCE = 0.75;
/** A person who has been given a chance to jump is not asked again for this long. */
const DODGE_COOL = 2;
/** One in sixteen crosses on red. */
const JAY = 1 / 16;
/** Green must have this long left to step onto a crosswalk. */
const GREEN_NEEDED = 4;
/** A person this slow (m/s) or slower, and held by the light, is "waiting". */
const STILL = 0.3;
/** Within this much of a crosswalk's start they have not committed to it yet. */
const COMMIT = 0.3;
const SWIM_SPEED = 1.6;
const WATER_Z = -0.6;
/** A knocked person is pushed no faster than this (m/s). */
const KNOCK_MAX = 12;
const KNOCK_DECAY = 7;
const FAR_SCARE = 25;
const BUCKET = 20;
const MIN_EDGE = 3;
/** How far a person who gets up looks for a walking edge to go back to. */
const REATTACH = 40;
/** How far a swimmer looks for the shore. */
const SHORE_REACH = 160;
/** The pace at which someone who left their line (a jump, a swim) walks back onto it, m/s. */
const RETURN = 2.5;

/** A walking edge with what the crowd asks of it often. */
interface Way {
  edge: WalkEdge;
  /** metres along the polyline at each vertex, in plan */
  cum: Float32Array;
  len: number;
  /** the signal phase of a crosswalk (0 along, 1 across), or -1 for none */
  phase: -1 | 0 | 1;
}

interface Next {
  way: Way;
  dir: 1 | -1;
  jay: boolean;
}

/** The crowd's private bookkeeping, on the same object the renderer reads. */
interface Walker extends Person {
  way: Way;
  dir: 1 | -1;
  /** metres walked along the way, in the walking direction */
  s: number;
  /** speed along the line, m/s */
  v: number;
  base: number;
  /** metres to the right of the line */
  side: number;
  /** a lateral offset from the line, decaying to 0 */
  off: number;
  jay: boolean;
  next: Next | null;
  cool: number;
  dodgeFor: number;
  /** velocity while off the line (dodging, down) */
  ve: number;
  vn: number;
  swimTo: [number, number] | null;
}

const keyOf = (gi: number, gj: number) => (gi + 65536) * 131072 + (gj + 65536);
const wrap = (a: number) => {
  let x = (a + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
};
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export class Crowd {
  /** How many people to keep (the game may lower it on a slow machine). */
  budget = 150;
  people: Person[] = [];

  private ways = new Map<WalkEdge, Way>();
  private byNode = new Map<number, Way[]>();
  private grid = new Map<number, Way[]>();
  private all: Way[] = [];
  private stamp = "";
  private out: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  constructor(
    private world: WalkWorld,
    private random: () => number,
  ) {}

  // ---------- the walking edges ----------

  /** Rebuilds the index of walking edges when the loaded squares change. */
  private refresh(): void {
    let sum = 0;
    let count = 0;
    for (const c of this.world.cells()) {
      sum += c.i * 7919 + c.j * 104729 + c.walks.length;
      count++;
    }
    const stamp = `${count}:${sum}`;
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    this.byNode.clear();
    this.grid.clear();
    this.all = [];
    const seen = new Set<string>();
    for (const c of this.world.cells())
      for (const edge of c.walks) {
        if (seen.has(edge.key) || edge.pts.length < 6) continue;
        seen.add(edge.key);
        const way = this.wayOf(edge);
        this.all.push(way);
        for (const id of edge.a === edge.b ? [edge.a] : [edge.a, edge.b]) {
          const list = this.byNode.get(id);
          if (list) list.push(way);
          else this.byNode.set(id, [way]);
        }
        this.file(way);
      }
  }

  private wayOf(edge: WalkEdge): Way {
    let way = this.ways.get(edge);
    if (way) return way;
    const k = edge.pts.length / 3;
    const cum = new Float32Array(k);
    for (let q = 1; q < k; q++)
      cum[q] =
        cum[q - 1] +
        Math.hypot(
          edge.pts[q * 3] - edge.pts[q * 3 - 3],
          edge.pts[q * 3 + 1] - edge.pts[q * 3 - 2],
        );
    way = {
      edge,
      cum,
      len: cum[k - 1],
      phase: edge.crosswalk && edge.phase !== 0 ? ((edge.phase - 1) as 0 | 1) : -1,
    };
    this.ways.set(edge, way);
    return way;
  }

  /** Files a way under every 20 m bucket it passes through. */
  private file(way: Way): void {
    const keys = new Set<number>();
    for (let x = 0; x <= way.len + 4; x += 4) {
      const [e, n] = this.sample(way, Math.min(x, way.len), this.out);
      keys.add(keyOf(Math.floor(e / BUCKET), Math.floor(n / BUCKET)));
    }
    for (const key of keys) {
      const list = this.grid.get(key);
      if (list) list.push(way);
      else this.grid.set(key, [way]);
    }
  }

  /** [e, n, z, unit tangent e, unit tangent n] at x metres along the way (increasing direction). */
  private sample(way: Way, x: number, out: number[]): number[] {
    const { cum, edge } = way;
    const p = edge.pts;
    const k = cum.length;
    x = clamp(x, 0, way.len);
    let q = 1;
    while (q < k - 1 && cum[q] < x) q++;
    const seg = cum[q] - cum[q - 1];
    const t = seg > 1e-6 ? (x - cum[q - 1]) / seg : 0;
    const de = p[q * 3] - p[q * 3 - 3];
    const dn = p[q * 3 + 1] - p[q * 3 - 2];
    const l = Math.hypot(de, dn) || 1;
    out[0] = p[q * 3 - 3] + de * t;
    out[1] = p[q * 3 - 2] + dn * t;
    out[2] = p[q * 3 - 1] + (p[q * 3 + 2] - p[q * 3 - 1]) * t;
    out[3] = de / l;
    out[4] = dn / l;
    return out;
  }

  /** The nearest point of a way to (e, n): metres along it, plan distance, and which side (+ right of increasing). */
  private nearest(way: Way, e: number, n: number) {
    const p = way.edge.pts;
    let best = Infinity;
    let x = 0;
    let lat = 0;
    let z = 0;
    for (let q = 1; q < way.cum.length; q++) {
      const ae = p[q * 3 - 3];
      const an = p[q * 3 - 2];
      const de = p[q * 3] - ae;
      const dn = p[q * 3 + 1] - an;
      const len2 = de * de + dn * dn;
      const t = len2 > 0 ? clamp(((e - ae) * de + (n - an) * dn) / len2, 0, 1) : 0;
      const qe = ae + de * t;
      const qn = an + dn * t;
      const d = Math.hypot(e - qe, n - qn);
      if (d < best) {
        best = d;
        x = way.cum[q - 1] + (way.cum[q] - way.cum[q - 1]) * t;
        const l = Math.sqrt(len2) || 1;
        lat = ((e - qe) * dn - (n - qn) * de) / l;
        z = p[q * 3 - 1] + (p[q * 3 + 2] - p[q * 3 - 1]) * t;
      }
    }
    return { x, d: best, lat, z };
  }

  /** Where the person is on its line, and the line's direction of travel there. */
  private place(w: Walker): void {
    const x = w.dir > 0 ? w.s : w.way.len - w.s;
    const o = this.sample(w.way, x, this.out);
    const te = o[3] * w.dir;
    const tn = o[4] * w.dir;
    const lateral = w.side + w.off;
    w.e = o[0] + tn * lateral;
    w.n = o[1] - te * lateral;
    w.z = o[2];
    w.yaw = Math.atan2(te, tn);
  }

  // ---------- making and finding people ----------

  private look(): Person["look"] {
    const r = () => Math.floor(this.random() * 8);
    return { skin: r(), hair: r(), top: r(), bottom: r() };
  }

  private make(way: Way, dir: 1 | -1, s: number): Walker {
    const w: Walker = {
      e: 0,
      n: 0,
      z: 0,
      yaw: 0,
      state: "walking",
      downFor: 0,
      runFor: 0,
      look: this.look(),
      phase: this.random() * Math.PI * 2,
      way,
      dir,
      s,
      v: 0,
      base: WALK_MIN + this.random() * WALK_SPREAD,
      side: 0.6 + this.random() * 0.4,
      off: 0,
      jay: false,
      next: null,
      cool: 0,
      dodgeFor: 0,
      ve: 0,
      vn: 0,
      swimTo: null,
    };
    w.jay = way.phase >= 0 && this.random() < JAY;
    this.place(w);
    return w;
  }

  /**
   * Puts someone on the walking edge with this key, `s` metres along it in the walking direction
   * `dir` (1 from the edge's first node to its second), standing still. For tests and for a game
   * that wants a person in a particular place; `null` for an edge that is not loaded.
   */
  addAt(key: string, s: number, dir: 1 | -1 = 1): Person | null {
    this.refresh();
    const way = this.all.find((x) => x.edge.key === key);
    if (!way) return null;
    const p = this.make(way, dir, clamp(s, 0, way.len));
    this.people.push(p);
    return p;
  }

  /** One person near a random point of the ring [rMin, rMax] round the focus, or null when it found no sidewalk. */
  private spawn(
    focus: { e: number; n: number },
    rMin: number,
    rMax: number,
    visible?: (e: number, n: number) => boolean,
  ): Walker | null {
    for (let tries = 0; tries < 10; tries++) {
      const a = this.random() * Math.PI * 2;
      const r = rMin + this.random() * (rMax - rMin);
      const qe = focus.e + Math.sin(a) * r;
      const qn = focus.n + Math.cos(a) * r;
      const list = this.grid.get(keyOf(Math.floor(qe / BUCKET), Math.floor(qn / BUCKET)));
      if (!list?.length) continue;
      const way = list[Math.floor(this.random() * list.length)];
      if (way.len < MIN_EDGE) continue;
      const hit = this.nearest(way, qe, qn);
      const dir = this.random() < 0.5 ? 1 : -1;
      const p = this.make(way, dir, dir > 0 ? hit.x : way.len - hit.x);
      const d = Math.hypot(p.e - focus.e, p.n - focus.n);
      if (d < rMin || d > rMax || visible?.(p.e, p.n)) continue;
      p.v = p.base;
      return p;
    }
    return null;
  }

  /** Fills the crowd up to the budget anywhere within 170 m, except within 15 m of the focus: the start, and after a teleport. */
  prime(focus: { e: number; n: number }): void {
    this.refresh();
    for (let tries = 0; this.people.length < this.budget && tries < this.budget * 8; tries++) {
      const p = this.spawn(focus, PRIME_CLEAR, SPAWN_MAX);
      if (p) this.people.push(p);
    }
  }

  // ---------- events from outside ----------

  /** Everyone on their feet within `radius` of (e, n) runs for 5 to 8 s: a horn, a crash, a knock, a wreck. */
  scare(e: number, n: number, radius: number): void {
    for (const q of this.people) {
      if (q.state === "down" || q.state === "swimming") continue;
      if (Math.hypot(q.e - e, q.n - n) > radius) continue;
      q.runFor = 5 + this.random() * 3;
      if (q.state !== "dodging") q.state = "running";
    }
  }

  /** Knocks a person down, pushed along (ve, vn): lies for 3.5 to 5.5 s, and those near them run. */
  knock(p: Person, from: { ve: number; vn: number }): void {
    const w = p as Walker;
    const sp = Math.hypot(from.ve, from.vn);
    const k = sp > KNOCK_MAX ? KNOCK_MAX / sp : 1;
    w.state = "down";
    w.ve = from.ve * 0.8 * k + (this.random() - 0.5) * 2;
    w.vn = from.vn * 0.8 * k + (this.random() - 0.5) * 2;
    w.downFor = 3.5 + this.random() * 2;
    w.runFor = 0;
    w.dodgeFor = 0;
    w.swimTo = null;
    this.scare(w.e, w.n, FAR_SCARE);
  }

  // ---------- the step ----------

  step(
    dt: number,
    t: number,
    focus: { e: number; n: number },
    vehicles: Vehicle[],
    visible?: (e: number, n: number) => boolean,
  ): CrowdEvents {
    this.refresh();
    const events: CrowdEvents = { knocks: [] };

    // vehicles that can hurt: moving ones
    const movers: { v: Vehicle; ve: number; vn: number; speed: number }[] = [];
    for (const v of vehicles) {
      if (v.state === "parked" || v.state === "sinking" || v.state === "sunk") continue;
      const s = Math.sin(v.yaw);
      const c = Math.cos(v.yaw);
      const ve = s * v.v + c * v.vs;
      const vn = c * v.v - s * v.vs;
      const speed = Math.hypot(ve, vn);
      if (speed > 1) movers.push({ v, ve, vn, speed });
    }

    for (let i = this.people.length - 1; i >= 0; i--) {
      const w = this.people[i] as Walker;
      if (Math.hypot(w.e - focus.e, w.n - focus.n) > DROP) {
        this.people.splice(i, 1);
        continue;
      }
      if (!this.live(w, dt, t)) {
        this.people.splice(i, 1);
        continue;
      }
      if (w.state === "down" || w.state === "swimming") continue;
      this.meet(w, movers, events);
    }

    for (let k = 0; k < SPAWNS_PER_STEP && this.people.length < this.budget; k++) {
      const p = this.spawn(focus, SPAWN_MIN, SPAWN_MAX, visible);
      if (p) this.people.push(p);
    }
    return events;
  }

  /** One person's own step; false when they have nowhere to be (left on no street) and go. */
  private live(w: Walker, dt: number, t: number): boolean {
    if (w.cool > 0) w.cool -= dt;
    if (w.state === "swimming") return this.swim(w, dt);
    if (w.state === "down") return this.lie(w, dt);
    if (w.runFor > 0) {
      w.runFor -= dt;
      if (w.runFor <= 0) {
        w.runFor = 0;
        if (w.state === "running") w.state = "walking";
      }
    }
    if (w.state === "dodging") return this.dodge(w, dt);
    this.walk(w, dt, t);
    return true;
  }

  /** Whether the light stops someone from stepping onto this crosswalk now. */
  private red(way: Way, jay: boolean, t: number): boolean {
    const phase = way.phase;
    if (phase < 0 || jay) return false;
    return !(signal(t, phase as 0 | 1) === "green" && greenLeft(t, phase as 0 | 1) >= GREEN_NEEDED);
  }

  private walk(w: Walker, dt: number, t: number): void {
    const running = w.state === "running";
    let want = running ? RUN : w.base;
    let held = false;
    let atEnd = false;
    // at the start of a crosswalk, or on the way to one, until the light says go
    if (!running) {
      if (w.s < COMMIT && this.red(w.way, w.jay, t)) {
        want = 0;
        held = true;
      } else if (w.way.len - w.s < 3) {
        w.next ??= this.pick(w);
        if (this.red(w.next.way, w.next.jay, t)) {
          want = Math.min(want, (w.way.len - w.s) * 2.5);
          held = true;
          atEnd = true;
        }
      }
    }
    w.v += clamp(want - w.v, -BRAKE * dt, ACCEL * dt);
    w.s += w.v * dt;
    if (atEnd && w.s > w.way.len - 0.02) {
      w.s = w.way.len - 0.02;
      w.v = 0;
    }
    if (w.s >= w.way.len) {
      const next = w.next ?? this.pick(w);
      w.s -= w.way.len;
      w.way = next.way;
      w.dir = next.dir;
      w.jay = next.jay;
      w.next = null;
      w.s = Math.min(w.s, w.way.len);
    }
    if (w.off !== 0) w.off -= clamp(w.off, -RETURN * dt, RETURN * dt);
    this.place(w);
    w.phase += w.v * dt * 3.6;
    if (!running) w.state = held && w.v < STILL ? "waiting" : "walking";
  }

  /** The edge a person takes at the end of theirs: straight on if it can, never back unless a dead end. */
  private pick(w: Walker): Next {
    const node = w.dir > 0 ? w.way.edge.b : w.way.edge.a;
    const here = this.sample(w.way, w.dir > 0 ? w.way.len : 0, this.out);
    const inAng = Math.atan2(here[3] * w.dir, here[4] * w.dir);
    const opts: { way: Way; dir: 1 | -1; w: number }[] = [];
    for (const way of this.byNode.get(node) ?? []) {
      if (way === w.way) continue;
      const dir: 1 | -1 = way.edge.a === node ? 1 : -1;
      const o = this.sample(way, dir > 0 ? 0 : way.len, this.out);
      const turn = Math.abs(wrap(Math.atan2(o[3] * dir, o[4] * dir) - inAng));
      opts.push({ way, dir, w: turn < 0.61 ? 3 : turn < 2.62 ? 1.2 : 0.1 });
    }
    let pickd: { way: Way; dir: 1 | -1 };
    if (!opts.length) pickd = { way: w.way, dir: -w.dir as 1 | -1 };
    else {
      let r = this.random() * opts.reduce((s, o) => s + o.w, 0);
      pickd = opts[0];
      for (const o of opts) {
        r -= o.w;
        if (r <= 0) {
          pickd = o;
          break;
        }
      }
    }
    return { ...pickd, jay: pickd.way.phase >= 0 && this.random() < JAY };
  }

  /** A jump aside: free movement for a moment, then back to the line. */
  private dodge(w: Walker, dt: number): boolean {
    this.drift(w, dt, 0);
    w.dodgeFor -= dt;
    if (w.dodgeFor <= 0) {
      w.dodgeFor = 0;
      if (!this.reattach(w, true)) return false;
      w.state = w.runFor > 0 ? "running" : "walking";
      w.v = 0;
    }
    w.phase += dt * 14;
    return true;
  }

  /** Lying where a knock left them; then up, running scared, back to a line. */
  private lie(w: Walker, dt: number): boolean {
    this.drift(w, dt, KNOCK_DECAY);
    if (this.world.isWater(w.e, w.n) && w.z <= 0.5) {
      w.state = "swimming";
      w.swimTo = null;
      w.downFor = 0;
      return true;
    }
    w.downFor -= dt;
    if (w.downFor <= 0) {
      w.downFor = 0;
      if (!this.reattach(w, false)) return false;
      w.state = "running";
      w.runFor = 5;
    }
    return true;
  }

  /** Free movement with the velocity (ve, vn), slowed by `decay` m/s²; stopped by a wall, a wall of the data or the edge of a deck. */
  private drift(w: Walker, dt: number, decay: number): void {
    const ne = w.e + w.ve * dt;
    const nn = w.n + w.vn * dt;
    const stop =
      this.world.blocked(ne, nn, BODY, w.z, 1.7) ||
      (w.z > 0.5 && this.world.surfaceUnder(ne, nn, w.z, 0.6).z < w.z - 0.5);
    if (stop) {
      w.ve = 0;
      w.vn = 0;
    } else {
      w.e = ne;
      w.n = nn;
    }
    const sp = Math.hypot(w.ve, w.vn);
    if (sp > 0) {
      const k = Math.max(0, sp - decay * dt) / sp;
      w.ve *= k;
      w.vn *= k;
      if (sp > 0.1) w.yaw = Math.atan2(w.ve, w.vn);
    }
  }

  /**
   * Back onto a line from wherever they are: their own edge (a jump), or the nearest within 40 m
   * (a fall, a swim). They walk back onto the line from the side they stand on; false when there
   * is no edge near.
   */
  private reattach(w: Walker, same: boolean): boolean {
    let best: { way: Way; x: number; lat: number; score: number } | null = null;
    const ways = same ? [w.way] : this.near(w.e, w.n, REATTACH);
    for (const way of ways) {
      const h = this.nearest(way, w.e, w.n);
      const score = h.d + Math.abs(h.z - w.z) * 2;
      if (h.d <= REATTACH && (!best || score < best.score))
        best = { way, x: h.x, lat: h.lat, score };
    }
    if (!best) return false;
    const dir: 1 | -1 = best.way === w.way ? w.dir : this.random() < 0.5 ? 1 : -1;
    w.way = best.way;
    w.dir = dir;
    w.s = dir > 0 ? best.x : best.way.len - best.x;
    w.off = (dir > 0 ? best.lat : -best.lat) - w.side;
    w.next = null;
    if (!same) w.jay = true;
    w.swimTo = null;
    w.ve = 0;
    w.vn = 0;
    this.place(w);
    return true;
  }

  /** The ways filed within `r` metres of a point. */
  private near(e: number, n: number, r: number): Way[] {
    const out = new Set<Way>();
    const g0 = Math.floor((e - r) / BUCKET);
    const g1 = Math.floor((e + r) / BUCKET);
    const h0 = Math.floor((n - r) / BUCKET);
    const h1 = Math.floor((n + r) / BUCKET);
    for (let gi = g0; gi <= g1; gi++)
      for (let gj = h0; gj <= h1; gj++)
        for (const way of this.grid.get(keyOf(gi, gj)) ?? []) out.add(way);
    return [...out];
  }

  /** Swimming to the nearest shore, then climbing out onto the nearest walking edge. */
  private swim(w: Walker, dt: number): boolean {
    w.z = WATER_Z;
    if (!w.swimTo) {
      w.swimTo = this.shore(w.e, w.n);
      if (!w.swimTo) return false;
    }
    const [te, tn] = w.swimTo;
    const de = te - w.e;
    const dn = tn - w.n;
    const d = Math.hypot(de, dn);
    const step = Math.min(d, SWIM_SPEED * dt);
    if (d > 1e-6) {
      w.e += (de / d) * step;
      w.n += (dn / d) * step;
      w.yaw = Math.atan2(de, dn);
    }
    w.phase += dt * 5;
    if (d <= step + 1e-6 || !this.world.isWater(w.e, w.n)) {
      w.z = 0;
      w.state = "walking";
      if (!this.reattach(w, false)) return false;
      w.v = 0;
    }
    return true;
  }

  /** The nearest dry spot a person can stand on, searching outwards in rings; null when none within reach. */
  private shore(e: number, n: number): [number, number] | null {
    for (let r = 2; r <= SHORE_REACH; r += 2) {
      const k = Math.max(8, Math.ceil((Math.PI * r) / 2));
      for (let a = 0; a < k; a++) {
        const qe = e + Math.sin((a / k) * Math.PI * 2) * r;
        const qn = n + Math.cos((a / k) * Math.PI * 2) * r;
        if (!this.world.isWater(qe, qn) && !this.world.blocked(qe, qn, BODY, 0, 1.7))
          return [qe, qn];
      }
    }
    return null;
  }

  /** A moving vehicle against one person: a touch knocks them down, one coming at them makes them jump. */
  private meet(
    w: Walker,
    movers: { v: Vehicle; ve: number; vn: number; speed: number }[],
    events: CrowdEvents,
  ): void {
    for (const m of movers) {
      const v = m.v;
      const dE = w.e - v.e;
      const dN = w.n - v.n;
      if (Math.abs(dE) > 14 || Math.abs(dN) > 14 || Math.abs(w.z - v.z) > 2.5) continue;
      const spec = sizeOf(v.kind);
      const s = Math.sin(v.yaw);
      const c = Math.cos(v.yaw);
      const f = dE * s + dN * c;
      const r = dE * c - dN * s;
      const dist = Math.hypot(
        Math.max(0, Math.abs(f) - spec.length / 2),
        Math.max(0, Math.abs(r) - spec.width / 2),
      );
      if (dist < BODY) {
        events.knocks.push({ e: w.e, n: w.n, speed: m.speed });
        this.knock(w, m);
        return;
      }
      if (m.speed > DODGE_SPEED && w.cool <= 0) {
        const ue = m.ve / m.speed;
        const un = m.vn / m.speed;
        const along = dE * ue + dN * un;
        const across = dE * un - dN * ue;
        if (along > 0 && along < DODGE_REACH && Math.abs(across) < spec.width / 2 + 1) {
          w.cool = DODGE_COOL;
          if (this.random() < DODGE_CHANCE) {
            const side = Math.sign(across) || 1;
            w.state = "dodging";
            w.ve = un * side * DODGE_JUMP;
            w.vn = -ue * side * DODGE_JUMP;
            w.dodgeFor = DODGE_TIME;
            return;
          }
        }
      }
    }
  }
}
