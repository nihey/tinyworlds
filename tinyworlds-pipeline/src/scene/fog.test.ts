import { describe, expect, it } from "vitest";
import { distanceTransform, fogAt, type FogGrid } from "./fog.js";

describe("distanceTransform", () => {
  it("measures Euclidean distance to the nearest set cell", () => {
    const w = 9;
    const h = 7;
    const mask = new Uint8Array(w * h);
    mask[3 * w + 2] = 1;
    mask[1 * w + 7] = 1;
    const d = distanceTransform(mask, w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const expected = Math.min(Math.hypot(x - 2, y - 3), Math.hypot(x - 7, y - 1));
        expect(d[y * w + x]).toBeCloseTo(expected, 5);
      }
  });
});

describe("fogAt", () => {
  it("interpolates between cell centres and is far outside the grid", () => {
    const fog: FogGrid = {
      p0: 0,
      q0: 0,
      cell: 10,
      cols: 3,
      rows: 3,
      d: Float32Array.from([0, 10, 20, 0, 10, 20, 0, 10, 20]),
    };
    expect(fogAt(fog, 5, 5)).toBeCloseTo(0);
    expect(fogAt(fog, 10, 12)).toBeCloseTo(5);
    expect(fogAt(fog, 15, 15)).toBeCloseTo(10);
    expect(fogAt(fog, -50, 5)).toBeGreaterThan(1e6);
  });
});
