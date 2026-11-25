import { describe, expect, it } from "vitest";
import { mix } from "../scene/hash.js";
import { mooringsOf } from "./moorings.js";

/** A 100 × 20 m pier from (0, 0) to (100, 20), its outer ring counter-clockwise. */
const pier = [[0, 0, 100, 0, 100, 20, 0, 20]];
const onPier = (e: number, n: number): boolean => e >= 0 && e <= 100 && n >= 0 && n <= 20;

/** The first pier index that the hash gives boats to, or (`fails`) the first it does not. */
function indexWhere(passes: boolean): number {
  for (let i = 0; ; i++) if ((mix(i, 77) % 3 === 0) === passes) return i;
}

/** The pier at index `at`, the ones before it empty. */
const piersWith = (at: number): number[][][] => [...Array.from({ length: at }, () => []), pier];

describe("mooringsOf", () => {
  it("ties boats every 12 m along a pier's water sides, heading along its edges", () => {
    const at = indexWhere(true);
    const isWater = (e: number, n: number): boolean => !onPier(e, n);
    const boats = mooringsOf(piersWith(at), isWater);

    // 8 along each long side, 1 on each short one
    expect(boats).toHaveLength(18);
    for (const b of boats) {
      expect(isWater(b.e, b.n)).toBe(true);
      expect(["speedboat", "motorboat"]).toContain(b.kind);
    }

    const south = boats.filter((b) => Math.abs(b.n + 2.5) < 1e-9).sort((a, b) => a.e - b.e);
    const north = boats.filter((b) => Math.abs(b.n - 22.5) < 1e-9).sort((a, b) => a.e - b.e);
    const ends = boats.filter((b) => Math.abs(b.e + 2.5) < 1e-9 || Math.abs(b.e - 102.5) < 1e-9);
    expect(south).toHaveLength(8);
    expect(north).toHaveLength(8);
    expect(ends).toHaveLength(2);
    for (const side of [south, north])
      for (let k = 1; k < side.length; k++) expect(side[k].e - side[k - 1].e).toBeCloseTo(12, 9);
    // along the long sides they point east or west, along the short ones north or south
    for (const b of [...south, ...north]) expect(Math.abs(Math.sin(b.heading))).toBeCloseTo(1, 9);
    for (const b of ends) expect(Math.abs(Math.cos(b.heading))).toBeCloseTo(1, 9);
    for (const b of boats) expect(b.heading >= 0 && b.heading < 2 * Math.PI).toBe(true);
  });

  it("ties none where the pier meets the land", () => {
    const at = indexWhere(true);
    // land south of the pier: its south side has no water 3 m out
    const isWater = (e: number, n: number): boolean => !onPier(e, n) && n > 0;
    const boats = mooringsOf(piersWith(at), isWater);
    expect(boats.length).toBeGreaterThan(0);
    for (const b of boats) expect(b.n).toBeGreaterThan(0);
  });

  it("ties none to a pier the hash passes over", () => {
    const at = indexWhere(false);
    expect(mooringsOf(piersWith(at), (e, n) => !onPier(e, n))).toEqual([]);
  });

  it("is the same every run, speedboats and motorboats by hash", () => {
    const at = indexWhere(true);
    const isWater = (e: number, n: number): boolean => !onPier(e, n);
    const a = mooringsOf(piersWith(at), isWater);
    expect(mooringsOf(piersWith(at), isWater)).toEqual(a);
    a.forEach((b, k) => expect(b.kind).toBe(mix(at, k) % 3 === 0 ? "speedboat" : "motorboat"));
  });
});
