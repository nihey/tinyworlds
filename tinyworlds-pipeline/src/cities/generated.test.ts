import { describe, expect, it } from "vitest";
import { EARTH_RADIUS } from "../projection.js";
import { disc, insideRing } from "../scene/medieval.js";
import type { SyntheticBuilder, SyntheticPlace } from "../scene/synthetic.js";
import { lonLatOf } from "./generated.js";
import { tinykingslanding } from "./tinykingslanding.js";
import { tinywesteros } from "./tinywesteros.js";
import { tinywinterfell } from "./tinywinterfell.js";
import type { City } from "./types.js";

/** Run a city's generator and keep what it drew. */
function run(city: City): {
  log: number[];
  places: SyntheticPlace[];
  hoods: string[];
  routes: number;
  limits: number[][];
} {
  const log: number[] = [];
  const places: SyntheticPlace[] = [];
  const hoods: string[] = [];
  const limits: number[][] = [];
  let routes = 0;
  const builder: SyntheticBuilder = {
    ground: (kind, rings) => void log.push(kind, ...(rings as (number | number[])[]).flat()),
    line: (kind, width, path) => void log.push(kind, width, ...path),
    volume: (corners, height, base) => void log.push(height, base, ...corners),
    prism: (p, q, radius, sides, height, base) => void log.push(height, base, ...disc(p, q, radius, sides)),
    tree: (p, q) => void log.push(p, q),
    limits: (ring) => void limits.push(ring),
    place: (place) => void places.push(place),
    hood: (name) => void hoods.push(name),
    route: () => void routes++,
  };
  city.synthetic!(builder);
  return { log, places, hoods, routes, limits };
}

describe.each([
  ["tinywinterfell", tinywinterfell, 1000],
  ["tinykingslanding", tinykingslanding, 100000],
  ["tinywesteros", tinywesteros, 400000],
] as [string, City, number][])("%s", (_id, city, least) => {
  const first = run(city);

  it("is the same place every time it is generated", () => {
    const second = run(city);
    expect(second.log.length).toBe(first.log.length);
    expect(second.log).toEqual(first.log);
    expect(second.places).toEqual(first.places);
  });

  it("draws a world of some size, with numbers that are all finite", () => {
    expect(first.log.length).toBeGreaterThan(least);
    expect(first.log.every(Number.isFinite)).toBe(true);
  });

  it("names its places once each, inside the map", () => {
    const names = first.places.map((place) => `${place.t}:${place.n}`);
    expect(new Set(names).size).toBe(names.length);
    expect(first.limits).toHaveLength(1);
    for (const place of first.places)
      expect(insideRing(first.limits[0], place.p, place.q), place.n).toBe(true);
    expect(first.hoods.length).toBeGreaterThan(2);
  });

  it("is credited as a fan work and has no flights", () => {
    expect(city.attribution.join(" ")).toMatch(/fan-made/);
    expect(city.attribution.join(" ")).toMatch(/George R\. R\. Martin/);
    expect(city.flights).toEqual([]);
  });
});

describe("lonLatOf", () => {
  const perDegree = (Math.PI / 180) * EARTH_RADIUS;

  it("reads p as north and q as east unless the grid is turned", () => {
    const flat = lonLatOf(1000, 250);
    expect(flat.lat).toBeCloseTo(1000 / perDegree, 9);
    expect(flat.lon).toBeCloseTo(250 / perDegree, 9);
  });

  it("puts a world drawn north-up back on the compass", () => {
    // p = (e + n)/√2, q = (e − n)/√2
    const e = 3000;
    const n = -1200;
    const turned = lonLatOf((e + n) * Math.SQRT1_2, (e - n) * Math.SQRT1_2, 45);
    expect(turned.lon).toBeCloseTo(e / perDegree, 9);
    expect(turned.lat).toBeCloseTo(n / perDegree, 9);
  });

  it("opens tinywesteros a little north-east of King's Landing, at the origin of its sketch", () => {
    expect(tinywesteros.betaDeg).toBe(45);
    expect(tinywesteros.start.lon).toBeGreaterThan(0);
    expect(tinywesteros.start.lon).toBeLessThan(0.01);
    expect(tinywesteros.start.lat).toBeGreaterThan(0);
    expect(tinywesteros.start.lat).toBeLessThan(0.01);
  });
});
