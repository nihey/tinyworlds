import { describe, expect, it } from "vitest";
import { G } from "../render/palette";
import { groundKindAt, shoreField, shoreSegments } from "../render/shore";
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

/** The data's shore array for a mask: each water cell's distance to the nearest land cell, in 2 m steps, rounded. */
function shoreOf(bits: Uint8Array): Uint8Array {
  const wet = (x: number, y: number) => (bits[(x + 100 * y) >> 3] >> ((x + 100 * y) & 7)) & 1;
  const land: [number, number][] = [];
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) if (!wet(x, y)) land.push([x, y]);
  const out = new Uint8Array(10000);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      if (!wet(x, y)) continue;
      let d = Infinity;
      for (const [lx, ly] of land) d = Math.min(d, Math.hypot(lx - x, ly - y));
      out[x + 100 * y] = Math.min(255, Math.round(d));
    }
  return out;
}

describe("shoreField", () => {
  // water east of x = 50
  const bits = maskOf((x) => x >= 50);
  const field = shoreField(shoreOf(bits), bits);
  const at = (x: number, y: number, c: number) => field[(x + 100 * y) * 4 + c];

  it("keeps each water cell's distance from the land in sixteenths of a step, none on land", () => {
    expect(at(40, 50, 0)).toBe(0);
    expect(at(49, 50, 0)).toBe(0);
    expect(at(50, 50, 0) / 16).toBeCloseTo(1, 0);
    expect(at(55, 50, 0) / 16).toBeCloseTo(6, 1);
    expect(at(60, 50, 0) / 16).toBeCloseTo(11, 1);
    expect(at(80, 50, 0)).toBe(255);
  });

  it("turns its normal from the land into the water", () => {
    for (const x of [50, 52, 56]) {
      expect(at(x, 50, 1)).toBeGreaterThan(250);
      expect(Math.abs(at(x, 50, 2) - 128)).toBeLessThanOrEqual(1);
    }
  });

  it("measures how far the land is from the water, in sixty-fourths of a step, none in the water", () => {
    expect(at(49, 50, 3)).toBe(64);
    expect(at(48, 50, 3)).toBe(128);
    expect(at(47, 50, 3)).toBe(192);
    expect(at(40, 50, 3)).toBe(255);
    expect(at(50, 50, 3)).toBe(0);
    expect(at(70, 50, 3)).toBe(0);
  });

  it("smooths the rounded distances, so a one-cell notch moves the bands less than it moves the data", () => {
    const notched = maskOf((x, y) => x >= 50 && !(x === 50 && y === 50));
    const raw = shoreOf(notched);
    const smooth = shoreField(raw, notched);
    // three cells out from the notch: the straight shore would make it 3 steps
    const k = 52 + 100 * 50;
    expect(Math.abs(smooth[k * 4] / 16 - 3)).toBeLessThan(Math.abs(raw[k] - 3));
  });

  it("is open water everywhere for a square with no land near", () => {
    const open = shoreField(new Uint8Array(10000).fill(255), null);
    for (let k = 0; k < 10000; k += 137) {
      expect(open[k * 4]).toBe(255);
      expect(open[k * 4 + 3]).toBe(0);
    }
  });
});
