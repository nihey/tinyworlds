/** Deterministic pseudo-randomness: the same city comes out of every run. */

/** FNV-1a over a string, as an unsigned 32-bit integer. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mix two integers into one well-scrambled unsigned 32-bit integer. */
export function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A float in [0, 1) from a seed and a salt (use a different salt for each independent choice). */
export const rand = (seed: number, salt: number): number => mix(seed, salt) / 4294967296;

/** Pick an element. */
export const pick = <T>(items: readonly T[], seed: number, salt: number): T =>
  items[mix(seed, salt) % items.length];

/** Hash of a pixel position: the basis of every ground texture. */
export const hash2 = (x: number, y: number): number => mix(x | 0, (y | 0) + 0x632be5ab);
