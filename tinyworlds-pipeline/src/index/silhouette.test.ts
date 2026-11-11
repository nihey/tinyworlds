import { describe, expect, it } from "vitest";
import { silhouette } from "./silhouette.js";

const square = (x: number, y: number, s: number): number[] => [x, y, x + s, y, x + s, y + s, x, y + s];

function box(rings: number[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings)
    for (let i = 0; i < ring.length; i += 2) {
      minX = Math.min(minX, ring[i]);
      maxX = Math.max(maxX, ring[i]);
      minY = Math.min(minY, ring[i + 1]);
      maxY = Math.max(maxY, ring[i + 1]);
    }
  return { minX, minY, maxX, maxY };
}

describe("silhouette", () => {
  it("sweeps a footprint up to its top", () => {
    const rings = silhouette([{ rings: [square(0, 0, 10)], lift: 0, rise: 20 }]);
    expect(rings).toHaveLength(1);
    expect(box(rings)).toEqual({ minX: 0, minY: -20, maxX: 10, maxY: 10 });
  });

  it("makes one outline of two pieces that touch", () => {
    const rings = silhouette([
      { rings: [square(0, 0, 10)], lift: 0, rise: 20 },
      { rings: [square(10, 0, 10)], lift: 0, rise: 5 },
    ]);
    expect(rings).toHaveLength(1);
    expect(box(rings)).toEqual({ minX: 0, minY: -20, maxX: 20, maxY: 10 });
  });

  it("keeps a piece in the air off the ground", () => {
    const rings = silhouette([{ rings: [square(0, 0, 10)], lift: 5, rise: 8 }]);
    expect(box(rings)).toEqual({ minX: 0, minY: -8, maxX: 10, maxY: 5 });
  });

  it("keeps the hole of a low ring of stands", () => {
    const rings = silhouette([{ rings: [square(0, 0, 100), square(30, 30, 40)], lift: 0, rise: 2 }]);
    expect(rings).toHaveLength(2);
  });
});
