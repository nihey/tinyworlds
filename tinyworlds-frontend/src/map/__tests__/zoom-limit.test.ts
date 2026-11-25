import { describe, expect, it } from "vitest";
import { clampCentre, FIT_SHARE, minScaleFor } from "../zoom-limit";

const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 1000 };

describe("minScaleFor", () => {
  it("without a minZoom, lets the whole map fit with room around it", () => {
    expect(minScaleFor(1000, 800, bounds, 4)).toBeCloseTo(0.5 * FIT_SHARE);
    expect(minScaleFor(1000, 800, bounds, 4, 0)).toBeCloseTo(0.5 * FIT_SHARE);
    expect(minScaleFor(1000, 800, bounds, 4, Number.NaN)).toBeCloseTo(0.5 * FIT_SHARE);
  });

  it("with a minZoom, stops where the map fills the view, on its tighter side", () => {
    expect(minScaleFor(1000, 800, bounds, 4, 1)).toBeCloseTo(0.8);
    expect(minScaleFor(400, 800, bounds, 4, 1)).toBeCloseTo(0.8);
    expect(minScaleFor(1600, 400, bounds, 4, 1)).toBeCloseTo(0.8);
    expect(minScaleFor(1000, 800, bounds, 4, 1.5)).toBeCloseTo(1.2);
  });

  it("never goes past the closest zoom", () => {
    expect(minScaleFor(1000, 800, bounds, 0.5, 1)).toBe(0.5);
  });
});

describe("clampCentre", () => {
  it("keeps the view inside the range", () => {
    expect(clampCentre(50, 100, 0, 1000)).toBe(100);
    expect(clampCentre(990, 100, 0, 1000)).toBe(900);
    expect(clampCentre(400, 100, 0, 1000)).toBe(400);
  });

  it("centres a view wider than the range", () => {
    expect(clampCentre(10, 800, 0, 1000)).toBe(500);
  });
});
