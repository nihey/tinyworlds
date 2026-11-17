import { describe, expect, it } from "vitest";
import { makeGeo, makeProjection, turnGrid } from "./projection.js";

const proj = makeProjection(makeGeo(-73.98566, 40.74844, 28.9, 2));

describe("projection", () => {
  it("puts the origin at map (0, 0)", () => {
    const [x, y] = proj.toMap(-73.98566, 40.74844);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
  });

  it("round-trips lon/lat through map px", () => {
    for (const [lon, lat] of [
      [-74.0445, 40.6892], // Statue of Liberty
      [-73.7781, 40.6413], // JFK
      [-73.9262, 40.8296], // Yankee Stadium
    ]) {
      const [x, y] = proj.toMap(lon, lat);
      const [lon2, lat2] = proj.toLonLat(x, y);
      expect(lon2).toBeCloseTo(lon, 9);
      expect(lat2).toBeCloseTo(lat, 9);
    }
  });

  it("draws one metre uptown as 2 px right and 1 px up", () => {
    expect(proj.gridToMap(1, 0)).toEqual([2, -1]);
    expect(proj.gridToMap(0, 1)).toEqual([2, 1]);
  });

  it("sends Fifth Avenue up and to the right at a 2:1 slope", () => {
    // Fifth Avenue at 34th St and at 59th St
    const a = proj.toMap(-73.98496, 40.74845);
    const b = proj.toMap(-73.97337, 40.76434);
    const slope = (b[1] - a[1]) / (b[0] - a[0]);
    expect(b[0]).toBeGreaterThan(a[0]);
    expect(slope).toBeCloseTo(-0.5, 1);
  });

  it("scales heights by k·√1.5", () => {
    expect(proj.rise(100)).toBeCloseTo(244.949, 3);
  });

  it("points north up and about 30° to the right", () => {
    expect(proj.northDeg).toBeGreaterThan(28);
    expect(proj.northDeg).toBeLessThan(32);
  });

  it("points north straight up when turned to 45°", () => {
    expect(makeProjection(makeGeo(-73.98566, 40.74844, 45, 2)).northDeg).toBeCloseTo(0, 12);
  });
});

describe("turnGrid", () => {
  it("moves a point between grids of two bearings without moving it on the ground", () => {
    const g = makeProjection(makeGeo(-73.98566, 40.74844, 28.9, 2));
    const v = makeProjection(makeGeo(-73.98566, 40.74844, 45, 2));
    for (const [p, q] of [
      [100, 0],
      [0, -250],
      [-37.5, 412],
    ]) {
      const [pv, qv] = turnGrid(p, q, 45 - 28.9);
      const a = g.toLonLat(...g.gridToMap(p, q));
      const b = v.toLonLat(...v.gridToMap(pv, qv));
      expect(b[0]).toBeCloseTo(a[0], 9);
      expect(b[1]).toBeCloseTo(a[1], 9);
    }
  });

  it("sends a metre north on a compass grid to (√½, −√½) on one turned 45°", () => {
    const [p, q] = turnGrid(1, 0, 45);
    expect(p).toBeCloseTo(Math.SQRT1_2, 12);
    expect(q).toBeCloseTo(-Math.SQRT1_2, 12);
  });

  it("leaves a point alone when there is no turn", () => {
    expect(turnGrid(3, -4, 0)).toEqual([3, -4]);
  });
});
