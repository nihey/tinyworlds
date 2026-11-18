import { clamp } from "./math";
import type { Surface } from "./world";

export const LIFE_MAX = 100;
/** Life gained per second once the wait is over. */
export const REGEN = 2;
/** Seconds without being hurt before life comes back. */
export const REGEN_AFTER = 5;

/** A fall hurts from 4 m and kills at 15 m; water never hurts. */
export function fallDamage(drop: number, into: Surface["kind"]): number {
  if (into === "water") return 0;
  return clamp((drop - 4) / 11, 0, 1) * LIFE_MAX;
}

/** Being hit by a car: `closing` is the speed the car closes at, in m/s; 30 mph (13.4 m/s) kills. */
export function hitDamage(closing: number): number {
  return Math.max(0, (closing - 2) * 9);
}

/** A vehicle explosion: 80 at the hull, 40 at 5 m, falling to zero at 9 m. */
export function blastDamage(distance: number): number {
  return Math.max(0, Math.min(80 - 8 * distance, 90 - 10 * distance));
}

/** Life after `dt` seconds, `sinceHurt` being the time since the last hurt before this step. */
export function regen(life: number, sinceHurt: number, dt: number): number {
  if (life >= LIFE_MAX) return LIFE_MAX;
  const regenerating = Math.max(0, Math.min(dt, sinceHurt + dt - REGEN_AFTER));
  return Math.min(LIFE_MAX, life + regenerating * REGEN);
}
