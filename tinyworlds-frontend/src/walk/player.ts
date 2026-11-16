import { fallDamage } from "./health";
import type { Surface, WalkWorld } from "./world";

export const WALK = 4.5;
export const SPRINT = 11;
export const JUMP = 5.2;
export const GRAVITY = 13;
/** The step a walker takes up onto a curb or a stair. */
export const STEP_UP = 0.3;
/** What a jump can land on, above where it left the ground (a car's roof, a ledge). */
export const JUMP_REACH = 1.15;
export const SWIM = 1.6;
export const SWIM_SPRINT = 3;
export const RADIUS = 0.35;
export const HEIGHT = 1.8;
export const EYE = 1.62;
/** The eye's height above the water while swimming: a camera matter, the body's feet stay at the surface. */
export const SWIM_EYE = 0.25;
/** Arrow-key turning, radians per second at full deflection. */
export const TURN = 2.2;

/** The water's surface, where a swimmer's feet are. */
const WATER_Z = -0.6;
/** Land this far above the water can be climbed onto from it. */
const CLIMB = 0.8;
/** How far ahead of a swimmer the shore is looked at. */
const CLIMB_PROBE = 0.5;
/** Stepping down less than this keeps you on the ground (ramps, curbs) instead of falling. */
const SNAP = 0.1;
const MAX_DT = 0.1;
const SUBSTEP = 0.02;

export interface Player {
  /** metres east, north of the projection origin; z is the feet above the land */
  e: number;
  n: number;
  z: number;
  vz: number;
  /** radians from north, clockwise */
  yaw: number;
  /** radians, up positive */
  pitch: number;
  mode: "foot" | "swim" | "drive" | "down";
  life: number;
  /** seconds since life last went down (the game feeds it to `regen`) */
  sinceHurt: number;
  /** while in the air: the highest z reached (the fall's top); null on a surface */
  airFrom: number | null;
  /** the height of the surface last stood on: what a jump's reach counts from */
  launch: number;
  bob: number;
}

export interface FootInput {
  forward: number;
  strafe: number;
  turn: number;
  sprint: boolean;
  jump: boolean;
}

export interface FootEvents {
  hurt: number;
  landed: Surface["kind"] | null;
  splashed: boolean;
}

type FootWorld = Pick<WalkWorld, "surfaceUnder" | "slide" | "isWater" | "inData"> & {
  roofs?: WalkWorld["roofs"];
};

export function newPlayer(e: number, n: number, z: number, yaw: number): Player {
  return {
    e,
    n,
    z,
    vz: 0,
    yaw,
    pitch: 0,
    mode: "foot",
    life: 100,
    sinceHurt: 1e9,
    airFrom: null,
    launch: z,
    bob: 0,
  };
}

/** Advances a walker or swimmer by `dt`, in steps small enough that nothing is passed through. */
export function stepFoot(p: Player, input: FootInput, world: FootWorld, dt: number): FootEvents {
  const out: FootEvents = { hurt: 0, landed: null, splashed: false };
  if (p.mode !== "foot" && p.mode !== "swim") return out;
  const total = Math.min(Math.max(dt, 0), MAX_DT);
  const steps = Math.max(1, Math.ceil(total / SUBSTEP - 1e-9));
  const h = total / steps;
  if (total <= 0) return out;
  for (let s = 0; s < steps; s++) {
    p.yaw += input.turn * TURN * h;
    if (p.mode === "swim") swimStep(p, input, world, h, out);
    else footStep(p, input, world, h, out);
  }
  return out;
}

/** The unit-length-capped wish in world axes, and its speed factor 0 to 1. */
function wish(p: Player, input: FootInput) {
  const mag = Math.hypot(input.forward, input.strafe);
  if (mag < 0.05) return null;
  const sy = Math.sin(p.yaw);
  const cy = Math.cos(p.yaw);
  const k = 1 / Math.max(1, mag);
  return {
    de: (sy * input.forward + cy * input.strafe) * k,
    dn: (cy * input.forward - sy * input.strafe) * k,
    power: Math.min(1, mag),
  };
}

