import type * as THREE from "three";
import type { Strings } from "@/i18n/types";
import { Cameras, MOUSE } from "./cameras";
import type { WalkCell } from "./cell";
import { actionsOf, type ActionId, type Bindings } from "./controls";
import { CRUNCH, bumped, collide, fromBox, halfDiagonal, moving } from "./crashes";
import { EXIT_SPEED, swimOut, toTake, wayOut, type Spot } from "./doors";
import { Ferries, onRoute, type LifeRoutes } from "./ferries";
import { Fleet, within } from "./fleet";
import { CELL } from "./geo";
import { LIFE_MAX, blastDamage, hitDamage, motorcycleCrashDamage, regen } from "./health";
import type { BoatKind, CarKind } from "./kinds";
import { clamp, wrap } from "./math";
import { Crowd } from "./people";
import {
  HEIGHT,
  RADIUS,
  STEP_UP,
  newPlayer,
  stepFoot,
  type FootInput,
  type Player,
} from "./player";
import { CONTACT_SECONDS, punchTarget, SWING_SECONDS } from "./punch";
import { FOG_FAR } from "./render/materials";
import type { StreetLighting } from "./render/city-light";
import { WalkModels } from "./render/models";
import { makePalette, type Palette } from "./render/palette";
import { WalkParticles } from "./render/particles";
import { lampLit, signalPosts, type SignalPost } from "./signals";
import type { WalkSound } from "./sound";
import { comeTo } from "./spawn";
import { RoadNet, Traffic, starterCar, type Blocker, type KerbSpot } from "./traffic";
import { portalCrossed } from "./tunnels";
import {
  applyBlastDamage,
  sizeFor,
  stepBoat,
  stepCar,
  type DriveInput,
  type Vehicle,
  type VehicleEvents,
} from "./vehicles";
import { cellExists, type WalkIndex } from "./walk-index";
import { WASTED, wastedAt } from "./wasted";
import { WATER_Z, type WalkWorld } from "./world";

export type { LifeRoutes } from "./ferries";

/**
 * The walk as a game: the loop and everything it ties together. You on foot (walking, jumping,
 * swimming), the car or boat you drive, the loose cars and wrecks, the traffic, the people, the
 * boats at their moorings and the ferries on their routes (`fleet.ts`, `ferries.ts`); what hits
 * what and what that costs (`crashes.ts`), the wrecks' fires, the sinking, your life and the
 * wasted sequence; getting in and out (`doors.ts`); tunnels (`tunnels.ts`); the cameras
 * (`cameras.ts`); the models, particles, signals and sounds. No React and no DOM beyond the
 * animation frame: the screen hands it keys, pointer moves and touches, and draws its signs from
 * `WalkState`.
 */

/** What the game needs of the view: its world, its scene, its camera and its colours (`WalkView` is one). */
export interface GameView {
  readonly world: WalkWorld;
  readonly scene: THREE.Scene;
  readonly lighting: StreetLighting;
  setCamera(e: number, n: number, z: number, yaw: number, pitch: number, fov: number): void;
  /** Drains the colours to the palette's greys, 0 to 1. */
  setGrey(amount: number): void;
  update(dt: number): void;
  render(): void;
}

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
    /** Whole seconds left, rounded up so a live fuse never shows zero. */
    explodesIn: number | null;
    boat: boolean;
  } | null;
  /** what you could get into from here */
  near: { kind: CarKind | BoatKind } | null;
  message: WalkMessage | null;
  /** 0 to 1: the flash of being hurt, fading */
  hurt: number;
  /** The current fist swing, and its result once the fist reaches its target. */
  punch: { sequence: number; hit: boolean | null } | null;
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
  /** the game's from then on: `dispose` lets it go */
  sound: WalkSound;
  units: "imperial" | "metric";
  /** New York's first walk: a red supercar waits by the start */
  starter?: boolean;
  statenIslandFerry?: boolean;
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
/** Faster than this, m/s, a move was a jump (a tunnel's far end), not a speed. */
const JUMPED = 120;
// you, hit
/** A hit you survive knocks you down this long, s, and throws you this share of its speed. */
const KNOCKED = 1.5;
const THROWN = 0.6;
const KNOCK_FRICTION = 6;
/** After a hit, a touch only pushes for this long: one hit hurts once. */
const HIT_COOL = 0.8;
// what is heard and who runs
const CRASH_LOUD = 25;
const CRASH_HEAR = 80;
const BOOM_HEAR = 150;
const CRASH_SCARE = 20;
const HORN_SCARE = 12;
const WRECK_SCARE = 40;
const BLAST_HEIGHT = 3;
// the signs
const MESSAGE_FOR = 2.5;
const HURT_FADE = 0.6;
const JUMP_BUFFER = 0.2;
// what is kept round you
const NEAR = 300;
const GATHER_EVERY = 0.25;
const PARK_EVERY = 1;
const LOOSE_KEEP = 700;
const COLLIDE_REACH = 250;
/** Within this of you, loose vehicles move (and hit) in steps of at most CLOSE_STEP, with yours. */
const CLOSE = 30;
const CLOSE_STEP = 0.02;
/** How far a vehicle may move in a frame (and some): what it may hit is looked for this much farther. */
const CLOSE_MARGIN = 10;
const ROOF_REACH = 15;
/**
 * A car's roof holds you up (and its side stops you) this far beyond its body: a little more than
 * your radius, so walking up to a car never puts you inside the reach where it pushes you.
 */
