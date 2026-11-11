import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { G, PAINT_RANK } from "../scene/kinds.js";
import type { Polygons } from "./types.js";
import { PARTS, tinycos } from "./tinycos.js";

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

/** Is the point inside the first ring of any of the polygons? */
const holds = (polygons: Polygons, lon: number, lat: number): boolean =>
  polygons.some(([ring]) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  });

describe("Colorado Springs' areas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinycos-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, "areas.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { kind: "locality", name: "Manitou Springs" },
          geometry: square(-104.918, 38.858, 0.01),
        },
        {
          type: "Feature",
          properties: { kind: "locality", name: "Air Force Academy" },
          geometry: square(-104.87, 39.0, 0.03),
        },
        {
          type: "Feature",
          properties: { kind: "locality", name: "Colorado Springs" },
          geometry: square(-104.82, 38.86, 0.1),
        },
        {
          type: "Feature",
          properties: { kind: "hood", name: "Old Colorado City", district: "Colorado Springs" },
          geometry: square(-104.863, 38.848),
        },
      ],
    }),
  );
  const { districts, hoods } = tinycos.areas(dir);
  /** The district the index would file a point under: the last one listed that holds it. */
  const districtAt = (lon: number, lat: number): string =>
    districts.findLast((d) => holds(d.polygons, lon, lat))?.name ?? "";

  it("lists the city first, so the towns and the parts of town win over it", () => {
    expect(districts.map((d) => d.name)).toEqual([
      "Colorado Springs",
      "Manitou Springs",
      "Air Force Academy",
      ...PARTS.map((p) => p.name),
    ]);
  });

  it("files the sights under the part of town round them, or the city beyond them", () => {
    expect(districtAt(-104.82962, 38.82948)).toBe("Downtown"); // the Olympic museum
    expect(districtAt(-104.82175, 38.84786)).toBe("Historic Uptown"); // Shove Chapel
    expect(districtAt(-104.85062, 38.79126)).toBe("Broadmoor"); // the Broadmoor
    expect(districtAt(-104.86858, 38.85113)).toBe("Old Colorado City"); // its old city hall
    expect(districtAt(-104.8904, 39.0084)).toBe("Air Force Academy"); // the Cadet Chapel
    expect(districtAt(-104.78, 38.94)).toBe("Colorado Springs"); // Briargate, far from any point
  });

  it("outlines Overture's neighbourhoods", () => {
    expect(hoods.map((h) => [h.name, h.district])).toEqual([["Old Colorado City", "Colorado Springs"]]);
  });
});

describe("Colorado Springs' sights", () => {
  it("puts every curated place inside the map's box", () => {
    const { west, south, east, north } = tinycos.bbox;
    for (const c of tinycos.curated) {
      expect(c.lon > west && c.lon < east && c.lat > south && c.lat < north, c.n).toBe(true);
    }
  });

  it("keys its articles and aliases by lower-case name", () => {
    for (const key of [
      ...Object.keys(tinycos.sights?.wikipedia ?? {}),
      ...Object.keys(tinycos.sights?.aliases ?? {}),
    ])
      expect(key).toBe(key.toLowerCase());
  });

  it("paints its bare rock as red sandstone, in rock's place in the paint order", () => {
    expect(tinycos.ground.land).toEqual({ bare_rock: G.RedRock, rock: G.RedRock });
    expect(PAINT_RANK[G.RedRock]).toBeGreaterThan(PAINT_RANK[G.Rock]);
    expect(PAINT_RANK[G.RedRock]).toBeLessThan(PAINT_RANK[G.Rock + 1]);
  });
});
