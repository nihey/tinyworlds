import type * as THREE from "three";
import type { Strings } from "@/i18n/types";
import type { LifeFile } from "../map/life";
import type { StreetEdge, WalkCell } from "./cell";
import { applyBody, bodyOf, overlap, resolve, type Body } from "./collide";
import { actionsOf, type ActionId, type Bindings } from "./controls";
import { CELL, lonLatToEN } from "./geo";
import { LIFE_MAX, fireDamage, hitDamage, regen } from "./health";
import type { BoatKind, CarKind } from "./kinds";
import { Crowd } from "./people";
import {
  EYE,
  HEIGHT,
  RADIUS,
  STEP_UP,
  SWIM_EYE,
  newPlayer,
  stepFoot,
  type FootInput,
  type Player,
} from "./player";
import { FOG_FAR } from "./render/materials";
import { EYES, WalkModels } from "./render/models";
import { makePalette, type Palette } from "./render/palette";
import { WalkParticles } from "./render/particles";
import type { WalkSound } from "./sound";
import { comeTo } from "./spawn";
import { RoadNet, Traffic, parkedOn, starterCar, type Blocker, type KerbSpot } from "./traffic";
import {
  applyDamage,
  newVehicle,
  nextVehicleId,
  sizeOf,
  stepBoat,
  stepCar,
  type DriveInput,
  type Vehicle,
  type VehicleEvents,
} from "./vehicles";
import { cellExists, type WalkIndex } from "./walk-index";
import { WASTED, wastedAt } from "./wasted";
import type { WalkWorld } from "./world";

/**
 * The walk as a game: the loop and everything it ties together. You on foot (walking, jumping,
 * swimming), the car or boat you drive, the loose cars and wrecks, the traffic, the people, the
 * boats at their moorings and the ferries on their routes; what hits what, what that costs, the
 * wrecks' fires, the sinking, your life and the wasted sequence; getting in and out; the two
 * cameras; the models, particles and sounds. No React and no DOM beyond the animation frame:
 * the screen hands it keys, pointer moves and touches, and draws its signs from `WalkState`.
 */

/** What the game needs of the view: its world, its scene and its camera (`WalkView` is one). */
export interface GameView {
  readonly world: WalkWorld;
  readonly scene: THREE.Scene;
  setCamera(e: number, n: number, z: number, yaw: number, pitch: number, fov: number): void;
  update(dt: number): void;
  render(): void;
}

/** The ferries' routes, as `life.json` has them. */
export type LifeRoutes = LifeFile["ferries"];

export type WalkMessage = keyof Strings["walk"]["messages"];

/** What the signs show. */
export interface WalkState {
  mode: Player["mode"] | "boat";
  life: number;
  vehicle: {
    kind: CarKind | BoatKind;
    /** m/s along its heading */
    speed: number;
    damage: number;
    wrecked: boolean;
    boat: boolean;
  } | null;
  /** what you could get into from here */
  near: { kind: CarKind | BoatKind } | null;
  message: WalkMessage | null;
  /** 0 to 1: the flash of being hurt, fading */
  hurt: number;
  wasted: ReturnType<typeof wastedAt> | null;
  camera: "chase" | "wheel";
  /** 0 to 1: the screen goes dark while you pass through a tunnel */
  dark: number;
}

export interface WalkGameOptions {
  view: GameView;
  ix: WalkIndex;
  life: LifeRoutes;
  /** where you stand at first: z the feet's height when it is known (a deck), else found */
  start: { e: number; n: number; yaw: number; z?: number };
  bindings: Bindings;
  reduced: boolean;
  sound: WalkSound;
  units: "imperial" | "metric";
  /** New York's first walk: a red supercar waits by the start */
  starter?: boolean;
  random?: () => number;
}

declare global {
  interface Window {
    /** The walk, for the console and checks: development builds only. */
    walk?: { sim(seconds: number): void; readonly state: WalkState; vehicles(): Vehicle[] };
  }
}

