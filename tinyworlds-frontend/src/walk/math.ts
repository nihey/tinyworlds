/** The walk's small sums, in one place. */

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** An angle in (−π, π]. */
export const wrap = (a: number) => {
  const x = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return x === 0 ? Math.PI : x - Math.PI;
};

/** Smoothstep on 0 to 1: eases in and out. */
export const smooth = (t: number) => t * t * (3 - 2 * t);

/** The pipeline's `mix` (scene/hash.ts): a 32-bit hash of two numbers, so a pattern comes out as the map's. */
export function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