const ROOF_GROW = RADIUS + 0.02;
const SMOKE_REACH = 150;
const FERRY_NEAR = 800;
/** A route's boat taken away comes back no nearer to you than this, out of sight. */
const FERRY_BACK = 400;
/** Signals are drawn within the fog. */
const SIGNAL_REACH = FOG_FAR + 30;
// the start and teleports
const SETTLE_REACH = 2;
const PRIME_GIVE_UP = 6;
const STARTER_GIVE_UP = 10;
/** Seconds after which the starter is given up whatever the squares do (one round the start that
 * keeps failing, or out of reach): parking waits on it, and must not wait for good. */
const STARTER_AT_MOST = 15;
const STARTER_EVERY = 0.5;
/** Out of a tunnel, the far end's square is waited for this long at most, s. */
const TUNNEL_WAIT = 10;
/** Where the edge of the data is looked for, ahead of you, m. */
const EDGE_LOOK = 1.5;

const TOTAL = WASTED.wordAt + WASTED.holdFor + WASTED.fadeFor;

export class WalkGame {
  readonly units: "imperial" | "metric";
  private readonly view: GameView;
  /** the squares round you, as the view streams them (the minimap draws their streets) */
  readonly world: WalkWorld;
  private readonly ix: WalkIndex;
  private readonly sound: WalkSound;
  private readonly reduced: boolean;
  private readonly random: () => number;
  private bindings: Bindings;
  private readonly palette: Palette;
  private readonly models: WalkModels;
  private readonly particles: WalkParticles;
  private readonly cams: Cameras;
  private readonly net = new RoadNet();
  private readonly traffic: Traffic;
  private readonly crowd: Crowd;
  private readonly fleet: Fleet;
  private readonly ferries: Ferries;
  private readonly player: Player;
  private readonly startAt: { e: number; n: number };

  /** what you drive */
  private yours: Vehicle | null = null;
  private known = new Map<string, WalkCell>();
  /** the signals of each square's crossings */
  private posts = new Map<string, SignalPost[]>();

  // gathered
  private nearby: Vehicle[] = [];
  private roofCars: Vehicle[] = [];
  private gatherIn = 0;
  private parkIn = 0;
  /** what moves in short steps this frame (worked out as it begins), and how far they reach from you */
  private closeSet = new Set<Vehicle>();
  private closeReach = 0;

  // input
  private keys = new Set<string>();
  private pressed = new Set<ActionId>();
  private stickX = 0;
  private stickY = 0;
  private jumpFor = 0;
  private wantEnter = false;
  private wantExit = false;
  private hornOn = false;

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
  private starterAge = 0;
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
  private punch: WalkState["punch"] = null;
  private punchSequence = 0;
  private punchedAt = -Infinity;

