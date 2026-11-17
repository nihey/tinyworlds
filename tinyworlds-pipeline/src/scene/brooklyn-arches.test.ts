import { describe, expect, it } from "vitest";
import { brooklynArchVolumes } from "./brooklyn-arches.js";

describe("Brooklyn Bridge tower arches", () => {
  // A single tower with the bridge running along p and a buttress at each end.
  const ring = [
    -6, -23, 6, -23, 6, -18, 4, -18, 4, 18, 6, 18, 6, 23, -6, 23, -6, 18, -4, 18, -4, -18, -6, -18,
  ];

  it("keeps the footprint and opens two pointed passages above the deck", () => {
    const pieces = brooklynArchVolumes(ring, [1, 0], 82.9, 18);
    const stone = (across: number, z: number) =>
      pieces.some(({ ring, base, top }) => {
        if (z < base || z >= top) return false;
        // Test along the central cross-section p = 0.
        let inside = false;
        for (let a = ring.length - 2, b = 0; b < ring.length; a = b, b += 2) {
          const [pa, qa] = [ring[a], ring[a + 1]];
          const [pb, qb] = [ring[b], ring[b + 1]];
          if (pa > 0 !== pb > 0 && across < qa + ((qb - qa) * -pa) / (pb - pa)) inside = !inside;
        }
        return inside;
      });
    expect(stone(8, 10)).toBe(true);
    expect([-9, 9].map((q) => stone(q, 24))).toEqual([false, false]);
    expect([-18, 0, 18].map((q) => stone(q, 24))).toEqual([true, true, true]);
    expect(stone(4, 59)).toBe(true);
    expect(stone(9, 59)).toBe(false);
    expect(stone(9, 63)).toBe(true);
    expect(pieces[0]).toEqual({ ring, base: 0, top: 18 });
    expect(pieces.at(-1)).toMatchObject({ ring, top: 82.9 });
  });

  it("takes the arches down to grade where the mapped roadway is at ground level", () => {
    const pieces = brooklynArchVolumes(ring, [1, 0], 82.9, 0);
    const piers = pieces.filter((piece) => piece.base === 0);
    expect(piers).toHaveLength(3);
    expect(piers.every((piece) => piece.top === 50)).toBe(true);
  });
});
