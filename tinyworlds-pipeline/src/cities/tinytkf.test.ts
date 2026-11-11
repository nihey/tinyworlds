import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { R } from "../render/palette.js";
import { treeRamp } from "../render/sprites.js";
import { tinytkf } from "./tinytkf.js";

const square = (lon: number, lat: number, half = 0.01) => ({
  type: "Polygon",
  coordinates: [
    [
      [lon - half, lat - half],
      [lon + half, lat - half],
      [lon + half, lat + half],
      [lon - half, lat + half],
      [lon - half, lat - half],
    ],
  ],
});

/** Ground metres between two lon/lat points, at Truckee's latitude. */
const metres = (a: number[], b: number[]): number =>
  Math.hypot((b[0] - a[0]) * Math.cos((39.33 * Math.PI) / 180) * 111195, (b[1] - a[1]) * 111195);

describe("Truckee's areas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinytkf-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, "areas.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { kind: "locality", name: "Truckee" },
          geometry: square(-120.2, 39.34),
        },
      ],
    }),
  );
  const { districts, hoods } = tinytkf.areas(dir);

  it("are the town alone: Overture outlines no neighbourhood there", () => {
    expect(districts.map((d) => d.name)).toEqual(["Truckee"]);
    expect(hoods).toEqual([]);
  });
});

describe("the Pioneer Monument", () => {
  const [monument] = tinytkf.statues;
  const top = (piece: { to: number }) => piece.to;

  it("stands its family on a pedestal as high as the snow of 1846–47 (22 feet)", () => {
    const pedestal = monument.pieces.filter((p) => p.ramp === "white");
    expect(Math.max(...pedestal.map(top))).toBeCloseTo(6.7, 1);
    // and the bronze family rises 17.5 feet above it
    const family = monument.pieces.filter((p) => p.ramp === "body");
    expect(Math.max(...family.map(top)) - Math.max(...pedestal.map(top))).toBeCloseTo(5.3, 1);
  });

  it("is a curated sight at the statue's own point, so it lights up", () => {
    const entry = tinytkf.curated.find((c) => c.n === "Pioneer Monument");
    expect(entry?.sight).toBe(true);
    expect(metres([entry!.lon, entry!.lat], [monument.lon, monument.lat])).toBeLessThan(30);
  });
});

describe("the hand-picked places", () => {
  it("light up structures only, never the lake, the park, the airport or a part of town", () => {
    const lit = new Set(tinytkf.curated.filter((c) => c.sight).map((c) => c.n));
    for (const area of [
      "Donner Lake",
      "Donner Memorial State Park",
      "Truckee Tahoe Airport",
      "Commercial Row",
    ])
      expect(lit.has(area), area).toBe(false);
    expect(lit.has("Truckee station")).toBe(true);
  });
});

describe("the planes", () => {
  const [landing, takeoff] = tinytkf.flights;
  const NW = [-120.153212, 39.3250465];
  const SE = [-120.1308841, 39.3150334];

  it("land on runway 29: in from the south-east, down on the runway between its ends", () => {
    const touchdown = landing.path.find((p) => p[2] === 0)!;
    const runway = metres(NW, SE);
    expect(metres(touchdown, NW) + metres(touchdown, SE)).toBeLessThan(runway + 5);
    expect(landing.path[0][0]).toBeGreaterThan(SE[0]);
    expect(landing.path[0][1]).toBeLessThan(SE[1]);
  });

  it("take off from it towards town, climbing", () => {
    const last = takeoff.path.at(-1)!;
    expect(last[0]).toBeLessThan(NW[0]);
    expect(last[2]).toBeGreaterThan(takeoff.path[1][2]);
  });
});

describe("the mountain pines", () => {
  it("are dark evergreens with some lighter aspens, and no snow on a summer map", () => {
    const ramps = new Set(Array.from({ length: 200 }, (_, seed) => treeRamp(seed, "montane")));
    expect(tinytkf.flora).toBe("montane");
    expect(ramps.has(R.pine)).toBe(true);
    expect(ramps.has(R.snow)).toBe(false);
  });
});
