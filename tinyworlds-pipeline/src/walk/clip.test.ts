import { describe, expect, it } from "vitest";
import { clipPolygon, clipPolyline, clipRing, splitByCells } from "./clip.js";

/** Shoelace area of a flat ring. */
function area(ring: number[]): number {
  let a = 0;
  const n = ring.length / 2;
  for (let k = 0; k < n; k++) {
    const l = (k + 1) % n;
    a += ring[k * 2] * ring[l * 2 + 1] - ring[l * 2] * ring[k * 2 + 1];
  }
  return Math.abs(a) / 2;
}
const square = (e0: number, n0: number, e1: number, n1: number) => [e0, n0, e1, n0, e1, n1, e0, n1];
const evenOddArea = (rings: number[][]) => {
  const outer = rings.filter((_, k) => k === 0).reduce((s, r) => s + area(r), 0);
  return outer - rings.slice(1).reduce((s, r) => s + area(r), 0);
};

describe("clipRing", () => {
  it("returns a ring inside the box unchanged", () => {
    const ring = square(10, 10, 50, 40);
    expect(clipRing(ring, { e0: 0, n0: 0, e1: 200, n1: 200 })).toBe(ring);
  });

  it("drops a ring outside the box", () => {
    expect(clipRing(square(300, 300, 320, 320), { e0: 0, n0: 0, e1: 200, n1: 200 })).toEqual([]);
  });

  it("cuts a triangle against one edge", () => {
    const tri = [-100, 0, 100, 0, 0, 100];
    const cut = clipRing(tri, { e0: 0, n0: -10, e1: 200, n1: 200 });
    expect(area(cut)).toBeCloseTo(area(tri) / 2, 6);
  });
});

describe("splitByCells", () => {
  it("a ring across four squares comes back as four pieces whose areas sum to the ring's", () => {
    const ring = square(150, 150, 250, 250);
    const parts = splitByCells([ring], 0, 1, 0, 1);
    expect([...parts.keys()].sort()).toEqual(["0_0", "0_1", "1_0", "1_1"]);
    let sum = 0;
    for (const rings of parts.values()) {
      expect(rings).toHaveLength(1);
      sum += area(rings[0]);
      expect(area(rings[0])).toBeCloseTo(2500, 6);
    }
    expect(sum).toBeCloseTo(area(ring), 6);
  });

  it("a ring with a hole keeps the hole in the square it falls in", () => {
    const outer = square(-50, -50, 450, 150);
    const hole = square(210, 40, 240, 70);
    const parts = splitByCells([outer, hole], 0, 2, 0, 0);
    expect(parts.get("1_0")).toHaveLength(2);
    expect(parts.get("0_0")).toHaveLength(1);
    expect(parts.get("2_0")).toHaveLength(1);
    expect(evenOddArea(parts.get("1_0")!)).toBeCloseTo(200 * 150 - 900, 6);
  });

  it("a ring inside one square is returned unchanged", () => {
    const ring = square(10, 10, 50, 40);
    const parts = splitByCells([ring], 0, 0, 0, 0);
    expect(parts.get("0_0")![0]).toBe(ring);
  });

  it("covers a large polygon across many squares without losing area", () => {
    const ring = square(-1000, -1000, 5000, 3000);
    const parts = splitByCells([ring], -5, 25, -5, 15);
    let sum = 0;
    for (const rings of parts.values()) sum += area(rings[0]);
    expect(sum).toBeCloseTo(6000 * 4000, 3);
    expect(parts.size).toBe(30 * 20);
  });
});

describe("clipPolygon", () => {
  it("drops rings left with fewer than 3 vertices", () => {
    const out = clipPolygon([square(0, 0, 10, 10), square(500, 500, 510, 510)], {
      e0: 0,
      n0: 0,
      e1: 200,
      n1: 200,
    });
    expect(out).toHaveLength(1);
  });
});

describe("clipPolyline", () => {
  const box = { e0: 0, n0: 0, e1: 100, n1: 100 };

  it("a line crossing the box twice gives two runs whose ends lie on the box", () => {
    // in at the west, out at the east, out of reach, then back in over the south edge and out the north
    const path = [-50, 50, 150, 50, 150, -50, 50, -50, 50, 150];
    const runs = clipPolyline(path, box);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual([0, 50, 100, 50]);
    expect(runs[1]).toEqual([50, 0, 50, 100]);
  });

  it("joins segments that continue inside the box into one run", () => {
    const runs = clipPolyline([-10, 10, 20, 10, 20, 60, 120, 60], box);
    expect(runs).toEqual([[0, 10, 20, 10, 20, 60, 100, 60]]);
  });

  it("returns nothing for a line outside", () => {
    expect(clipPolyline([200, 200, 300, 300], box)).toEqual([]);
  });
});
