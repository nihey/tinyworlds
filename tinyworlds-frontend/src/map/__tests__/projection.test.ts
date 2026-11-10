import { describe, expect, it } from "vitest";
import { createProjection } from "../projection";

const geo = { lon0: -73.9857, lat0: 40.7484, betaDeg: 28.9, k: 2, kz: 2 * Math.sqrt(1.5) };

describe("projection", () => {
  const proj = createProjection(geo);

  it("puts the origin at map (0, 0)", () => {
    const p = proj.toMap(geo.lon0, geo.lat0);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it("round-trips lon/lat through map px", () => {
    const spots = [
      [-73.9855, 40.758], // Times Square
      [-74.0445, 40.6892], // Statue of Liberty
      [-73.7781, 40.6413], // JFK
      [-73.9262, 40.8296], // Yankee Stadium
    ];
    for (const [lon, lat] of spots) {
      const m = proj.toMap(lon, lat);
      const g = proj.toGeo(m.x, m.y);
      expect(g.lon).toBeCloseTo(lon, 9);
      expect(g.lat).toBeCloseTo(lat, 9);
    }
  });

  it("round-trips map px through lon/lat", () => {
    const g = proj.toGeo(12345.5, -6789.25);
    const m = proj.toMap(g.lon, g.lat);
    expect(m.x).toBeCloseTo(12345.5, 6);
    expect(m.y).toBeCloseTo(-6789.25, 6);
  });

  it("runs the avenues up-right at a 2:1 pixel slope", () => {
    // 1 km along the grid's own bearing
    const R = 6371008.8;
    const rad = Math.PI / 180;
    const dNorth = 1000 * Math.cos(geo.betaDeg * rad);
    const dEast = 1000 * Math.sin(geo.betaDeg * rad);
    const lat = geo.lat0 + dNorth / (rad * R);
    const lon = geo.lon0 + dEast / (rad * R * Math.cos(geo.lat0 * rad));
    const m = proj.toMap(lon, lat);
    expect(m.x).toBeCloseTo(1000 * geo.k, 6);
    expect(m.y).toBeCloseTo((-1000 * geo.k) / 2, 6);
  });

  it("puts true north up and to the right", () => {
    const m = proj.toMap(geo.lon0, geo.lat0 + 0.01);
    expect(m.y).toBeLessThan(0);
    expect(m.x).toBeGreaterThan(0);
    const deg = (Math.atan2(m.x, -m.y) * 180) / Math.PI;
    expect(deg).toBeGreaterThan(25);
    expect(deg).toBeLessThan(35);
  });
});
