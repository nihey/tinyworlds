import { describe, expect, it } from "vitest";
import { toUtm, utmEpsg, utmZone } from "./utm.js";

describe("utm", () => {
  it("names the zone and its EPSG code", () => {
    expect(utmZone(-47.81)).toBe(23);
    expect(utmEpsg(23, true)).toBe(32723);
    expect(utmZone(-73.98)).toBe(18);
    expect(utmEpsg(18, false)).toBe(32618);
  });

  it("puts the central meridian on the false easting and the equator on the false northing", () => {
    const [x, y] = toUtm(-45, 0, 23, true);
    expect(x).toBeCloseTo(500000, 3);
    expect(y).toBeCloseTo(10000000, 3);
  });

  it("agrees with PROJ to the millimetre", () => {
    // reference values: ST_Transform(…, 'EPSG:4326', 'EPSG:32723' / 'EPSG:32618') in DuckDB spatial
    const [x, y] = toUtm(-47.8103, -21.1775, 23, true);
    expect(x).toBeCloseTo(208188.4929, 3);
    expect(y).toBeCloseTo(7655620.9493, 3);
    const [ex, ey] = toUtm(-73.98566, 40.74844, 18, false);
    expect(ex).toBeCloseTo(585631.7347, 3);
    expect(ey).toBeCloseTo(4511326.9268, 3);
  });
});
