import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SECTIONS as PHL_SECTIONS, tinyphl } from "./tinyphl.js";
import { SECTIONS as PIT_SECTIONS } from "./tinypit.js";

const square = (lon: number, lat: number, half = 0.004) => ({
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

describe("Philadelphia's areas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinyphl-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const collection = (features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });
  const feature = (properties: Record<string, string>, lon: number, lat: number) => ({
    type: "Feature",
    properties,
    geometry: square(lon, lat),
  });
  fs.writeFileSync(
    path.join(dir, "areas.geojson"),
    collection([
      feature({ kind: "locality", name: "Philadelphia" }, -75.16, 39.95),
      feature({ kind: "locality", name: "Camden" }, -75.12, 39.94),
      feature({ kind: "hood", name: "South Philadelphia", district: "Philadelphia" }, -75.17, 39.92),
      feature({ kind: "hood", name: "Cooper Grant", district: "Camden" }, -75.124, 39.947),
    ]),
  );
  fs.writeFileSync(
    path.join(dir, "neighborhoods.geojson"),
    collection([
      feature({ MAPNAME: "Rittenhouse", LISTNAME: "Rittenhouse" }, -75.172, 39.949),
      feature({ MAPNAME: "Old City", LISTNAME: "Old City" }, -75.144, 39.952),
      feature({ MAPNAME: "Spruce Hill", LISTNAME: "Spruce Hill" }, -75.21, 39.952),
      feature({ MAPNAME: "Riverfront", LISTNAME: "Riverfront" }, -75.137, 39.96),
      // north of the map
      feature({ MAPNAME: "Chestnut Hill", LISTNAME: "Chestnut Hill" }, -75.21, 40.07),
    ]),
  );
  const { districts, hoods } = tinyphl.areas(dir);

  it("outlines the city's neighbourhoods in their parts of town, and Camden's from Overture", () => {
    expect(hoods.map((h) => [h.name, h.district])).toEqual([
      ["Rittenhouse", "Center City"],
      ["Old City", "Center City"],
      ["Spruce Hill", "University City"],
      ["Riverfront", "Philadelphia"],
      ["Cooper Grant", "Camden"],
    ]);
  });

  it("makes the parts of town and the towns across the rivers its districts", () => {
    expect(districts.map((d) => d.name)).toEqual([
      "Center City",
      "University City",
      "Philadelphia",
      "Camden",
    ]);
  });
});

describe("the parts of town", () => {
  it("name each neighbourhood once, in both cities", () => {
    for (const sections of [PHL_SECTIONS, PIT_SECTIONS]) {
      const names = Object.values(sections).flat();
      expect(names.length).toBeGreaterThan(50);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
