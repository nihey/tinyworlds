import { describe, expect, it } from "vitest";
import { correct } from "./heights.js";

describe("height correction", () => {
  it("never puts a building below a storey", () => {
    expect(correct(0)).toBe(3);
    expect(correct(-5)).toBe(3);
  });

  it("brings the raster's readings back to what mapped floors say", () => {
    // one storey reads 5.5 m, eleven floors read 36 m
    expect(correct(5.5)).toBeCloseTo(3.8, 5);
    expect(correct(36)).toBeCloseTo(35, 5);
  });

  it("rises monotonically and stops where the raster saturates", () => {
    let last = 0;
    for (let reading = 0; reading <= 120; reading += 0.5) {
      const h = correct(reading);
      expect(h).toBeGreaterThanOrEqual(last);
      last = h;
    }
    expect(correct(200)).toBe(92);
  });
});
