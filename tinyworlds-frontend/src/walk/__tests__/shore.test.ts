import { describe, expect, it } from "vitest";
import { G } from "../render/palette";
import { groundKindAt, shoreSegments } from "../render/shore";
import { makeCell } from "./fixtures";

/** A mask's bits with water wherever `wet(x, y)` says, over the 100 × 100 cells. */
function maskOf(wet: (x: number, y: number) => boolean): Uint8Array {
  const bits = new Uint8Array(1250);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++)
      if (wet(x, y)) bits[(x + 100 * y) >> 3] |= 1 << ((x + 100 * y) & 7);
  return bits;
}

describe("shoreSegments", () => {
  it("runs the shore halfway between the last land cell and the first water cell, land on its left", () => {
    // water east of 100 m
    const segs = shoreSegments(
      maskOf((x) => x >= 50),
      200,
    );
    let length = 0;
    for (const [e0, n0, e1, n1] of segs) {
      expect(e0).toBeCloseTo(100, 6);
      expect(e1).toBeCloseTo(100, 6);
      // going north, the land (west) is on the left
      expect(n1).toBeGreaterThan(n0);
      length += n1 - n0;
    }
    // right across the square, edge to edge
    expect(length).toBeCloseTo(200, 6);
  });

  it("rings a pond with its water on the right", () => {
    // one 2 m cell of water at (50, 50): its centre is at 101 m, 101 m
    const segs = shoreSegments(
      maskOf((x, y) => x === 50 && y === 50),
      200,
    );
    expect(segs.length).toBe(4);
    for (const [e0, n0, e1, n1] of segs) {
      const me = (e0 + e1) / 2;
      const mn = (n0 + n1) / 2;
      // the right of the segment points towards the pond's middle
      const re = n1 - n0;
      const rn = -(e1 - e0);
      expect(re * (101 - me) + rn * (101 - mn)).toBeGreaterThan(0);
    }
  });
});

describe("groundKindAt", () => {
  it("is the land polygon painted last at a point, and land where none is", () => {
    const square = (
      kind: number,
      order: number,
      e0: number,
      n0: number,
      e1: number,
      n1: number,
    ) => ({
      kind,
      order,
      rings: [Float32Array.of(e0, n0, e1, n0, e1, n1, e0, n1)],
    });
    const rank = Array.from({ length: 46 }, (_, k) => k);
    const kindAt = groundKindAt(
      makeCell(0, 0, {
        ground: [
          square(G.Park, 2, 0, 0, 100, 100),
          square(G.Land, 5, 0, 0, 100, 100),
          // a lake over the park: water, so not what the shore stands on
          square(G.Lake, 9, 40, 40, 60, 60),
        ],
      }),
      rank,
    );
    expect(kindAt(20, 20)).toBe(G.Park);
    expect(kindAt(50, 50)).toBe(G.Park);
    expect(kindAt(150, 150)).toBe(G.Land);
  });
});
