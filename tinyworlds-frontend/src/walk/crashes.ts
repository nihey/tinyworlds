import { applyBody, bodyOf, overlap, resolve, type Body } from "./collide";
import { onRoute } from "./ferries";
import { HEIGHT, RADIUS, type Player } from "./player";
import type { Traffic } from "./traffic";
import { applyDamage, sizeFor, type Vehicle } from "./vehicles";
import type { WalkWorld } from "./world";

/**
 * What hits what: cars and boats against each other (pushed apart, spun, hurt each by the other's
 * weight, traffic knocked out of its lane, parked cars shoved loose), and you on foot or swimming
 * against them. No three.js.
 */

/** Slower than this, m/s, a hit makes no crunch, no sparks, no running. */
export const CRUNCH = 2.2;
/** Vehicles are paired through a grid of this many metres. */
const BUCKET = 16;

/**
 * Where a point is against a vehicle's box, in plan: `d` its distance outside the box (negative
 * inside it: how deep), (ne, nn) the unit way from the box out to the point.
 */
export function fromBox(v: Vehicle, e: number, n: number, grow = 0) {
  const s = sizeFor(v);
  const hl = s.length / 2 + grow;
  const hw = s.width / 2 + grow;
  const sy = Math.sin(v.yaw);
  const cy = Math.cos(v.yaw);
  const de = e - v.e;
  const dn = n - v.n;
  const f = de * sy + dn * cy;
  const r = de * cy - dn * sy;
  const df = f - Math.max(-hl, Math.min(hl, f));
  const dr = r - Math.max(-hw, Math.min(hw, r));
  const d = Math.hypot(df, dr);
  if (d > 1e-9) return { d, ne: (df * sy + dr * cy) / d, nn: (df * cy - dr * sy) / d };
  // inside: out through the nearer side
  const toEnd = hl - Math.abs(f);
  const toSide = hw - Math.abs(r);
  if (toEnd < toSide) {
    const way = f >= 0 ? 1 : -1;
    return { d: -toEnd, ne: sy * way, nn: cy * way };
  }
  const way = r >= 0 ? 1 : -1;
  return { d: -toSide, ne: cy * way, nn: -sy * way };
}

/** A vehicle's height from its bottom (a boat's hull reaches under the water) to its roof. */
export function span(v: Vehicle): [number, number] {
  const h = sizeFor(v).height * (v.state === "wrecked" ? 0.85 : 1);
  return [v.boat ? v.z - 1 : v.z, v.z + h];
}

/** How far a vehicle reaches from its middle: half its own box's diagonal. */
export function halfDiagonal(v: Vehicle): number {
  const s = sizeFor(v);
  return Math.hypot(s.length, s.width) / 2;
}

export const moving = (v: Vehicle) => v.v !== 0 || v.vs !== 0 || v.w !== 0 || v.vz !== 0;

export interface CrashHooks {
  traffic: Traffic;
  /** what moves of itself: only a pair with one of these is looked at */
  mover(v: Vehicle): boolean;
  /** a parked car or a moored boat that was hit goes loose */
  loosen(v: Vehicle): void;
  /** a traffic car knocked loose is the game's to keep */
  keep(v: Vehicle): void;
  /** a hit worth hearing: the crunch, the sparks, people running */
  crunch(v: Vehicle, e: number, n: number, z: number, speed: number): void;
  /** The change in each vehicle's speed vector, with its movement before the crash. */
  impact?(v: Vehicle, speed: number, before: { e: number; n: number }): void;
}

const cellsOf = (v: Vehicle) => {
  const r = halfDiagonal(v);
  const out: number[] = [];
  for (let x = Math.floor((v.e - r) / BUCKET); x <= Math.floor((v.e + r) / BUCKET); x++)
    for (let y = Math.floor((v.n - r) / BUCKET); y <= Math.floor((v.n + r) / BUCKET); y++)
      out.push((x + 32768) * 65536 + (y + 32768));
  return out;
};

/**
 * Every pair of boxes in `list` that touch, one of them a mover: cars with cars and boats with
 * boats, their heights overlapping, two ferries on their routes never. Each pair is pushed apart
 * with a little bounce (`resolve`), and each takes its damage by the other's weight.
 */
