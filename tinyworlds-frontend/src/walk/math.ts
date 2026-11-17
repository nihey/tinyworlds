/** The walk's small sums, in one place. */

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** An angle in (−π, π]. */
export const wrap = (a: number) => {
  const x = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return x === 0 ? Math.PI : x - Math.PI;
};

/** Smoothstep on 0 to 1: eases in and out. */
export const smooth = (t: number) => t * t * (3 - 2 * t);