// the clock
const MAX_DT = 0.1;
const SIM_STEP = 1 / 30;
const WATER_Z = -0.6;
// getting in and out
const ENTER_REACH = 2.4;
const EXIT_SPEED = 4;
const EXIT_SIDE = 0.6;
const EXIT_END = 0.7;
/** A boat lets you off onto land this near its side, m. */
const STEP_OFF = [0.5, 1, 1.5];
/** Going in from a boat, this far out from its side. */
const SWIM_OFF = 0.8;
/** Out of the order the doors are tried in: the driver's side (the left), the other, the front, the back. */
const DOORS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, 1],
  [0, -1],
];
// hits
/** Slower than this, m/s, a hit makes no crunch and no sparks. */
const CRUNCH = 2.2;
/** A hit you survive knocks you down this long, s, and throws you this share of its speed. */
const KNOCKED = 1.5;
const THROWN = 0.6;
const KNOCK_FRICTION = 6;
/** After a hit, a touch only pushes for this long: one hit hurts once. */
const HIT_COOL = 0.8;
/** How hard a crash sounds at its loudest, and how far it is heard. */
const CRASH_LOUD = 25;
const CRASH_HEAR = 80;
const BOOM_HEAR = 150;
const CRASH_SCARE = 20;
const HORN_SCARE = 12;
const WRECK_SCARE = 40;
const WRECK_KNOCK = 7;
const FIRE_REACH = 5;
// the signs
const MESSAGE_FOR = 2.5;
const HURT_FADE = 0.6;
const JUMP_BUFFER = 0.2;
// the cameras
const FOV = 70;
const LOOK_RETURN = 1.4;
const LOOK_PITCH = -0.1;
const FOLLOW = 3.2;
/** Pointer movement to radians. */
const MOUSE = 0.0021;
/** What counts as in view, either side of where the camera looks (generous: a wide screen, a wide view). */
const VIEW_HALF = 1.15;
// what is kept round you
const NEAR = 300;
const GATHER_EVERY = 0.25;
const PARK_REACH = 320;
const PARK_DROP = 420;
const PARK_EVERY = 1;
const LOOSE_KEEP = 700;
const COLLIDE_REACH = 250;
const ROOF_REACH = 15;
/** A car's roof holds you up this far beyond its body (your radius, nearly). */
const ROOF_GROW = 0.3;
const BUCKET = 16;
const SMOKE_REACH = 150;
// the ferries
const FERRY_SPEED = 7;
const STATEN_SPEED = 8;
const FERRY_PAUSE = 15;
const FERRY_MIN = 200;
const FERRY_NEAR = 800;
/** A route's boat taken away comes back no nearer to you than this, out of sight. */
const FERRY_BACK = 400;
/** Faster than this, m/s, a move was a jump (a tunnel's far end), not a speed. */
const JUMPED = 120;
// the start and teleports
const SETTLE_REACH = 2;
const PRIME_GIVE_UP = 6;
const STARTER_GIVE_UP = 10;
const STARTER_EVERY = 0.5;
// tunnels
const PORTAL_REACH = 3;
/** A portal reaches this far either side of its middle: across the roadway. */
const PORTAL_WIDE = 6;
const TUNNEL_SPEED = 3;
/** The dark lasts as the tunnel would at your speed, but never longer than this, s. */
const TUNNEL_MAX = 8;
const TUNNEL_WAIT = 10;
const TUNNEL_OUT = 4;
/** Where the edge of the data is looked for, ahead of you, m. */
const EDGE_LOOK = 1.5;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const wrap = (a: number) => {
  const x = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return x - Math.PI;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const TOTAL = WASTED.wordAt + WASTED.holdFor + WASTED.fadeFor;

type Box = [number, number, number, number];

interface Eye {
  e: number;
  n: number;
  z: number;
  yaw: number;
  pitch: number;
  fov: number;
}

interface Spot {
  e: number;
  n: number;
  z: number;
  swim: boolean;
}

interface Ferry {
  name: string;
  /** e, n pairs */
  pts: number[];
  cum: number[];
  len: number;
  speed: number;
  phase: number;
  staten: boolean;
  boat: Vehicle | null;
}

/**
 * Where a point is against a vehicle's box, in plan: `d` its distance outside the box (negative
 * inside it: how deep), (ne, nn) the unit way from the box out to the point.
 */
function fromBox(v: Vehicle, e: number, n: number, grow = 0) {
  const s = sizeOf(v.kind);
  const hl = s.length / 2 + grow;
  const hw = s.width / 2 + grow;
  const sy = Math.sin(v.yaw);
  const cy = Math.cos(v.yaw);
  const de = e - v.e;
  const dn = n - v.n;
  const f = de * sy + dn * cy;
  const r = de * cy - dn * sy;
  const df = f - clamp(f, -hl, hl);
  const dr = r - clamp(r, -hw, hw);
  const d = Math.hypot(df, dr);
  if (d > 1e-9) return { d, ne: (df * sy + dr * cy) / d, nn: (df * cy - dr * sy) / d };
  // inside: out through the nearer side
  const toEnd = hl - Math.abs(f);
  const toSide = hw - Math.abs(r);
  if (toEnd < toSide) {
    const s1 = f >= 0 ? 1 : -1;
    return { d: -toEnd, ne: sy * s1, nn: cy * s1 };
  }
  const s1 = r >= 0 ? 1 : -1;
  return { d: -toSide, ne: cy * s1, nn: -sy * s1 };
}

/** A vehicle's height from its bottom (a boat's hull reaches under the water) to its roof. */
function span(v: Vehicle): [number, number] {
  const h = sizeOf(v.kind).height * (v.state === "wrecked" ? 0.85 : 1);
  return [v.boat ? v.z - 1 : v.z, v.z + h];
}

const moving = (v: Vehicle) => v.v !== 0 || v.vs !== 0 || v.w !== 0 || v.vz !== 0;

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

/** Where a ferry is on its route at time t: out, a wait at the far end, back, a wait at the start. */
function ferryPose(f: Ferry, t: number) {
  const run = f.len / f.speed;
  const cycle = 2 * (run + FERRY_PAUSE);
  const c = (((t + f.phase * cycle) % cycle) + cycle) % cycle;
  let d: number;
  let back: boolean;
  let speed = f.speed;
  if (c < run) {
    d = c * f.speed;
    back = false;
  } else if (c < run + FERRY_PAUSE) {
    d = f.len;
    back = false;
    speed = 0;
  } else if (c < 2 * run + FERRY_PAUSE) {
    d = f.len - (c - run - FERRY_PAUSE) * f.speed;
    back = true;
  } else {
    d = 0;
    back = true;
    speed = 0;
  }
  let lo = 0;
  let hi = f.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (f.cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = f.cum[hi] - f.cum[lo] || 1;
  const k = clamp((d - f.cum[lo]) / seg, 0, 1);
  const de = f.pts[hi * 2] - f.pts[lo * 2];
  const dn = f.pts[hi * 2 + 1] - f.pts[lo * 2 + 1];
  const yaw = Math.atan2(de, dn) + (back ? Math.PI : 0);
  return { e: f.pts[lo * 2] + de * k, n: f.pts[lo * 2 + 1] + dn * k, yaw, speed };
}

export class WalkGame {
  readonly units: "imperial" | "metric";
  private readonly view: GameView;
  private readonly world: WalkWorld;
  private readonly ix: WalkIndex;
  private readonly sound: WalkSound;
  private readonly reduced: boolean;
  private readonly random: () => number;
  private bindings: Bindings;
  private readonly palette: Palette;
  private readonly models: WalkModels;
  private readonly particles: WalkParticles;
  private readonly net = new RoadNet();
  private readonly traffic: Traffic;
  private readonly crowd: Crowd;
  private readonly player: Player;
  private readonly startAt: { e: number; n: number };

  /** what you drive */
  private yours: Vehicle | null = null;
  /** what the game keeps itself: loose cars, wrecks, what sinks, what you left, the starter */
  private free: Vehicle[] = [];
  /** the parked cars of the streets round you, by street */
  private streets = new Map<string, { box: Box; cars: Vehicle[] }>();
  /** the boats at their moorings, by square */
  private moored = new Map<string, Vehicle[]>();
  /** where a parked car or a moored boat came from, and the spot it leaves empty when it goes */
  private home = new WeakMap<Vehicle, { list: Vehicle[]; tag: string }>();
  private vacated = new Set<string>();
  private ferries: Ferry[];
  private known = new Map<string, WalkCell>();

  // gathered
  private nearby: Vehicle[] = [];
  private kept: Vehicle[] = [];
  private roofCars: Vehicle[] = [];
  private gatherIn = 0;
  private parkIn = 0;

  // input
  private keys = new Set<string>();
  private pressed = new Set<ActionId>();
  private stickX = 0;
  private stickY = 0;
  private jumpFor = 0;
  private wantEnter = false;
  private wantExit = false;
  private hornOn = false;

  // the cameras
  private cam: "chase" | "wheel" = "chase";
  private camYaw = 0;
  private lookYaw = 0;
  private lookPitch = LOOK_PITCH;
  private lookIdle = LOOK_RETURN;
  private fov = FOV;
  private shake = 0;
  private eye: Eye;
  private downEye: Eye | null = null;

  // you
  private vel = { e: 0, n: 0 };
  private before = { e: 0, n: 0 };
  private knock = { e: 0, n: 0 };
  private downFor = 0;
  private hitCool = 0;
  /** held where you are until the square under you is in */
  private waiting = true;
  /** your height is to be found when it is */
  private placeZ: boolean;
  private primePending = true;
  private primeWait = 0;
  private primed = false;
  private starterPending: boolean;
  private starterWait = 0;
  private starterIn = 0;
  private starterSpot: KerbSpot | null = null;
  private wasted = false;
  private wastedT = 0;
  private body: { e: number; n: number; z: number; yaw: number } | null = null;
  private tunnel: {
    left: number;
    wait: number;
    e: number;
    n: number;
    yaw: number;
    speed: number;
  } | null = null;
  private msg: WalkMessage | null = null;
  private msgFor = 0;
  private hurtFlash = 0;

  // what has been seen to happen
  private t = 0;
  private burnt = new WeakSet<Vehicle>();
  private sinkingSeen = new WeakSet<Vehicle>();
  private crunched = new WeakMap<Vehicle, number>();
  private lastSpeed = new WeakMap<Vehicle, number>();

  private listeners = new Set<(s: WalkState) => void>();
  private current: WalkState;
  private signature = "";
  private raf: number | null = null;
  private last = 0;

  constructor(opts: WalkGameOptions) {
    this.view = opts.view;
    this.world = opts.view.world;
    this.ix = opts.ix;
    this.sound = opts.sound;
    this.reduced = opts.reduced;
    this.units = opts.units;
    this.bindings = opts.bindings;
    this.random = opts.random ?? Math.random;
    this.palette = makePalette(opts.ix);
    this.models = new WalkModels(opts.view.scene, this.palette, opts.ix);
    this.particles = new WalkParticles(opts.view.scene, this.palette);
    this.traffic = new Traffic(this.net, this.world, opts.ix.tunnels, this.random);
    this.crowd = new Crowd(this.world, this.random);
    const s = opts.start;
    this.player = newPlayer(s.e, s.n, s.z ?? 0, s.yaw);
    this.placeZ = s.z === undefined;
    this.startAt = { e: s.e, n: s.n };
    this.starterPending = opts.starter === true;
    this.eye = { e: s.e, n: s.n, z: (s.z ?? 0) + EYE, yaw: s.yaw, pitch: 0, fov: FOV };
    this.ferries = this.routes(opts.life);
    this.current = this.snapshot();
  }

  // ---------- what the screen calls ----------

  /** The latest state; `subscribe` is told whenever it changes. */
  get state(): WalkState {
    return this.current;
  }

  subscribe(fn: (s: WalkState) => void): () => void {
    this.listeners.add(fn);
    fn(this.current);
    return () => this.listeners.delete(fn);
  }

  /** A key went down (a `KeyboardEvent.code`): answers the actions it is bound to now, for the screen's own (map, menu, pixels). */
  keyDown(code: string): ActionId[] {
    this.sound.wake();
    const repeat = this.keys.has(code);
    this.keys.add(code);
    const acts = actionsOf(this.bindings, code, this.yours ? "drive" : "foot");
    if (this.wasted) {
      this.skipWasted();
      return acts;
    }
    if (!repeat) for (const a of acts) this.trigger(a);
    return acts;
  }

  keyUp(code: string): void {
    this.keys.delete(code);
  }

  /** Lets go of every key and button (the window lost the focus). */
  releaseKeys(): void {
    this.keys.clear();
    this.pressed.clear();
    this.stickX = 0;
    this.stickY = 0;
  }

  /** The pointer moved (dx right, dy down, in pixels): you look round, or the camera does while you drive. */
  look(dx: number, dy: number): void {
    if (this.wasted || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (this.yours) {
      this.lookYaw = clamp(this.lookYaw + dx * MOUSE, -3, 3);
      this.lookPitch = clamp(this.lookPitch - dy * MOUSE, -0.7, 0.45);
      this.lookIdle = 0;
      return;
    }
    const p = this.player;
    p.yaw = wrap(p.yaw + dx * MOUSE);
    p.pitch = clamp(p.pitch - dy * MOUSE, -1.4, 1.4);
  }

  /** The thumb stick, x right and y down, −1 to 1: walks, swims, drives or sails. */
  stick(x: number, y: number): void {
    this.stickX = Number.isFinite(x) ? clamp(x, -1, 1) : 0;
    this.stickY = Number.isFinite(y) ? clamp(y, -1, 1) : 0;
  }

  /** A touch button held (down) or let go: the action as its key would do it. */
  press(action: ActionId, down: boolean): void {
    this.sound.wake();
    if (!down) {
      this.pressed.delete(action);
      return;
    }
    if (this.wasted) {
      this.skipWasted();
      return;
    }
    const was = this.pressed.has(action);
    this.pressed.add(action);
    if (!was) this.trigger(action);
  }

  setBindings(b: Bindings): void {
    this.bindings = b;
  }

  /** Puts you on foot at (e, n), on the ground there (or at z, facing yaw, when given); what you drove stays. */
  teleport(e: number, n: number, z?: number, yaw?: number): void {
    if (this.wasted || !Number.isFinite(e) || !Number.isFinite(n)) return;
    if (this.yours) this.leaveVehicle(this.yours);
    this.tunnel = null;
    const p = this.player;
    p.e = e;
    p.n = n;
    p.z = z ?? 0;
    if (yaw !== undefined && Number.isFinite(yaw)) p.yaw = yaw;
    p.pitch = 0;
    p.mode = "foot";
    p.vz = 0;
    p.airFrom = null;
    p.launch = p.z;
    this.placeZ = z === undefined;
    this.waiting = true;
    this.primePending = true;
    this.primeWait = 0;
    this.vel = { e: 0, n: 0 };
    this.downFor = 0;
  }

  /** Where you are (in what you drive, where it is) and which way you face. */
  position(): { e: number; n: number; yaw: number } {
    const v = this.yours;
    return v
      ? { e: v.e, n: v.n, yaw: wrap(v.yaw) }
      : { e: this.player.e, n: this.player.n, yaw: wrap(this.player.yaw) };
  }

  /** Skips to the end of the wasted sequence, once the word is up. */
  skipWasted(): void {
    if (!this.wasted || !wastedAt(this.wastedT, this.reduced).skippable) return;
    this.wastedT = Math.max(this.wastedT, TOTAL - WASTED.fadeFor);
  }

  /** Runs the game frame by frame until `stop`. */
  start(): void {
    if (this.raf !== null || typeof requestAnimationFrame === "undefined") return;
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const dt = (now - this.last) / 1000;
      this.last = now;
      this.step(dt);
      this.view.render();
    };
    this.raf = requestAnimationFrame(frame);
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
      const sim = (seconds: number) => {
        this.sim(seconds);
        this.view.render();
      };
      const state = () => this.state;
      const vehicles = () => this.vehicles();
      window.walk = {
        sim,
        get state() {
          return state();
        },
        vehicles,
      };
    }
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (typeof window !== "undefined") delete window.walk;
  }

  dispose(): void {
    this.stop();
    this.sound.horn(false);
    this.models.dispose();
    this.particles.dispose();
    this.palette.texture.dispose();
    this.listeners.clear();
  }

  /** Runs the game `seconds` ahead in steps of 1/30 s, drawing nothing: for checks and the console. */
  sim(seconds: number): void {
    let left = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    while (left > 1e-9) {
      const dt = Math.min(SIM_STEP, left);
      this.step(dt);
      left -= dt;
    }
  }

  /** Every vehicle the game knows: yours, the free ones, parked, moored, the ferries and the traffic. */
  vehicles(): Vehicle[] {
    const out = new Set<Vehicle>();
    if (this.yours) out.add(this.yours);
    for (const v of this.free) out.add(v);
    for (const st of this.streets.values()) for (const v of st.cars) out.add(v);
    for (const list of this.moored.values()) for (const v of list) out.add(v);
    for (const f of this.ferries) if (f.boat) out.add(f.boat);
    for (const v of this.traffic.cars) out.add(v);
    return [...out];
  }

  /** Puts a vehicle in the world, kept by the game: for checks and the console. */
  add(v: Vehicle): void {
    if (v.state === "driven" || v.state === "traffic") v.state = "loose";
    if (!this.free.includes(v)) this.free.push(v);
  }

  // ---------- the step ----------

  private step(dt: number): void {
    const real = clamp(Number.isFinite(dt) ? dt : 0, 0, MAX_DT);
    let h = real;
    if (this.wasted) {
      this.wastedT += real;
      h = real * wastedAt(this.wastedT, this.reduced).timeRate;
    }
    this.t += h;
    this.syncSquares();
    this.settle(real);
    if ((this.parkIn -= real) <= 0) {
      this.parkIn = PARK_EVERY;
      this.park();
    }
    if ((this.gatherIn -= real) <= 0) {
      this.gatherIn = GATHER_EVERY;
      this.gatherKept();
    }
    this.gather();
    const p = this.player;
    this.before = { e: p.e, n: p.n };
    if (this.tunnel) this.tunnelStep(real);
    else if (!this.wasted && !this.waiting) {
      this.wants();
      if (this.yours) this.driveStep(h);
      else this.footStep(h);
      this.portals(h);
      this.edge();
    }
    this.wantEnter = false;
    this.wantExit = false;
    this.horn();
    this.freeStep(h);
    this.ferriesStep(h);
    // the streets fill all at once when the squares round you are in, not piecemeal before
    if (this.primed) {
      this.trafficStep(h);
      this.crowd.step(
        h,
        this.t,
        this.focus(),
        this.nearby.filter((v) => !v.boat),
        this.visible,
      );
    }
    this.gather();
    this.collide();
    this.follow();
    this.youAndVehicles();
    if (h > 0 && !this.wasted && !this.tunnel) {
      const ve = (p.e - this.before.e) / h;
      const vn = (p.n - this.before.n) / h;
      // a jump (a tunnel's far end) is no speed
      this.vel = Math.hypot(ve, vn) < JUMPED ? { e: ve, n: vn } : { e: 0, n: 0 };
    }
    this.watch();
    this.effects(h);
    this.lifeStep(h);
    if (!this.wasted && p.life <= 0) this.goDown();
    if (this.wasted && wastedAt(this.wastedT, this.reduced).done) this.comeToNow();
    this.timers(real);
    this.camera(real);
    this.view.update(real);
    this.draw();
    this.emit();
  }

  /** Where the world is centred: you, or what you drive. */
  private focus(): { e: number; n: number } {
    const v = this.yours;
    return v ? { e: v.e, n: v.n } : { e: this.player.e, n: this.player.n };
  }

  private near(v: { e: number; n: number }, r: number): boolean {
    const f = this.focus();
    return Math.abs(v.e - f.e) <= r && Math.abs(v.n - f.n) <= r;
  }

  private held(a: ActionId): boolean {
    if (this.pressed.has(a)) return true;
    const [k0, k1] = this.bindings[a];
    return (k0 !== null && this.keys.has(k0)) || (k1 !== null && this.keys.has(k1));
  }

  private trigger(a: ActionId): void {
    if (a === "jump") this.jumpFor = JUMP_BUFFER;
    else if (a === "enter") this.wantEnter = true;
    else if (a === "exit") this.wantExit = true;
    else if (a === "camera") this.cam = this.cam === "chase" ? "wheel" : "chase";
  }

  private say(m: WalkMessage): void {
    this.msg = m;
    this.msgFor = MESSAGE_FOR;
  }

  private hurtYou(amount: number): void {
    if (!(amount > 0)) return;
    const p = this.player;
    p.life = Math.max(0, p.life - amount);
    p.sinceHurt = 0;
    this.hurtFlash = 1;
  }

  /** Whether a point is about where the camera looks (or right beside it): nothing is brought in there. */
  private readonly visible = (e: number, n: number): boolean => {
    const c = this.eye;
    const de = e - c.e;
    const dn = n - c.n;
    const d = Math.hypot(de, dn);
    if (d < 8) return true;
    if (d > FOG_FAR + 40) return false;
    return Math.abs(wrap(Math.atan2(de, dn) - c.yaw)) < VIEW_HALF;
  };

  /** The roof of a car under a point, for you on foot. */
  private readonly roofs = (e: number, n: number): number | null => {
    let best: number | null = null;
    for (const v of this.roofCars) {
      if (fromBox(v, e, n, ROOF_GROW).d > 0) continue;
      const top = span(v)[1];
      if (best === null || top > best) best = top;
    }
    return best;
  };

  // ---------- the squares, and what comes with them ----------

  /** The road net and the moorings follow the squares the view has in. */
  private syncSquares(): void {
    for (const c of this.world.cells()) {
      if (this.known.get(c.key) === c) continue;
      this.known.set(c.key, c);
      this.net.add(c);
      this.moor(c);
    }
    for (const [key, c] of this.known)
      if (!this.world.has(c.i, c.j)) {
        this.known.delete(key);
        this.net.remove(key);
        this.moored.delete(key);
      }
  }

  private moor(c: WalkCell): void {
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

  /** Whether the squares round a point are in, or have no data to come. */
  private settled(at: { e: number; n: number }, reach: number): boolean {
    const ci = Math.floor(at.e / CELL);
    const cj = Math.floor(at.n / CELL);
    for (let di = -reach; di <= reach; di++)
      for (let dj = -reach; dj <= reach; dj++)
        if (!this.world.has(ci + di, cj + dj) && cellExists(this.ix, ci + di, cj + dj))
          return false;
    return true;
  }

  /** You stand once your square is in; the streets fill once the squares round you are. */
  private settle(real: number): void {
    const p = this.player;
    if (this.waiting && this.world.inData(p.e, p.n)) {
      this.waiting = false;
      if (this.placeZ) {
        this.placeZ = false;
        if (this.world.isWater(p.e, p.n)) {
          p.mode = "swim";
          p.z = WATER_Z;
        } else p.z = this.world.surfaceUnder(p.e, p.n, 0, STEP_UP).z;
        p.launch = p.z;
      }
    }
    if (this.primePending) {
      this.primeWait += real;
      if (this.settled(this.focus(), SETTLE_REACH) || this.primeWait > PRIME_GIVE_UP) {
        this.primePending = false;
        this.primed = true;
        this.gather();
        this.traffic.prime(this.focus(), this.carsAround());
        this.crowd.prime(this.focus());
      }
    }
    if (this.starterPending && this.settled(this.startAt, SETTLE_REACH)) {
      // every kerb spot round the start is looked at: not every frame
      this.starterWait += real;
      if ((this.starterIn -= real) > 0) return;
      this.starterIn = STARTER_EVERY;
      const got = starterCar(this.world, this.startAt);
      if (got) {
        this.starterSpot = got.spot;
        this.free.push(got.car);
        this.starterPending = false;
        this.parkIn = 0;
      } else if (this.starterWait > STARTER_GIVE_UP) this.starterPending = false;
    }
  }

  /** The streets round you get their parked cars (the same every visit), once each can tell where. */
  private park(): void {
    // the starter's spot is not known yet: nothing parks until it is
    if (this.starterPending) return;
    const me = this.focus();
    const seen = new Set<string>();
    for (const c of this.world.cells())
      for (const s of c.streets) {
        if (seen.has(s.key)) continue;
        seen.add(s.key);
        if (this.streets.has(s.key)) continue;
        const box = streetBox(s);
        if (boxDistance(box, me.e, me.n) > PARK_REACH) continue;
        // null: the squares round it are not all in yet; asked again next time
        const spots = parkedOn(s, this.world, this.starterSpot);
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
    this.gatherIn = 0;
  }

  /** The parked cars and moored boats within 300 m: a few times a second is often enough. */
  private gatherKept(): void {
    const me = this.focus();
    const out: Vehicle[] = [];
    for (const st of this.streets.values()) {
      if (boxDistance(st.box, me.e, me.n) > NEAR) continue;
      for (const v of st.cars) if (this.near(v, NEAR)) out.push(v);
    }
    for (const list of this.moored.values())
      for (const v of list) if (this.near(v, NEAR)) out.push(v);
    this.kept = out;
  }

  /** Every vehicle near you, once each. */
  private gather(): void {
    const out: Vehicle[] = [];
    const yours = this.yours;
    if (yours) out.push(yours);
    for (const v of this.free) if (v !== yours && this.near(v, NEAR)) out.push(v);
    for (const v of this.kept) if (v.state === "parked") out.push(v);
    for (const v of this.traffic.cars) if (v !== yours) out.push(v);
    for (const f of this.ferries)
      if (f.boat && f.boat !== yours && this.near(f.boat, FERRY_NEAR)) out.push(f.boat);
    this.nearby = out;
    this.roofCars = out.filter(
      (v) =>
        !v.boat &&
        v !== yours &&
        v.state !== "sinking" &&
        v.state !== "sunk" &&
        this.near(v, ROOF_REACH),
    );
  }

  /** The cars near you that the traffic does not drive. */
  private carsAround(): Vehicle[] {
    return this.nearby.filter(
      (v) =>
        !v.boat &&
        v.state !== "traffic" &&
        v.state !== "sunk" &&
        !(v === this.yours && this.tunnel),
    );
  }

  /** Takes a vehicle off whatever list held it (a street, a mooring, the free ones, a route). */
  private detach(v: Vehicle): void {
    const home = this.home.get(v);
    if (home) {
      const i = home.list.indexOf(v);
      if (i >= 0) home.list.splice(i, 1);
      this.vacated.add(home.tag);
      this.home.delete(v);
    }
    const i = this.free.indexOf(v);
    if (i >= 0) this.free.splice(i, 1);
    for (const f of this.ferries) if (f.boat === v) f.boat = null;
  }

  /** A parked car or a moored boat that was hit: loose now, and the game's. */
  private loosen(v: Vehicle): void {
    this.detach(v);
    v.state = "loose";
    this.free.push(v);
  }

  // ---------- you ----------

  private footInput(): FootInput {
    const on = (a: ActionId) => (this.held(a) ? 1 : 0);
    return {
      forward: clamp(on("forward") - on("back") - this.stickY, -1, 1),
      strafe: clamp(on("right") - on("left") + this.stickX, -1, 1),
      turn: on("turnRight") - on("turnLeft"),
      sprint: this.held("sprint"),
      jump: this.jumpFor > 0,
    };
  }

  private driveInput(): DriveInput {
    const on = (a: ActionId) => (this.held(a) ? 1 : 0);
    return {
      throttle: clamp(on("accelerate") + Math.max(0, -this.stickY), 0, 1),
      brake: clamp(on("brake") + Math.max(0, this.stickY), 0, 1),
      steer: clamp(on("steerRight") - on("steerLeft") + this.stickX, -1, 1),
      handbrake: this.held("handbrake"),
    };
  }

  private footStep(h: number): void {
    const p = this.player;
    if (p.mode === "down") {
      this.downFor -= h;
      // thrown along by the hit, sliding to a stop; never off an edge, never into a wall
      const sp = Math.hypot(this.knock.e, this.knock.n);
      if (sp > 0) {
        const k = Math.max(0, sp - KNOCK_FRICTION * h) / sp;
        this.knock.e *= k;
        this.knock.n *= k;
        const [e, n] = this.world.slide(
          p.e,
          p.n,
          p.e + this.knock.e * h,
          p.n + this.knock.n * h,
          RADIUS,
          p.z,
          HEIGHT,
        );
        const under = this.world.surfaceUnder(e, n, p.z, STEP_UP);
        if (under.kind !== "water" && Math.abs(under.z - p.z) <= STEP_UP) {
          p.e = e;
          p.n = n;
          p.z = under.z;
        }
      }
      if (this.downFor <= 0) {
        p.mode = "foot";
        this.knock = { e: 0, n: 0 };
      }
      return;
    }
    const input = this.footInput();
    this.world.roofs = this.roofs;
    let ev;
    try {
      ev = stepFoot(p, input, this.world, h);
    } finally {
      this.world.roofs = null;
    }
    if (input.jump && p.vz > 0) this.jumpFor = 0;
    if (ev.hurt > 0) this.hurtFlash = 1;
    if (ev.splashed) this.splash(p.e, p.n, 1.2, 0.5);
  }

  private driveStep(h: number): void {
    const v = this.yours!;
    const ev = v.boat
      ? stepBoat(v, this.driveInput(), this.world, h, this.t, { calm: this.reduced })
      : stepCar(v, this.driveInput(), this.world, h);
    this.events(v, ev);
    this.follow();
    if (v.state === "sunk" || (v.state === "sinking" && v.sink >= 1)) this.swimOut(v);
  }

  /** You go where what you drive goes. */
  private follow(): void {
    const v = this.yours;
    if (!v || this.tunnel) return;
    const p = this.player;
    p.e = v.e;
    p.n = v.n;
    p.z = v.z;
    p.yaw = v.yaw;
  }

  private wants(): void {
    if (this.wantExit && this.yours) this.tryExit();
    else if (this.wantEnter && !this.yours) {
      const v = this.nearest();
      if (v) this.enter(v);
    }
  }

  /** The car or boat nearest you within 2.4 m that you could take: from the street, a pier, or the water beside a boat. */
  private nearest(): Vehicle | null {
    const p = this.player;
    if (p.mode !== "foot" && p.mode !== "swim") return null;
    let best: Vehicle | null = null;
    let bestD = ENTER_REACH;
    for (const v of this.nearby) {
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

  private enter(v: Vehicle): void {
    this.detach(v);
    v.state = "driven";
    v.stopFor = 0;
    this.yours = v;
    const p = this.player;
    p.mode = "drive";
    p.vz = 0;
    p.airFrom = null;
    this.camYaw = v.yaw;
    this.lookYaw = 0;
    this.lookPitch = LOOK_PITCH;
    this.lookIdle = LOOK_RETURN;
    this.jumpFor = 0;
    this.follow();
  }

  private tryExit(): void {
    const v = this.yours!;
    if (Math.hypot(v.v, v.vs) >= EXIT_SPEED) return this.say("slowDown");
    const spot = v.boat ? this.boatExit(v) : this.carExit(v);
    if (!spot) return this.say("noRoom");
    this.leaveVehicle(v);
    this.stand(spot, v.yaw);
  }

  /** What you drove is left where it is, the game's to keep. */
  private leaveVehicle(v: Vehicle): void {
    this.yours = null;
    if (v.state === "driven") v.state = "loose";
    if (!this.free.includes(v)) this.free.push(v);
    this.shake = 0;
    this.fov = FOV;
  }

  private stand(spot: Spot, yaw: number): void {
    const p = this.player;
    p.e = spot.e;
    p.n = spot.n;
    p.z = spot.z;
    p.vz = 0;
    p.airFrom = null;
    p.launch = spot.z;
    p.yaw = yaw;
    p.pitch = 0;
    p.mode = spot.swim ? "swim" : "foot";
  }

  /** Whether another vehicle stands at a point (with room for you) at that height. */
  private occupied(e: number, n: number, z: number, except: Vehicle): boolean {
    for (const v of this.nearby) {
      if (v === except || v.state === "sunk") continue;
      if (Math.abs(v.e - e) > 20 || Math.abs(v.n - n) > 20) continue;
      const [lo, hi] = span(v);
      if (z >= hi || z + HEIGHT <= lo) continue;
      if (fromBox(v, e, n).d < RADIUS) return true;
    }
    return false;
  }

  /** Where you can stand getting out at (e, n), from a vehicle whose floor is at z: not a drop, not a wall. */
  private footing(e: number, n: number, z: number, from: Vehicle): Spot | null {
    if (!this.world.inData(e, n)) return null;
    const under = this.world.surfaceUnder(e, n, z, STEP_UP);
    if (under.z < z - 0.65) return null;
    const swim = under.kind === "water";
    const zf = swim ? WATER_Z : under.z;
    if (this.world.blocked(e, n, RADIUS, zf, HEIGHT) || this.occupied(e, n, zf, from)) return null;
    return { e, n, z: zf, swim };
  }

  /** Out of a car: the driver's side if there is room, else the other, the front, the back; the water only if nothing else. */
  private carExit(v: Vehicle): Spot | null {
    const s = sizeOf(v.kind);
    const sy = Math.sin(v.yaw);
    const cy = Math.cos(v.yaw);
    let water: Spot | null = null;
    for (const [side, end] of DOORS) {
      const off = side * (s.width / 2 + EXIT_SIDE);
      const fwd = end * (s.length / 2 + EXIT_END);
      const spot = this.footing(v.e + cy * off + sy * fwd, v.n - sy * off + cy * fwd, v.z, v);
      if (spot && !spot.swim) return spot;
      water ??= spot;
    }
    return water;
  }

  /** Off a boat: onto a pier or the shore within 1.5 m, else into the water beside it. */
  private boatExit(v: Vehicle): Spot | null {
    const s = sizeOf(v.kind);
    const sy = Math.sin(v.yaw);
    const cy = Math.cos(v.yaw);
    const at = (side: number, end: number, out: number): [number, number] => {
      const off = side * (s.width / 2 + out);
      const fwd = end * (s.length / 2 + out);
      return [v.e + cy * off + sy * fwd, v.n - sy * off + cy * fwd];
    };
    for (const [side, end] of DOORS)
      for (const out of STEP_OFF) {
        const [e, n] = at(side, end, out);
        if (!this.world.inData(e, n) || this.world.isWater(e, n)) continue;
        const land = this.world.surfaceUnder(e, n, WATER_Z, 1.2);
        if (land.kind === "water") continue;
        if (this.world.blocked(e, n, RADIUS, land.z, HEIGHT) || this.occupied(e, n, land.z, v))
          continue;
        return { e, n, z: land.z, swim: false };
      }
    for (const [side, end] of DOORS) {
      const [e, n] = at(side, end, SWIM_OFF);
      if (!this.world.inData(e, n) || !this.world.isWater(e, n)) continue;
      if (this.world.blocked(e, n, RADIUS, WATER_Z, HEIGHT) || this.occupied(e, n, WATER_Z, v))
        continue;
      return { e, n, z: WATER_Z, swim: true };
    }
    return null;
  }

  /** What you drive is going under: out you come, swimming beside it. */
  private swimOut(v: Vehicle): void {
    const s = sizeOf(v.kind);
    const off = s.width / 2 + EXIT_SIDE;
    const e = v.e - Math.cos(v.yaw) * off;
    const n = v.n + Math.sin(v.yaw) * off;
    const beside = this.world.inData(e, n) && this.world.isWater(e, n);
    this.leaveVehicle(v);
    this.stand({ e: beside ? e : v.e, n: beside ? n : v.n, z: WATER_Z, swim: true }, v.yaw);
  }

  /** Bumped by a car or a boat: pushed out of it, and hurt by how fast it closed on you. */
  private youAndVehicles(): void {
    if (this.yours || this.waiting || this.tunnel) return;
    const p = this.player;
    for (const v of this.nearby) {
      if (v.state === "sunk" || v.state === "sinking") continue;
      if (Math.abs(v.e - p.e) > 20 || Math.abs(v.n - p.n) > 20) continue;
      const [lo, hi] = span(v);
      // on its roof, or under it
      if (p.z >= hi - 0.05 || p.z + HEIGHT <= lo) continue;
      const b = fromBox(v, p.e, p.n);
      if (b.d >= RADIUS) continue;
      const push = RADIUS - b.d + 0.01;
      [p.e, p.n] = this.world.slide(
        p.e,
        p.n,
        p.e + b.ne * push,
        p.n + b.nn * push,
        RADIUS,
        p.z,
        HEIGHT,
      );
      if (this.wasted || this.hitCool > 0) continue;
      const body = bodyOf(v);
      // the speed it closed at along the line between you
      const closing = (body.ve - this.vel.e) * b.ne + (body.vn - this.vel.n) * b.nn;
      const hurt = hitDamage(closing);
      if (!(hurt > 0)) continue;
      this.hitCool = HIT_COOL;
      this.hurtYou(hurt);
      if (p.life > 0 && p.mode === "foot") {
        p.mode = "down";
        p.vz = 0;
        p.airFrom = null;
        this.downFor = KNOCKED;
        this.knock = { e: b.ne * closing * THROWN, n: b.nn * closing * THROWN };
      }
    }
  }

  private lifeStep(h: number): void {
    if (this.wasted) return;
    const p = this.player;
    p.life = regen(p.life, p.sinceHurt, h);
    p.sinceHurt += h;
  }

  // ---------- going down, and coming to ----------

  private goDown(): void {
    if (this.wasted) return;
    const p = this.player;
    const v = this.yours;
    if (v) {
      const spot = v.boat ? this.boatExit(v) : this.carExit(v);
      this.leaveVehicle(v);
      this.stand(spot ?? { e: v.e, n: v.n, z: v.z, swim: false }, v.yaw);
    }
    this.wasted = true;
    this.wastedT = 0;
    this.downEye = { ...this.eye };
    this.body = { e: p.e, n: p.n, z: p.mode === "swim" ? WATER_Z : p.z, yaw: p.yaw };
    p.mode = "down";
    p.life = 0;
    p.vz = 0;
    p.airFrom = null;
    this.downFor = 0;
    this.knock = { e: 0, n: 0 };
    this.tunnel = null;
  }

  /** The end of the wasted sequence: you come to on a sidewalk nearby, on your feet, whole. */
  private comeToNow(): void {
    const p = this.player;
    const b = this.body ?? { e: p.e, n: p.n, z: p.z, yaw: p.yaw };
    const spot = comeTo(this.world, b.e, b.n, this.random);
    if (spot) {
      p.e = spot.e;
      p.n = spot.n;
      p.yaw = spot.yaw;
      p.z = this.world.surfaceUnder(spot.e, spot.n, 0, STEP_UP).z;
      p.mode = "foot";
    } else {
      const water = this.world.isWater(b.e, b.n);
      p.e = b.e;
      p.n = b.n;
      p.z = water ? WATER_Z : b.z;
      p.mode = water ? "swim" : "foot";
    }
    p.life = LIFE_MAX;
    p.sinceHurt = 1e9;
    p.vz = 0;
    p.airFrom = null;
    p.launch = p.z;
    p.pitch = 0;
    this.wasted = false;
    this.wastedT = 0;
    this.body = null;
    this.downEye = null;
    this.vel = { e: 0, n: 0 };
    this.hitCool = 0;
    this.hurtFlash = 0;
  }

  // ---------- tunnels and the edge ----------

  /**
   * Into a tunnel's portal (across its roadway, up to 3 m either side of its line): the dark, then
   * the other portal; a closed one stops you at its barrier.
   */
  private portals(h: number): void {
    const p = this.player;
    if (
      h <= 0 ||
      this.yours?.boat ||
      (p.mode !== "foot" && p.mode !== "drive") ||
      Math.abs(p.z) > 3
    )
      return;
    // this step's move
    const de = p.e - this.before.e;
    const dn = p.n - this.before.n;
    for (const t of this.ix.tunnels)
      for (const [end, other] of [
        [t.a, t.b],
        [t.b, t.a],
      ] as const) {
        if (!end) continue;
        const ue = Math.sin(end[2]);
        const un = Math.cos(end[2]);
        const along = (p.e - end[0]) * ue + (p.n - end[1]) * un;
        const across = (p.e - end[0]) * un - (p.n - end[1]) * ue;
        if (Math.abs(along) > PORTAL_REACH || Math.abs(across) > PORTAL_WIDE) continue;
        if (de * ue + dn * un <= 0) continue;
        if (!other) {
          // the barrier: back to where this step began, and stopped
          const v = this.yours;
          if (v) {
            v.e = this.before.e;
            v.n = this.before.n;
            v.v = 0;
            v.vs = 0;
            v.w = 0;
          }
          p.e = this.before.e;
          p.n = this.before.n;
          this.vel = { e: 0, n: 0 };
          this.say("tunnelClosed");
          return;
        }
        const speed = Math.hypot(de, dn) / h;
        const yaw = other[2] + Math.PI;
        this.tunnel = {
          left: Math.min(TUNNEL_MAX, t.length / Math.max(TUNNEL_SPEED, speed)),
          wait: TUNNEL_WAIT,
          e: other[0] + Math.sin(yaw) * TUNNEL_OUT,
          n: other[1] + Math.cos(yaw) * TUNNEL_OUT,
          yaw,
          speed,
        };
        return;
      }
  }

  private tunnelStep(real: number): void {
    const tu = this.tunnel!;
    tu.left -= real;
    if (tu.left > 0) return;
    // out once the far end's square is in (it streams in meanwhile: the camera waits there)
    if (!this.world.inData(tu.e, tu.n) && (tu.wait -= real) > 0) return;
    const z = this.world.surfaceUnder(tu.e, tu.n, 0, STEP_UP).z;
    const v = this.yours;
    if (v) {
      v.e = tu.e;
      v.n = tu.n;
      v.z = z;
      v.vz = 0;
      v.yaw = tu.yaw;
      v.v = tu.speed;
      v.vs = 0;
      v.w = 0;
      this.camYaw = tu.yaw;
    }
    const p = this.player;
    p.e = tu.e;
    p.n = tu.n;
    p.z = z;
    p.yaw = tu.yaw;
    this.tunnel = null;
    this.primePending = true;
    this.primeWait = 0;
  }

  /** Pushing at the edge of the data (a square with no file, not one still loading) says so. */
  private edge(): void {
    const p = this.player;
    let de: number;
    let dn: number;
    let reach = EDGE_LOOK;
    const v = this.yours;
    if (v) {
      const way = this.held("accelerate") ? 1 : this.held("brake") && v.v <= 0.5 ? -1 : 0;
      if (way === 0) return;
      de = Math.sin(v.yaw) * way;
      dn = Math.cos(v.yaw) * way;
      reach = sizeOf(v.kind).length / 2 + EDGE_LOOK;
    } else {
      const i = this.footInput();
      if (Math.hypot(i.forward, i.strafe) < 0.05) return;
      const sy = Math.sin(p.yaw);
      const cy = Math.cos(p.yaw);
      de = sy * i.forward + cy * i.strafe;
      dn = cy * i.forward - sy * i.strafe;
      const len = Math.hypot(de, dn);
      de /= len;
      dn /= len;
    }
    const e = p.e + de * reach;
    const n = p.n + dn * reach;
    if (this.world.inData(e, n) || cellExists(this.ix, Math.floor(e / CELL), Math.floor(n / CELL)))
      return;
    this.say("edge");
  }

  // ---------- everything else that moves ----------

  /** The horn, for as long as it is held at the wheel: people near run. */
  private horn(): void {
    const on = !!this.yours && !this.wasted && !this.tunnel && this.held("horn");
    if (on === this.hornOn) return;
    this.hornOn = on;
    this.sound.horn(on);
    if (on) {
      const f = this.focus();
      this.crowd.scare(f.e, f.n, HORN_SCARE);
    }
  }

  /** Loose cars, wrecks, what sinks and the boats left about; the moored boats bob. */
  private freeStep(h: number): void {
    this.free = this.free.filter(
      (v) => v.state !== "sunk" && (v === this.yours || this.near(v, LOOSE_KEEP)),
    );
    for (const v of this.free) {
      if (v === this.yours) continue;
      const ev = v.boat
        ? stepBoat(v, null, this.world, h, this.t, { calm: this.reduced })
        : stepCar(v, null, this.world, h);
      this.events(v, ev);
    }
    for (const v of this.kept)
      if (v.boat && v.state === "parked")
        stepBoat(v, null, this.world, h, this.t, { calm: this.reduced });
  }

  /** The ferries on their routes, there and back; a route whose boat was taken gets another, out of sight. */
  private ferriesStep(h: number): void {
    const me = this.focus();
    for (const f of this.ferries) {
      const pose = ferryPose(f, this.t);
      let b = f.boat;
      if (b && b.state !== "traffic") {
        f.boat = null;
        if (b !== this.yours && !this.free.includes(b)) this.free.push(b);
        b = null;
      }
      if (!b) {
        if (Math.hypot(pose.e - me.e, pose.n - me.n) < FERRY_BACK || this.visible(pose.e, pose.n))
          continue;
        b = f.boat = this.ferryBoat(f, pose);
      }
      b.e = pose.e;
      b.n = pose.n;
      b.yaw = pose.yaw;
      b.z = WATER_Z;
      b.v = 0;
      b.vs = 0;
      b.w = 0;
      // still, a boat only rides the swell
      if (this.near(b, FERRY_NEAR))
        stepBoat(b, null, this.world, h, this.t, { calm: this.reduced });
      b.v = pose.speed;
    }
  }

  private ferryBoat(f: Ferry, pose: { e: number; n: number; yaw: number }): Vehicle {
    return newVehicle(
      nextVehicleId(),
      "ferry",
      pose.e,
      pose.n,
      pose.yaw,
      "traffic",
      f.staten ? 1 : 0,
    );
  }

  private routes(life: LifeRoutes): Ferry[] {
    const out: Ferry[] = [];
    (life ?? []).forEach((route, i) => {
      const pts: number[] = [];
      const cum: number[] = [];
      for (let k = 0; k + 1 < route.path.length; k += 2) {
        const [e, n] = lonLatToEN(this.ix.geo, route.path[k], route.path[k + 1]);
        if (!Number.isFinite(e) || !Number.isFinite(n)) continue;
        const prev = pts.length;
        cum.push(prev ? cum[cum.length - 1] + Math.hypot(e - pts[prev - 2], n - pts[prev - 1]) : 0);
        pts.push(e, n);
      }
      const len = cum[cum.length - 1] ?? 0;
      if (!(len >= FERRY_MIN)) return;
      out.push({
        name: route.name,
        pts,
        cum,
        len,
        speed: FERRY_SPEED,
        phase: (i * 0.618034) % 1,
        staten: false,
        boat: null,
      });
    });
    // the Staten Island route's boat is the long orange one: by its name (St. George is its
    // terminal), else the longest route
    const staten =
      out.find((f) => /staten island|st\.? george/i.test(f.name)) ??
      out.reduce<Ferry | undefined>((a, b) => (!a || b.len > a.len ? b : a), undefined);
    if (staten) {
      staten.staten = true;
      staten.speed = STATEN_SPEED;
    }
    for (const f of out) f.boat = this.ferryBoat(f, ferryPose(f, 0));
    return out;
  }

  private trafficStep(h: number): void {
    const blockers: Blocker[] = [];
    const p = this.player;
    if (!this.yours && !this.waiting && !this.tunnel)
      blockers.push({ e: p.e, n: p.n, r: RADIUS, z: p.z });
    for (const q of this.crowd.people) blockers.push({ e: q.e, n: q.n, r: 0.3, z: q.z });
    this.traffic.blockers = blockers;
    this.traffic.visible = this.visible;
    this.traffic.step(h, this.t, this.focus(), this.carsAround());
  }

  // ---------- what hits what ----------

  /** A route's ferry is not pushed by anything: it is on its route. */
  private onRoute(v: Vehicle): boolean {
    return v.boat && v.state === "traffic";
  }

  /** What moves of itself: you, what slides loose, a ferry under way. */
  private mover(v: Vehicle): boolean {
    if (v === this.yours) return !this.tunnel;
    if (this.onRoute(v)) return v.v !== 0;
    return (v.state === "loose" || v.state === "wrecked") && moving(v);
  }

  /** Every pair of boxes near you that touch, one of them moving, pushed apart and hurt. */
  private collide(): void {
    const list = this.nearby.filter(
      (v) =>
        v.state !== "sunk" &&
        v.state !== "sinking" &&
        !(v === this.yours && this.tunnel) &&
        this.near(v, COLLIDE_REACH) &&
        !(v.state === "traffic" && !v.boat && this.traffic.squeezing(v)),
    );
    const grid = new Map<number, Vehicle[]>();
    const cellsOf = (v: Vehicle) => {
      const s = sizeOf(v.kind);
      const r = Math.hypot(s.length, s.width) / 2;
      const out: number[] = [];
      for (let x = Math.floor((v.e - r) / BUCKET); x <= Math.floor((v.e + r) / BUCKET); x++)
        for (let y = Math.floor((v.n - r) / BUCKET); y <= Math.floor((v.n + r) / BUCKET); y++)
          out.push((x + 32768) * 65536 + (y + 32768));
      return out;
    };
    for (const v of list)
      for (const k of cellsOf(v)) {
        const bucket = grid.get(k);
        if (bucket) bucket.push(v);
        else grid.set(k, [v]);
      }
    const done = new Set<string>();
    for (const a of list) {
      if (!this.mover(a)) continue;
      for (const k of cellsOf(a))
        for (const b of grid.get(k) ?? []) {
          if (b === a || a.boat !== b.boat) continue;
          if (this.onRoute(a) && this.onRoute(b)) continue;
          const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
          if (done.has(key)) continue;
          done.add(key);
          const [a0, a1] = span(a);
          const [b0, b1] = span(b);
          if (a0 >= b1 || b0 >= a1) continue;
          this.hit(a, b);
        }
    }
  }

  private hit(a: Vehicle, b: Vehicle): void {
    const ba = bodyOf(a);
    const bb = bodyOf(b);
    if (this.onRoute(a)) ba.mass = Infinity;
    if (this.onRoute(b)) bb.mass = Infinity;
    const touch = overlap(ba, bb);
    if (!touch) return;
    const va = { e: ba.ve, n: ba.vn };
    const vb = { e: bb.ve, n: bb.vn };
    const closing = resolve(ba, bb, touch);
    this.answer(a, ba, va);
    this.answer(b, bb, vb);
    if (closing > 0) {
      // each takes its share by the other's weight
      applyDamage(a, closing, bb.mass);
      applyDamage(b, closing, ba.mass);
    }
    if (closing > CRUNCH) this.crunch(a, touch.pe, touch.pn, Math.max(a.z, b.z), closing);
  }

  /** Puts a hit's outcome on a vehicle: traffic stops or goes loose, a parked car goes loose. */
  private answer(v: Vehicle, body: Body, was: { e: number; n: number }): void {
    if (this.onRoute(v)) return;
    if (v.state === "traffic") {
      const knock = Math.hypot(body.ve - was.e, body.vn - was.n);
      if (this.traffic.hit(v, knock)) {
        applyBody(v, body);
        if (!this.free.includes(v)) this.free.push(v);
      }
      return;
    }
    if (v.state === "parked") this.loosen(v);
    applyBody(v, body);
  }

  /** A hit worth hearing: the crunch, the sparks, people running, your camera shaken. */
  private crunch(v: Vehicle, e: number, n: number, z: number, speed: number): void {
    const last = this.crunched.get(v);
    if (last !== undefined && this.t - last < 0.15) return;
    this.crunched.set(v, this.t);
    const f = this.focus();
    const d = Math.hypot(e - f.e, n - f.n);
    if (d < CRASH_HEAR) this.sound.crash(Math.min(1, speed / CRASH_LOUD) * (1 - d / CRASH_HEAR));
    this.particles.sparks(e, n, z, speed);
    this.crowd.scare(e, n, CRASH_SCARE);
    if (v === this.yours && !this.reduced)
      this.shake = Math.max(this.shake, Math.min(1.2, speed / 12));
  }

  /** A stepper's own hits (a wall, a parapet, a quay, a landing): their damage is done already. */
  private events(v: Vehicle, ev: VehicleEvents): void {
    if (ev.impact > CRUNCH) {
      const hl = sizeOf(v.kind).length / 2;
      const way = v.v < 0 ? -1 : 1;
      this.crunch(
        v,
        v.e + Math.sin(v.yaw) * hl * way,
        v.n + Math.cos(v.yaw) * hl * way,
        v.z,
        ev.impact,
      );
    }
    if (ev.fell > CRUNCH) this.crunch(v, v.e, v.n, v.z, ev.fell);
  }

  /** What became of everything this step: traffic the game must keep, wrecks catching fire, what goes into the water. */
  private watch(): void {
    for (const v of this.traffic.cars)
      if (v.state !== "traffic" && v !== this.yours && !this.free.includes(v)) this.free.push(v);
    const all = this.yours ? [this.yours, ...this.free] : this.free;
    for (const v of all) {
      if (v.state === "wrecked" && !this.burnt.has(v)) {
        this.burnt.add(v);
        this.wreck(v);
      }
      if (v.state === "sinking" && !this.sinkingSeen.has(v)) {
        this.sinkingSeen.add(v);
        const s = sizeOf(v.kind);
        this.splash(v.e, v.n, Math.max(s.width, 2), 1);
        if (v === this.yours) this.say("sinking");
      }
    }
  }

  /** A car catching fire: the boom, the flames, people knocked over and running, you hurt if near. */
  private wreck(v: Vehicle): void {
    const s = sizeOf(v.kind);
    const f = this.focus();
    const d = Math.hypot(v.e - f.e, v.n - f.n);
    if (d < BOOM_HEAR) this.sound.boom(1 - d / BOOM_HEAR);
    this.particles.wreck(v.e, v.n, v.z, s.length);
    for (const q of this.crowd.people)
      if (
        q.state !== "down" &&
        q.state !== "swimming" &&
        Math.hypot(q.e - v.e, q.n - v.n) < WRECK_KNOCK
      )
        this.crowd.knock(q, { ve: (q.e - v.e) * 1.5, vn: (q.n - v.n) * 1.5 });
    this.crowd.scare(v.e, v.n, WRECK_SCARE);
    if (v === this.yours) {
      // inside your car when it is wrecked: the end of you
      this.hurtYou(LIFE_MAX);
      this.goDown();
      return;
    }
    const p = this.player;
    if (this.yours || this.wasted || this.waiting || this.tunnel || Math.abs(p.z - v.z) > 3) return;
    const near = Math.max(0, fromBox(v, p.e, p.n).d);
    if (near <= FIRE_REACH) this.hurtYou(fireDamage(near));
  }

  private splash(e: number, n: number, size: number, loud: number): void {
    const f = this.focus();
    const d = Math.hypot(e - f.e, n - f.n);
    if (d < CRASH_HEAR) this.sound.splash(loud * (1 - d / CRASH_HEAR));
    this.particles.splash(e, n, size);
  }

  /** Smoke from damaged engines, fire on wrecks, bubbles over what sinks, foam behind boats. */
  private effects(h: number): void {
    if (h > 0)
      for (const v of this.nearby) {
        if (v.state === "sunk" || !this.near(v, SMOKE_REACH) || (v === this.yours && this.tunnel))
          continue;
        const s = sizeOf(v.kind);
        const sy = Math.sin(v.yaw);
        const cy = Math.cos(v.yaw);
        if (v.state === "sinking") {
          if (Math.random() < h * 20) this.particles.bubbles(v.e, v.n, s.width);
          continue;
        }
        if (!v.boat && v.damage >= 0.55) {
          const fe = v.e + sy * (s.length / 2 - 0.9);
          const fn = v.n + cy * (s.length / 2 - 0.9);
          const z = v.z + s.height * 0.65;
          if (v.fire > 0)
            for (let k = 0; k < 3; k++)
              if (Math.random() < h * 30) this.particles.flame(fe, fn, z, s.width);
          const wrecked = v.state === "wrecked";
          if (Math.random() < (wrecked ? 10 : (v.damage - 0.5) * 14) * h)
            this.particles.smoke(fe, fn, z, wrecked);
        }
        if (v.boat && Math.abs(v.v) > 2 && Math.random() < h * Math.abs(v.v) * 1.5)
          this.particles.wake(v.e - sy * (s.length / 2), v.n - cy * (s.length / 2), v.yaw, s.width);
      }
    this.particles.step(h);
  }

  private timers(real: number): void {
    this.msgFor = Math.max(0, this.msgFor - real);
    if (this.msgFor === 0) this.msg = null;
    this.hurtFlash = Math.max(0, this.hurtFlash - real / HURT_FADE);
    this.jumpFor = Math.max(0, this.jumpFor - real);
    this.hitCool = Math.max(0, this.hitCool - real);
    this.lookIdle += real;
    this.shake *= Math.exp(-6 * real);
  }

  // ---------- the cameras, the drawing, the signs ----------

  private camera(real: number): void {
    const p = this.player;
    let eye: Eye;
    if (this.tunnel) {
      // in the dark: the camera waits at the far end, so its squares come in
      const tu = this.tunnel;
      eye = { e: tu.e, n: tu.n, z: EYE, yaw: tu.yaw, pitch: 0, fov: FOV };
    } else if (this.wasted && this.body) eye = this.reduced ? this.eye : this.wastedEye();
    else if (this.yours) eye = this.driverEye(real);
    else {
      let z = p.z + EYE;
      if (p.mode === "swim")
        z = WATER_Z + SWIM_EYE + (this.reduced ? 0 : Math.sin(this.t * 2.1) * 0.05);
      else if (p.mode === "down") z = p.z + 0.45;
      else if (!this.reduced && p.airFrom === null) z += Math.sin(p.bob) * 0.05;
      eye = { e: p.e, n: p.n, z, yaw: p.yaw, pitch: p.pitch, fov: FOV };
    }
    this.eye = eye;
    this.view.setCamera(eye.e, eye.n, eye.z, eye.yaw, eye.pitch, eye.fov);
  }

  /** The camera lifting away from you lying in the street, a slow turn as it rises. */
  private wastedEye(): Eye {
    const b = this.body!;
    const k = smooth(wastedAt(this.wastedT, false).lift);
    const back = 2.5 + 6 * k;
    const yaw = b.yaw + 0.6 * k;
    const e = b.e - Math.sin(yaw) * back;
    const n = b.n - Math.cos(yaw) * back;
    const z = b.z + 1.6 + 12 * k;
    const lifted: Eye = {
      e,
      n,
      z,
      yaw: Math.atan2(b.e - e, b.n - n),
      pitch: -Math.atan2(z - (b.z + 0.3), back),
      fov: FOV,
    };
    // from where you saw last, over the first half second
    const from = this.downEye;
    const m = from ? smooth(Math.min(1, this.wastedT / 0.5)) : 1;
    if (!from || m >= 1) return lifted;
    return {
      e: from.e + (lifted.e - from.e) * m,
      n: from.n + (lifted.n - from.n) * m,
      z: from.z + (lifted.z - from.z) * m,
      yaw: from.yaw + wrap(lifted.yaw - from.yaw) * m,
      pitch: from.pitch + (lifted.pitch - from.pitch) * m,
      fov: from.fov + (lifted.fov - from.fov) * m,
    };
  }

  /** The chase camera behind what you drive, or your eyes at its wheel. */
  private driverEye(real: number): Eye {
    const v = this.yours!;
    const s = sizeOf(v.kind);
    if (this.lookIdle > LOOK_RETURN) {
      this.lookYaw *= Math.exp(-3 * real);
      this.lookPitch += (LOOK_PITCH - this.lookPitch) * Math.min(1, 3 * real);
    }
    this.camYaw += wrap(v.yaw - this.camYaw) * Math.min(1, real * FOLLOW);
    const speed = Math.abs(v.v);
    const fov = this.reduced ? FOV : FOV + clamp((speed - 12) * 0.45, 0, 18);
    this.fov += (fov - this.fov) * Math.min(1, real * 3);
    const behind = this.held("lookBehind") ? Math.PI : 0;
    const jig = () =>
      this.shake > 0.01 && !this.reduced ? (Math.random() - 0.5) * this.shake * 0.6 : 0;
    if (this.cam === "wheel") {
      const [eh, ef] = EYES[v.kind];
      const side = v.boat ? 0 : -0.36;
      const sy = Math.sin(v.yaw);
      const cy = Math.cos(v.yaw);
      return {
        e: v.e + sy * ef + cy * side + jig(),
        n: v.n + cy * ef - sy * side,
        z: v.z + v.heave + eh + jig() * 0.5,
        yaw: v.yaw + this.lookYaw + behind,
        pitch: this.lookPitch + 0.1,
        fov: this.fov,
      };
    }
    const yaw = this.camYaw + this.lookYaw + behind;
    const dist = 4.5 + s.length * 0.8 + clamp(speed * 0.05, 0, 2);
    const back = Math.cos(this.lookPitch) * dist;
    let ce = v.e - Math.sin(yaw) * back;
    let cn = v.n - Math.cos(yaw) * back;
    const cz = v.z + Math.max(0.8, 1.2 + s.height * 0.7 - Math.sin(this.lookPitch) * dist * 0.6);
    // a wall in the way brings it closer
    for (let k = 0.15; k <= 1.0001; k += 0.15) {
      const pe = v.e + (ce - v.e) * k;
      const pn = v.n + (cn - v.n) * k;
      if (!this.world.blocked(pe, pn, 0.3, cz - 0.4, 0.8)) continue;
      const f = Math.max(0.1, k - 0.2);
      ce = v.e + (ce - v.e) * f;
      cn = v.n + (cn - v.n) * f;
      break;
    }
    const te = v.e + Math.sin(yaw) * 4;
    const tn = v.n + Math.cos(yaw) * 4;
    const tz = v.z + 1 + s.height * 0.45;
    return {
      e: ce + jig(),
      n: cn,
      z: cz + jig(),
      yaw: Math.atan2(te - ce, tn - cn),
      pitch: Math.atan2(tz - cz, Math.hypot(te - ce, tn - cn)),
      fov: this.fov,
    };
  }

  /** Whether a vehicle's tail lamps are lit: braking at your wheel, slowing or stopped in traffic. */
  private braking(v: Vehicle): boolean {
    if (v === this.yours)
      return !v.boat && ((this.held("brake") && v.v > 0.3) || this.held("handbrake"));
    if (v.state !== "traffic" || v.boat) return false;
    const last = this.lastSpeed.get(v);
    this.lastSpeed.set(v, v.v);
    return v.v < 0.5 || (last !== undefined && v.v < last - 0.01);
  }

  private draw(): void {
    const m = this.models;
    const far = FOG_FAR + 30;
    m.begin();
    for (const v of this.nearby) {
      if ((v === this.yours && this.tunnel) || !this.near(v, far)) continue;
      m.vehicle(v, this.braking(v));
    }
    for (const v of this.free)
      if (v !== this.yours && !this.near(v, NEAR) && this.near(v, far)) m.vehicle(v);
    for (const f of this.ferries)
      if (
        f.boat &&
        f.boat !== this.yours &&
        !this.near(f.boat, FERRY_NEAR) &&
        this.near(f.boat, far)
      )
        m.vehicle(f.boat);
    for (const q of this.crowd.people) m.person(q);
    const b = this.body;
    if (this.wasted && b) m.you(b.e, b.n, b.z, b.yaw, true);
    m.end(this.t);
  }

  private snapshot(): WalkState {
    const p = this.player;
    const v = this.yours;
    const near = !v && !this.wasted && !this.waiting && !this.tunnel ? this.nearest() : null;
    return {
      mode: this.wasted ? "down" : v ? (v.boat ? "boat" : "drive") : p.mode,
      life: p.life,
      vehicle: v
        ? {
            kind: v.kind,
            speed: Math.abs(v.v),
            damage: v.damage,
            wrecked: v.state === "wrecked",
            boat: v.boat,
          }
        : null,
      near: near ? { kind: near.kind } : null,
      message: this.msg,
      hurt: this.hurtFlash,
      wasted: this.wasted ? wastedAt(this.wastedT, this.reduced) : null,
      camera: this.cam,
      dark: this.tunnel ? 1 : 0,
    };
  }

  /** Tells the listeners when what the signs show has changed. */
  private emit(): void {
    const s = this.snapshot();
    const w = s.wasted;
    const sig = [
      s.mode,
      s.life,
      s.vehicle
        ? `${s.vehicle.kind}:${s.vehicle.speed.toFixed(1)}:${s.vehicle.damage.toFixed(3)}:${s.vehicle.wrecked}`
        : "",
      s.near?.kind ?? "",
      s.message ?? "",
      s.hurt.toFixed(2),
      w
        ? `${w.word.toFixed(2)}:${w.grey.toFixed(2)}:${w.lift.toFixed(2)}:${w.timeRate}:${w.skippable}`
        : "",
      s.camera,
      s.dark,
    ].join("|");
    this.current = s;
    if (sig === this.signature) return;
    this.signature = sig;
    for (const fn of this.listeners) fn(s);
  }
}