export function collide(list: Vehicle[], hooks: CrashHooks): void {
  const grid = new Map<number, Vehicle[]>();
  for (const v of list)
    for (const k of cellsOf(v)) {
      const bucket = grid.get(k);
      if (bucket) bucket.push(v);
      else grid.set(k, [v]);
    }
  const done = new Set<string>();
  for (const a of list) {
    if (!hooks.mover(a)) continue;
    for (const k of cellsOf(a))
      for (const b of grid.get(k) ?? []) {
        if (b === a || a.boat !== b.boat || (onRoute(a) && onRoute(b))) continue;
        const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        if (done.has(key)) continue;
        done.add(key);
        const [a0, a1] = span(a);
        const [b0, b1] = span(b);
        if (a0 >= b1 || b0 >= a1) continue;
        hit(a, b, hooks);
      }
  }
}

function hit(a: Vehicle, b: Vehicle, hooks: CrashHooks): void {
  const ba = bodyOf(a);
  const bb = bodyOf(b);
  // a ferry on its route gives way to nothing
  if (onRoute(a)) ba.mass = Infinity;
  if (onRoute(b)) bb.mass = Infinity;
  const touch = overlap(ba, bb);
  if (!touch) return;
  const va = { e: ba.ve, n: ba.vn };
  const vb = { e: bb.ve, n: bb.vn };
  const closing = resolve(ba, bb, touch);
  answer(a, ba, va, hooks);
  answer(b, bb, vb, hooks);
  if (closing > 0) {
    applyDamage(a, closing, bb.mass);
    applyDamage(b, closing, ba.mass);
  }
  if (closing > CRUNCH) hooks.crunch(a, touch.pe, touch.pn, Math.max(a.z, b.z), closing);
  if (closing > 0 && hooks.impact) {
    hooks.impact(a, Math.hypot(ba.ve - va.e, ba.vn - va.n), va);
    hooks.impact(b, Math.hypot(bb.ve - vb.e, bb.vn - vb.n), vb);
  }
}

/** Puts a hit's outcome on a vehicle: traffic stops or goes loose, a parked car goes loose. */
function answer(v: Vehicle, body: Body, was: { e: number; n: number }, hooks: CrashHooks): void {
  if (onRoute(v)) return;
  if (v.state === "traffic") {
    // told before any damage, so a wreck it becomes stays a wreck
    if (hooks.traffic.hit(v, Math.hypot(body.ve - was.e, body.vn - was.n))) {
      applyBody(v, body);
      hooks.keep(v);
    }
    return;
  }
  if (v.state === "parked") hooks.loosen(v);
  applyBody(v, body);
}

/**
 * You on foot or swimming, and the vehicles near: pushed out of any you overlap (unless you stand
 * on its roof or are under it). Answers the hardest of them coming at you (only its own speed
 * counts, less yours away from it: `vel`), and its way from it to you; null when none touches you.
 */
export function bumped(
  p: Player,
  nearby: Vehicle[],
  world: WalkWorld,
  vel: { e: number; n: number },
): { closing: number; ne: number; nn: number } | null {
  let worst: { closing: number; ne: number; nn: number } | null = null;
  for (const v of nearby) {
    if (v.state === "sunk" || v.state === "sinking") continue;
    const reach = halfDiagonal(v) + RADIUS + 1;
    if (Math.abs(v.e - p.e) > reach || Math.abs(v.n - p.n) > reach) continue;
    const [lo, hi] = span(v);
    if (p.z >= hi - 0.05 || p.z + HEIGHT <= lo) continue;
    const b = fromBox(v, p.e, p.n);
    if (b.d >= RADIUS) continue;
    const push = RADIUS - b.d + 0.01;
    [p.e, p.n] = world.slide(p.e, p.n, p.e + b.ne * push, p.n + b.nn * push, RADIUS, p.z, HEIGHT);
    const body = bodyOf(v);
    // how fast it comes at you along the line between you, less how fast you were moving away
    // from it: walking into a car standing still is no hit, and nor is a car pushing you along
    const closing = body.ve * b.ne + body.vn * b.nn - Math.max(0, vel.e * b.ne + vel.n * b.nn);
    if (!worst || closing > worst.closing) worst = { closing, ne: b.ne, nn: b.nn };
  }
  return worst;
}
