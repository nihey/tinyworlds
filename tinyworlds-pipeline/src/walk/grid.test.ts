import { describe, expect, it } from "vitest";
import { makeGeo, makeProjection } from "../projection.js";
import { cellKey, cellOf, lonLatToEN, mapToEN } from "./grid.js";

// New York's scene geo: the street grid at 45 degrees, the map's scale 2 px per metre.
const geo = makeGeo(-73.98566, 40.74844, 45, 2);
const proj = makeProjection(geo);

describe("walk grid", () => {
  it("inverts the map projection at ground level", () => {
    for (const [lon, lat] of [
      [-74.0445, 40.6892],
      [-73.7781, 40.6413],
      [-73.9262, 40.8296],
    ]) {
      const [x, y] = proj.toMap(lon, lat);
      const [e, n] = mapToEN(geo, x, y);
      const [e2, n2] = lonLatToEN(geo, lon, lat);
      expect(Math.abs(e - e2)).toBeLessThan(0.01);
      expect(Math.abs(n - n2)).toBeLessThan(0.01);
    }
  });

  it("puts the origin at (0, 0)", () => {
    expect(lonLatToEN(geo, geo.lon0, geo.lat0)).toEqual([0, 0]);
  });

  it("files a point under the square it lies in, rounding down", () => {
    expect(cellOf(-0.1, 199.9)).toEqual([-1, 0]);
    expect(cellOf(200, 0)).toEqual([1, 0]);
  });

  it("names a square by its indexes", () => {
    expect(cellKey(-3, 12)).toBe("-3_12");
  });
});
