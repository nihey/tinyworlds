import { describe, expect, it } from "vitest";
import { makeGeo, makeProjection } from "../projection.js";
import { CITIES } from "./index.js";
import { NORTH_UP_DEG, viewDeg } from "./view.js";

describe("viewDeg", () => {
  it("is north up unless the city asks for its street grid", () => {
    expect(NORTH_UP_DEG).toBe(45);
    expect(viewDeg({ gridDeg: 28.9 })).toBe(45);
    expect(viewDeg({ gridDeg: 28.9, view: "north" })).toBe(45);
    expect(viewDeg({ gridDeg: 28.9, view: "grid" })).toBe(28.9);
  });

  it("puts north straight up for every real city not turned to its grid", () => {
    for (const city of Object.values(CITIES).filter((c) => !c.synthetic && c.view !== "grid")) {
      const proj = makeProjection(makeGeo(city.origin.lon, city.origin.lat, viewDeg(city), city.k));
      expect(Math.abs(proj.northDeg), city.id).toBeLessThan(1e-9);
    }
  });
});