function footStep(p: Player, input: FootInput, w: FootWorld, h: number, out: FootEvents) {
  const air = p.airFrom !== null;
  const base = air ? p.launch : p.z;
  const reach = air ? JUMP_REACH : STEP_UP;
  const wi = wish(p, input);
  if (wi) {
    const speed = (input.sprint ? SPRINT : WALK) * wi.power;
    const e1 = p.e + wi.de * speed * h;
    const n1 = p.n + wi.dn * speed * h;
    // a car's roof higher than we can step or land onto is a wall
    const roofBlocked = (e: number, n: number) => {
      const r = w.roofs?.(e, n);
      return r != null && r > base + reach;
    };
    let [e, n] = w.slide(p.e, p.n, e1, n1, RADIUS, p.z, HEIGHT);
    if (roofBlocked(e, n)) {
      if (!roofBlocked(e, p.n)) n = p.n;
      else if (!roofBlocked(p.e, n)) e = p.e;
      else {
        e = p.e;
        n = p.n;
      }
    }
    p.e = e;
    p.n = n;
    if (!air) p.bob += h * speed * 1.7;
  }

  let surf = w.surfaceUnder(p.e, p.n, base, reach);
  if (!air) {
    if (p.z - surf.z > SNAP) {
      p.airFrom = p.z;
      p.vz = 0;
    } else {
      p.z = surf.z;
      p.launch = surf.z;
      p.vz = 0;
      if (input.jump) {
        p.vz = JUMP;
        p.airFrom = p.z;
      }
    }
  }
  if (p.airFrom === null) return;

  p.vz -= GRAVITY * h;
  p.z += p.vz * h;
  p.airFrom = Math.max(p.airFrom, p.z);
  surf = w.surfaceUnder(p.e, p.n, p.launch, JUMP_REACH);
  if (p.vz <= 0 && p.z <= surf.z) {
    const hurt = fallDamage(p.airFrom - surf.z, surf.kind);
    if (hurt > 0) {
      p.life = Math.max(0, p.life - hurt);
      p.sinceHurt = 0;
      out.hurt += hurt;
    }
    out.landed = surf.kind;
    p.z = surf.z;
    p.vz = 0;
    p.airFrom = null;
    p.launch = surf.z;
    if (surf.kind === "water") {
      p.mode = "swim";
      out.splashed = true;
    }
  }
}

function swimStep(p: Player, input: FootInput, w: FootWorld, h: number, out: FootEvents) {
  p.z = WATER_Z;
  p.vz = 0;
  p.airFrom = null;
  p.launch = WATER_Z;
  const wi = wish(p, input);
  if (!wi) return;
  const speed = (input.sprint ? SWIM_SPRINT : SWIM) * wi.power;
  const e1 = p.e + wi.de * speed * h;
  const n1 = p.n + wi.dn * speed * h;
  if (w.inData(e1, n1) && w.isWater(e1, n1)) {
    [p.e, p.n] = w.slide(p.e, p.n, e1, n1, RADIUS, WATER_Z, HEIGHT);
    return;
  }
  // pushing into a shore: climb out when the land is within reach of the water
  const ahead = w.surfaceUnder(
    p.e + wi.de * CLIMB_PROBE,
    p.n + wi.dn * CLIMB_PROBE,
    WATER_Z,
    CLIMB,
  );
  if (ahead.kind === "water") return;
  const [e, n] = w.slide(p.e, p.n, e1, n1, RADIUS, ahead.z, HEIGHT);
  // a car standing on the shore is a wall, as it is on land
  const car = w.roofs?.(e, n);
  if (car != null && car > ahead.z + STEP_UP) return;
  const land = w.surfaceUnder(e, n, WATER_Z, CLIMB);
  if (land.kind === "water") {
    p.e = e;
    p.n = n;
    return;
  }
  p.e = e;
  p.n = n;
  p.z = land.z;
  p.launch = land.z;
  p.mode = "foot";
  out.landed = null;
}