  // what has been seen to happen
  private t = 0;
  private ignited = new WeakSet<Vehicle>();
  private exploded = new WeakSet<Vehicle>();
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
    this.models = new WalkModels(opts.view.scene, this.palette, opts.ix, opts.view.lighting);
    this.particles = new WalkParticles(opts.view.scene, this.palette, opts.view.lighting);
    this.traffic = new Traffic(this.net, this.world, opts.ix.tunnels, this.random);
    this.crowd = new Crowd(this.world, this.random);
    this.fleet = new Fleet(this.world);
    this.ferries = new Ferries(opts.life, opts.ix.geo, opts.statenIslandFerry);
    const s = opts.start;
    this.player = newPlayer(s.e, s.n, s.z ?? 0, s.yaw);
    this.placeZ = s.z === undefined;
    this.startAt = { e: s.e, n: s.n };
    this.starterPending = opts.starter === true;
    this.cams = new Cameras({ e: s.e, n: s.n, z: s.z ?? 0, yaw: s.yaw }, opts.reduced);
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
    if (this.yours) return this.cams.look(dx, dy);
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
    // the starter waits by the start: put elsewhere, its squares may never come in (out of
    // reach), and parking waits on it
    this.starterPending = false;
    this.primePending = true;
    this.primeWait = 0;
    this.vel = { e: 0, n: 0 };
    this.downFor = 0;
  }

  /** Where you are (in what you drive, where it is), how high your feet (or its wheels) are, and which way you face. */
  position(): { e: number; n: number; z: number; yaw: number } {
    const v = this.yours;
    return v
      ? { e: v.e, n: v.n, z: v.z, yaw: wrap(v.yaw) }
      : { e: this.player.e, n: this.player.n, z: this.player.z, yaw: wrap(this.player.yaw) };
  }

  /** How many people and cars the streets keep round you (the screen lowers them on a slow machine). */
  setCrowd(people: number, cars: number): void {
    this.crowd.budget = people;
    this.traffic.budget = cars;
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
    // the sound is the game's from the start: its audio context goes with it (browsers allow a
    // page only a few, and a live one keeps a phone's audio awake)
    this.sound.dispose();
    this.view.setGrey(0);
    this.models.dispose();
    this.particles.dispose();
    this.palette.texture.dispose();
    this.listeners.clear();
  }

  /**
   * Runs the game `seconds` ahead in frames of `frame` seconds (1/30 unless said; a slow machine's
   * are longer, up to 0.1), drawing nothing: for checks and the console.
   */
  sim(seconds: number, frame = SIM_STEP): void {
    let left = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const each = Number.isFinite(frame) && frame > 0 ? frame : SIM_STEP;
    while (left > 1e-9) {
      const dt = Math.min(each, left);
      this.step(dt);
      left -= dt;
    }
  }

  /** Every vehicle the game knows: yours, the free ones, parked, moored, the ferries and the traffic. */
  vehicles(): Vehicle[] {
    const out = new Set<Vehicle>();
    if (this.yours) out.add(this.yours);
    for (const v of this.fleet.free) out.add(v);
    for (const v of this.fleet.standing()) out.add(v);
    for (const v of this.ferries.boats()) out.add(v);
    for (const v of this.traffic.cars) out.add(v);
    return [...out];
  }

  /** Puts a vehicle in the world, kept by the game: for checks and the console. */
  add(v: Vehicle): void {
    if (v.state === "driven" || v.state === "traffic") v.state = "loose";
    this.fleet.keep(v);
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
    if ((this.parkIn -= real) <= 0 && !this.starterPending) {
      // nothing parks until the starter's spot is known
      this.parkIn = PARK_EVERY;
      this.fleet.park(this.focus(), this.starterSpot);
      this.gatherIn = 0;
    }
    if ((this.gatherIn -= real) <= 0) {
      this.gatherIn = GATHER_EVERY;
      this.fleet.gather(this.focus());
    }
    this.gather();
    const p = this.player;
    this.before = { e: p.e, n: p.n };
    const playing = !this.tunnel && !this.wasted && !this.waiting;
    if (this.tunnel) this.tunnelStep(real);
    else if (playing) {
      this.wants();
      if (!this.yours) this.footStep(h);
    }
    this.stepPunch();
    this.closeSteps(h, playing);
    if (playing) {
      this.portals(h);
      this.edge();
    }
    this.wantEnter = false;
    this.wantExit = false;
    this.horn();
    this.freeStep(h);
    const me = this.focus();
    for (const b of this.ferries.step(
      this.t,
      h,
      this.world,
      this.reduced,
      (v) => within(v, me, FERRY_NEAR),
      (e, n) => Math.hypot(e - me.e, n - me.n) >= FERRY_BACK && !this.cams.visible(e, n),
    ))
      if (b !== this.yours) this.fleet.keep(b);
    // the streets fill all at once when the squares round you are in, not piecemeal before
    if (this.primed) {
      this.trafficStep(h);
      const crowd = this.crowd.step(
        h,
        this.t,
        me,
        this.nearby.filter((v) => !v.boat),
        this.cams.visible,
      );
      // someone knocked into the water: a ring where they went in, as for you
      for (const s of crowd.splashes) this.splash(s.e, s.n, 1.2, 0.5);
    }
    this.gather();
    // the rest: what moved once this frame, against anything it may reach
    this.collisions(COLLIDE_REACH, (v) => !this.isClose(v));
    this.follow();
    this.youAndVehicles();
    if (h > 0 && !this.wasted && !this.tunnel) {
      const ve = (p.e - this.before.e) / h;
      const vn = (p.n - this.before.n) / h;
      // a jump (a tunnel's far end) is no speed
      this.vel = Math.hypot(ve, vn) < JUMPED ? { e: ve, n: vn } : { e: 0, n: 0 };
    }
    this.watch();
    for (const v of this.nearby)
      if (within(v, this.focus(), SMOKE_REACH) && !(v === this.yours && this.tunnel))
        this.particles.from(v, h);
    this.particles.step(h);
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

  private held(a: ActionId): boolean {
    if (this.pressed.has(a)) return true;
    const [k0, k1] = this.bindings[a];
    return (k0 !== null && this.keys.has(k0)) || (k1 !== null && this.keys.has(k1));
  }

  private trigger(a: ActionId): void {
    if (a === "jump") this.jumpFor = JUMP_BUFFER;
    else if (a === "enter") this.wantEnter = true;
    else if (a === "exit") this.wantExit = true;
    else if (a === "camera") this.cams.toggle();
    else if (a === "punch") this.startPunch();
  }

  private canPunch(): boolean {
    return (
      this.player.mode === "foot" && !this.yours && !this.tunnel && !this.waiting && !this.wasted
    );
  }

  private startPunch(): void {
    if (!this.canPunch() || this.t - this.punchedAt < SWING_SECONDS) return;
    this.punchedAt = this.t;
    this.punch = { sequence: ++this.punchSequence, hit: null };
    this.sound.swing();
  }

  private stepPunch(): void {
    if (!this.punch) return;
    const elapsed = this.t - this.punchedAt;
    if (!this.canPunch() || elapsed >= SWING_SECONDS) {
      this.punch = null;
      return;
    }
    if (elapsed < CONTACT_SECONDS || this.punch.hit !== null) return;
    const eye = this.cams.onFoot(this.player, this.t);
    const target = punchTarget(eye, this.crowd.people, this.world);
    if (target) {
      this.crowd.knock(target, { ve: Math.sin(eye.yaw) * 2.6, vn: Math.cos(eye.yaw) * 2.6 });
      this.sound.punch();
    }
    this.punch = { sequence: this.punch.sequence, hit: target !== null };
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

  /** The roof of a car under a point, for you on foot. */
  private readonly roofs = (e: number, n: number): number | null => {
    let best: number | null = null;
    for (const v of this.roofCars) {
      if (fromBox(v, e, n, ROOF_GROW).d > 0) continue;
      const top = v.z + sizeFor(v).height * (v.state === "wrecked" ? 0.85 : 1);
      if (best === null || top > best) best = top;
    }
    return best;
  };

  // ---------- the squares, and what comes with them ----------

  /** The road net, the moorings and the signals follow the squares the view has in. */
  private syncSquares(): void {
    for (const c of this.world.cells()) {
      if (this.known.get(c.key) === c) continue;
      this.known.set(c.key, c);
      this.net.add(c);
      this.fleet.moor(c);
      this.posts.set(c.key, this.signalsOf(c));
    }
    for (const [key, c] of this.known)
      if (!this.world.has(c.i, c.j)) {
        this.known.delete(key);
        this.net.remove(key);
        this.fleet.unmoor(key);
        this.posts.delete(key);
      }
    this.fleet.tie((i, j) => this.world.has(i, j) || !cellExists(this.ix, i, j));
  }

  /** The signals of the crossings whose node is in this square (its streets are all here too). */
  private signalsOf(c: WalkCell): SignalPost[] {
    const out: SignalPost[] = [];
    for (const node of c.nodes) {
      if (!node.lights) continue;
      if (Math.floor(node.e / CELL) !== c.i || Math.floor(node.n / CELL) !== c.j) continue;
      out.push(...signalPosts(node, c.streets, (edge) => this.net.junction(node.id, edge)));
    }
    return out;
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
    if (this.starterPending && (this.starterAge += real) > STARTER_AT_MOST)
      this.starterPending = false;
    if (this.starterPending && this.settled(this.startAt, SETTLE_REACH)) {
      // every kerb spot round the start is looked at: not every frame
      this.starterWait += real;
      if ((this.starterIn -= real) > 0) return;
      this.starterIn = STARTER_EVERY;
      const got = starterCar(this.world, this.startAt);
      if (got) {
        this.starterSpot = got.spot;
        this.fleet.keep(got.car);
        this.starterPending = false;
        this.parkIn = 0;
      } else if (this.starterWait > STARTER_GIVE_UP) this.starterPending = false;
    }
  }

  /** Every vehicle near you, once each. */
  private gather(): void {
    const out: Vehicle[] = [];
    const yours = this.yours;
    const me = this.focus();
    if (yours) out.push(yours);
    for (const v of this.fleet.free) if (v !== yours && within(v, me, NEAR)) out.push(v);
    for (const v of this.fleet.kept) if (v.state === "parked") out.push(v);
    for (const v of this.traffic.cars) if (v !== yours) out.push(v);
    for (const v of this.ferries.boats()) if (v !== yours && within(v, me, FERRY_NEAR)) out.push(v);
    this.nearby = out;
    this.roofCars = out.filter(
      (v) =>
        !v.boat &&
        v !== yours &&
        v.state !== "sinking" &&
        v.state !== "sunk" &&
        within(v, me, ROOF_REACH),
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
        const under = this.world.surfaceUnder(e, n, p.z, STEP_UP, p.on);
        if (under.kind !== "water" && Math.abs(under.z - p.z) <= STEP_UP) {
          p.e = e;
          p.n = n;
          p.z = under.z;
          p.on = under.way;
        }
      }
      if (this.downFor <= 0) {
        p.mode = "foot";
        this.knock = { e: 0, n: 0 };
      }
      return;
    }
    const input = this.footInput();
    // a car's roof is for you on foot alone: the vehicles step without it
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
    const bike = v.kind === "motorcycle";
    const before = bike ? this.vehicleMotion(v) : null;
    const ev = v.boat
      ? stepBoat(v, this.driveInput(), this.world, h, this.t, { calm: this.reduced })
      : stepCar(v, this.driveInput(), this.world, h);
    this.events(v, ev);
    this.follow();
    if (before && this.crashRider(v, Math.max(ev.impact, ev.fell), before)) return;
    if (v.state === "sunk" || (v.state === "sinking" && v.sink >= 1)) {
      // it has floated its moment: out you come, swimming
      const spot = swimOut(v, this.world);
      this.leaveVehicle(v);
      this.stand(spot, v.yaw);
    }
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
      const v = toTake(this.player, this.nearby);
      if (v) this.enter(v);
    }
  }

  private enter(v: Vehicle): void {
    this.fleet.detach(v);
    this.ferries.release(v);
    v.state = "driven";
    v.stopFor = 0;
    this.yours = v;
    const p = this.player;
    p.mode = "drive";
    p.vz = 0;
    p.airFrom = null;
    this.cams.takeWheel(v);
    this.jumpFor = 0;
    this.follow();
  }

  private tryExit(): void {
    const v = this.yours!;
    const emergency = v.fuse !== null;
    if (!emergency && Math.hypot(v.v, v.vs) >= EXIT_SPEED) return this.say("slowDown");
    const spot = wayOut(v, this.world, this.nearby, emergency);
    if (spot === "slower") return this.say("slowDown");
    if (!spot) return this.say("noRoom");
    this.leaveVehicle(v);
    this.stand(spot, v.yaw);
  }

  /** What you drove is left where it is, the game's to keep. */
  private leaveVehicle(v: Vehicle): void {
    this.yours = null;
    if (v.state === "driven") v.state = "loose";
    this.fleet.keep(v);
    this.cams.leaveWheel();
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

  private vehicleMotion(v: Vehicle): { e: number; n: number } {
    const sin = Math.sin(v.yaw);
    const cos = Math.cos(v.yaw);
    return { e: v.v * sin + v.vs * cos, n: v.v * cos - v.vs * sin };
  }

  /** Detach an exposed rider once, place them beside the bike, then reuse the downed slide. */
  private crashRider(v: Vehicle, impact: number, before: { e: number; n: number }): boolean {
    if (v !== this.yours || v.kind !== "motorcycle") return false;
    const damage = motorcycleCrashDamage(impact);
    if (!(damage > 0)) return false;

    const exit = wayOut(v, this.world, this.nearby, true);
    const spot = exit && exit !== "slower" ? exit : { e: v.e, n: v.n, z: v.z, swim: false };
    this.leaveVehicle(v);
    this.stand(spot, v.yaw);
    this.player.on = v.on;
    this.hitCool = HIT_COOL;
    this.hurtYou(damage);
    this.say("thrownOff");
    if (!spot.swim) {
      const motion = Math.hypot(before.e, before.n) > 1 ? before : this.vehicleMotion(v);
      const scale = Math.min(1, impact / Math.max(1, Math.hypot(motion.e, motion.n))) * THROWN;
      this.player.mode = "down";
      this.downFor = KNOCKED;
      this.knock = { e: motion.e * scale, n: motion.n * scale };
    }
    return true;
  }

  /** Bumped by a car or a boat: pushed out of it, and hurt by how fast it closed on you. */
  private youAndVehicles(): void {
    if (this.yours || this.waiting || this.tunnel) return;
    const p = this.player;
    const hit = bumped(p, this.nearby, this.world, this.vel);
    if (!hit || this.wasted || this.hitCool > 0) return;
    const hurt = hitDamage(hit.closing);
    if (!(hurt > 0)) return;
    this.hitCool = HIT_COOL;
    this.hurtYou(hurt);
    if (p.life > 0 && p.mode === "foot") {
      // a hit you survive knocks you over for a moment
      p.mode = "down";
      p.vz = 0;
      p.airFrom = null;
      this.downFor = KNOCKED;
      this.knock = { e: hit.ne * hit.closing * THROWN, n: hit.nn * hit.closing * THROWN };
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
      // you lie beside what you drove, which stays where it is
      const spot = wayOut(v, this.world, this.nearby, true);
      this.leaveVehicle(v);
      this.stand(spot && spot !== "slower" ? spot : { e: v.e, n: v.n, z: v.z, swim: false }, v.yaw);
    }
    this.wasted = true;
    this.wastedT = 0;
    this.cams.down();
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
    this.vel = { e: 0, n: 0 };
    this.hitCool = 0;
    this.hurtFlash = 0;
  }

  // ---------- tunnels and the edge ----------

  /** Into a tunnel's portal: the dark, then the other portal; a closed one stops you at its barrier. */
  private portals(h: number): void {
    const p = this.player;
    if (this.yours?.boat || (p.mode !== "foot" && p.mode !== "drive") || Math.abs(p.z) > 3) return;
    const crossed = portalCrossed(
      this.ix.tunnels,
      p.e,
      p.n,
      p.e - this.before.e,
      p.n - this.before.n,
      h,
    );
    if (!crossed) return;
    if (crossed.closed) {
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
    this.tunnel = {
      left: crossed.seconds,
      wait: TUNNEL_WAIT,
      e: crossed.e,
      n: crossed.n,
      yaw: crossed.yaw,
      speed: crossed.speed,
    };
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
      this.cams.turnTo(tu.yaw);
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
      reach = sizeFor(v).length / 2 + EDGE_LOOK;
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

  /** Whether a vehicle moves in short steps this frame: what you drive, and what was loose within 30 m as it began. */
  private isClose(v: Vehicle): boolean {
    return this.closeSet.has(v);
  }

  /**
   * What you drive, and the loose vehicles near you, moved in steps of 0.02 s at most, each step
   * answering the hits it brings (against everything their hulls may reach, a long ferry's far
   * end too): so nothing fast passes through anything near you. Which they are is settled as the
   * frame begins, so none is stepped twice or not at all.
   */
  private closeSteps(h: number, playing: boolean): void {
    const me = this.focus();
    this.closeSet = new Set();
    this.closeReach = 0;
    const yours = playing ? this.yours : null;
    for (const v of yours ? [yours, ...this.fleet.free] : this.fleet.free)
      if (v === yours || (v !== this.yours && within(v, me, CLOSE))) {
        this.closeSet.add(v);
        const from = Math.max(Math.abs(v.e - me.e), Math.abs(v.n - me.n));
        this.closeReach = Math.max(this.closeReach, from + halfDiagonal(v));
      }
    const subs = Math.max(1, Math.ceil(h / CLOSE_STEP - 1e-9));
    const hs = h / subs;
    for (let k = 0; k < subs; k++) {
      // what you drive (once you are out of it, as it sinks, it goes on with nobody at the wheel)
      if (yours) {
        if (this.yours === yours) this.driveStep(hs);
        else this.stepFree(yours, hs);
      }
      for (const v of this.closeSet) if (v !== yours) this.stepFree(v, hs);
      this.collisions(this.closeReach + CLOSE_MARGIN, (v) => this.isClose(v));
    }
  }

  /** A free vehicle with nobody at the wheel: rolling, sliding, sinking, burning. */
  private stepFree(v: Vehicle, h: number): void {
    const ev = v.boat
      ? stepBoat(v, null, this.world, h, this.t, { calm: this.reduced })
      : stepCar(v, null, this.world, h);
    this.events(v, ev);
  }

  /** The loose cars, wrecks, what sinks and the boats left about farther away; the moored boats bob. */
  private freeStep(h: number): void {
    const me = this.focus();
    const f = this.fleet;
    f.free = f.free.filter(
      (v) => v.state !== "sunk" && (v === this.yours || within(v, me, LOOSE_KEEP)),
    );
    for (const v of f.free) if (v !== this.yours && !this.isClose(v)) this.stepFree(v, h);
    for (const v of f.kept)
      if (v.boat && v.state === "parked")
        stepBoat(v, null, this.world, h, this.t, { calm: this.reduced });
  }

  private trafficStep(h: number): void {
    const blockers: Blocker[] = [];
    const p = this.player;
    if (!this.yours && !this.waiting && !this.tunnel)
      blockers.push({ e: p.e, n: p.n, r: RADIUS, z: p.z });
    for (const q of this.crowd.people) blockers.push({ e: q.e, n: q.n, r: 0.3, z: q.z });
    this.traffic.blockers = blockers;
    this.traffic.visible = this.cams.visible;
    this.traffic.step(h, this.t, this.focus(), this.carsAround());
  }

  // ---------- what hits what, and what comes of it ----------

  /**
   * Every pair of vehicles that touch, one of them moving and `which` (those stepped together),
   * among those whose hulls come within `reach` of you: see `crashes.ts`.
   */
  private collisions(reach: number, which: (v: Vehicle) => boolean): void {
    const me = this.focus();
    const list = this.nearby.filter(
      (v) =>
        v.state !== "sunk" &&
        v.state !== "sinking" &&
        !(v === this.yours && this.tunnel) &&
        within(v, me, reach + halfDiagonal(v)) &&
        !(v.state === "traffic" && !v.boat && this.traffic.squeezing(v)),
    );
    collide(list, {
      traffic: this.traffic,
      // what moves of itself: you, what slides loose, a ferry under way
      mover: (v) =>
        which(v) &&
        (v === this.yours
          ? !this.tunnel
          : onRoute(v)
            ? v.v !== 0
            : (v.state === "loose" || v.state === "wrecked") && moving(v)),
      loosen: (v) => this.fleet.loosen(v),
      keep: (v) => this.fleet.keep(v),
      crunch: (v, e, n, z, speed) => this.crunch(v, e, n, z, speed),
      impact:
        this.yours?.kind === "motorcycle"
          ? (v, speed, before) => this.crashRider(v, speed, before)
          : undefined,
    });
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
    if (v === this.yours) this.cams.bump(speed);
  }

  /** A stepper's own hits (a wall, a parapet, a quay, a landing): their damage is done already. */
  private events(v: Vehicle, ev: VehicleEvents): void {
    if (ev.impact > CRUNCH) {
      const hl = sizeFor(v).length / 2;
      const way = v.v < 0 ? -1 : 1;
      const e = v.e + Math.sin(v.yaw) * hl * way;
      const n = v.n + Math.cos(v.yaw) * hl * way;
      this.crunch(v, e, n, v.z, ev.impact);
    }
    if (ev.fell > CRUNCH) this.crunch(v, v.e, v.n, v.z, ev.fell);
  }

  /** What became of everything this step: traffic the game must keep, explosions and sinking. */
  private watch(): void {
    for (const v of this.traffic.cars)
      if (v.state !== "traffic" && v !== this.yours) this.fleet.keep(v);
    const all = this.yours ? [this.yours, ...this.fleet.free] : [...this.fleet.free];
    for (const v of all) {
      if (v.fuse !== null && !this.ignited.has(v)) {
        this.ignited.add(v);
        if (within(v, this.focus(), SMOKE_REACH)) this.particles.ignite(v);
      }
      if (v.fire > 0 && !this.exploded.has(v)) {
        this.exploded.add(v);
        this.explode(v);
      }
      if (v.state === "sinking" && !this.sinkingSeen.has(v)) {
        this.sinkingSeen.add(v);
        this.splash(v.e, v.n, Math.max(sizeFor(v).width, 2), 1);
        if (v === this.yours) this.say("sinking");
      }
    }
  }

  /** What the blast reaches on this deck, measured from the wreck's hull. */
  private blastAt(v: Vehicle, at: { e: number; n: number; z: number }): number {
    if (Math.abs(at.z - v.z) > BLAST_HEIGHT) return 0;
    return blastDamage(Math.max(0, fromBox(v, at.e, at.n).d));
  }

  /** The nearest point of the other hull takes the blast. Critical hits start their own fuses. */
  private blastVehicle(source: Vehicle, target: Vehicle): void {
    if (target === source || onRoute(target) || (target === this.yours && this.tunnel)) return;
    const edge = fromBox(target, source.e, source.n);
    const distance = Math.max(0, edge.d);
    const damage = this.blastAt(source, {
      e: source.e - edge.ne * distance,
      n: source.n - edge.nn * distance,
      z: target.z,
    });
    const parked = target.state === "parked";
    if (applyBlastDamage(target, damage / LIFE_MAX)) {
      if (parked) this.fleet.detach(target);
      if (target !== this.yours) this.fleet.keep(target);
    }
  }

  /** The boom and flash, followed by damage to the people and vehicles within reach. */
  private explode(v: Vehicle): void {
    const f = this.focus();
    const d = Math.hypot(v.e - f.e, v.n - f.n);
    if (d < BOOM_HEAR) this.sound.boom(1 - d / BOOM_HEAR);
    if (d < SMOKE_REACH) this.particles.explode(v);
    for (const target of new Set(this.nearby)) this.blastVehicle(v, target);
    for (const q of this.crowd.people) {
      if (q.state === "down" || q.state === "swimming") continue;
      const damage = this.blastAt(v, q);
      if (damage <= 0) continue;
      const { ne, nn } = fromBox(v, q.e, q.n);
      this.crowd.knock(q, { ve: ne * damage * 0.15, vn: nn * damage * 0.15 });
    }
    this.crowd.scare(v.e, v.n, WRECK_SCARE);
    if (v === this.yours) {
      // inside your car when it explodes: the end of you
      this.hurtYou(LIFE_MAX);
      this.goDown();
      return;
    }
    if (this.wasted || this.waiting || this.tunnel) return;
    const damage = this.blastAt(v, this.player);
    this.hurtYou(damage);
    if (damage > 0) this.cams.bump(damage * 0.15);
  }

  private splash(e: number, n: number, size: number, loud: number): void {
    const f = this.focus();
    const d = Math.hypot(e - f.e, n - f.n);
    if (d < CRASH_HEAR) this.sound.splash(loud * (1 - d / CRASH_HEAR));
    this.particles.splash(e, n, size);
  }

  private timers(real: number): void {
    this.msgFor = Math.max(0, this.msgFor - real);
    if (this.msgFor === 0) this.msg = null;
    this.hurtFlash = Math.max(0, this.hurtFlash - real / HURT_FADE);
    this.jumpFor = Math.max(0, this.jumpFor - real);
    this.hitCool = Math.max(0, this.hitCool - real);
    this.cams.tick(real);
  }

  // ---------- the camera, the colours, the drawing, the signs ----------

  private camera(real: number): void {
    const tu = this.tunnel;
    const eye = tu
      ? this.cams.waiting(tu.e, tu.n, tu.yaw)
      : this.wasted && this.body
        ? this.cams.wasted(this.body, this.wastedT)
        : this.yours
          ? this.cams.driving(this.yours, real, this.held("lookBehind"), this.world)
          : this.cams.onFoot(this.player, this.t);
    this.view.setCamera(eye.e, eye.n, eye.z, eye.yaw, eye.pitch, eye.fov);
    // the colours drain while you are down (under reduced motion too: nothing moves in that)
    const grey = this.wasted ? wastedAt(this.wastedT, this.reduced).grey : 0;
    this.view.setGrey(grey);
    this.models.setGrey(grey);
    this.particles.setGrey(grey);
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
    const me = this.focus();
    const far = FOG_FAR + 30;
    m.begin();
    for (const v of this.nearby) {
      if ((v === this.yours && this.tunnel) || !within(v, me, far)) continue;
      m.vehicle(v, this.braking(v), v === this.yours && this.cams.mode === "wheel");
    }
    for (const v of this.fleet.free)
      if (v !== this.yours && !within(v, me, NEAR) && within(v, me, far)) m.vehicle(v);
    // parked cars and moored boats beyond what can be hit, out to where the fog is thick
    for (const v of this.fleet.far) if (v.state === "parked") m.vehicle(v);
    for (const posts of this.posts.values())
      for (const post of posts)
        if (within(post, me, SIGNAL_REACH)) m.signal(post, lampLit(this.t, post.phase));
    for (const q of this.crowd.people) m.person(q);
    const b = this.body;
    if (this.wasted && b) m.you(b.e, b.n, b.z, b.yaw, true);
    m.end(this.t);
  }

  private snapshot(): WalkState {
    const p = this.player;
    const v = this.yours;
    const near =
      !v && !this.wasted && !this.waiting && !this.tunnel ? toTake(p, this.nearby) : null;
    return {
      mode: this.wasted ? "down" : v ? (v.boat ? "boat" : "drive") : p.mode,
      life: p.life,
      vehicle: v
        ? {
            kind: v.kind,
            speed: Math.abs(v.v),
            damage: v.damage,
            wrecked: v.state === "wrecked",
            explodesIn: v.fuse === null ? null : Math.ceil(v.fuse - 1e-9),
            boat: v.boat,
          }
        : null,
      near: near ? { kind: near.kind } : null,
      message: this.msg,
      hurt: this.hurtFlash,
      punch: this.canPunch() ? this.punch : null,
      wasted: this.wasted ? wastedAt(this.wastedT, this.reduced) : null,
      camera: this.cams.mode,
      dark: this.tunnel ? 1 : 0,
    };
  }

  /**
   * Tells the listeners when what the signs show has changed as far as they show it: life to the
   * half point (and whenever it comes back whole), speed to half a metre a second, damage to the
   * percent, the flash and the wasted sequence to a twentieth. Not every frame.
   */
  private emit(): void {
    const s = this.snapshot();
    const w = s.wasted;
    const v = s.vehicle;
    const twentieths = (x: number) => Math.round(x * 20);
    const sig = [
      s.mode,
      Math.floor(s.life * 2),
      s.life >= LIFE_MAX,
      v
        ? `${v.kind}:${Math.round(v.speed * 2)}:${Math.round(v.damage * 100)}:${v.wrecked}:${v.explodesIn}`
        : "",
      s.near?.kind ?? "",
      s.message ?? "",
      twentieths(s.hurt),
      s.punch ? `${s.punch.sequence}:${s.punch.hit}` : "",
      w
        ? `${twentieths(w.word)}:${twentieths(w.grey)}:${twentieths(w.lift)}:${w.timeRate}:${w.skippable}`
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
