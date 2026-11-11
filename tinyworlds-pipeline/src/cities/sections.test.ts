import { describe, expect, it } from "vitest";
import type { AreaFeature } from "../geom/geojson.js";
import { aroundPoints, sectioned } from "./sections.js";

const square = (lon: number, lat: number, half = 0.005): number[][][][] => [
  [
    [
      [lon - half, lat - half],
      [lon + half, lat - half],
      [lon + half, lat + half],
      [lon - half, lat + half],
      [lon - half, lat - half],
    ],
  ],
];
const area = (props: Record<string, unknown>, lon = -80, lat = 40.44): AreaFeature => ({
  properties: props,
  polygons: square(lon, lat),
});
const bbox = { west: -80.1, south: 40.4, east: -79.9, north: 40.5 };

describe("sectioned", () => {
  const { districts, hoods } = sectioned({
    neighbourhoods: [
      area({ hood: "Central Business District" }),
      area({ hood: "North Shore" }, -80.01, 40.45),
      area({ hood: "Allegheny West" }, -80.02, 40.45),
      area({ hood: "Bluff" }, -79.99, 40.437),
      area({ hood: "Far Away" }, -81, 41),
    ],
    nameOf: (f) => String(f.properties.hood),
    sections: { Downtown: ["Central Business District"], "North Side": ["North Shore", "Allegheny West"] },
    fallback: "Pittsburgh",
    towns: [area({ name: "Millvale" }, -79.97, 40.48)],
    bbox,
  });

  it("outlines the neighbourhoods on the map, filed under their part of town", () => {
    expect(hoods.map((h) => [h.name, h.district])).toEqual([
      ["Central Business District", "Downtown"],
      ["North Shore", "North Side"],
      ["Allegheny West", "North Side"],
      ["Bluff", "Pittsburgh"],
    ]);
  });

  it("makes each part of town a district of its neighbourhoods, and each town one", () => {
    expect(districts.map((d) => [d.name, d.polygons.length])).toEqual([
      ["Downtown", 1],
      ["North Side", 2],
      ["Pittsburgh", 1],
      ["Millvale", 1],
    ]);
  });
});

describe("aroundPoints", () => {
  // two named points a kilometre apart, west to east, at Colorado Springs' latitude
  const lat = 38.83;
  const km = 1000 / (111195 * Math.cos((lat * Math.PI) / 180));
  const districts = aroundPoints(
    [
      { name: "Downtown", lon: -104.82, lat },
      { name: "Shooks Run", lon: -104.82 + km, lat },
      { name: "Far", lon: -104.7, lat },
    ],
    800,
  );
  const inside = (lon: number, lat: number): string[] =>
    districts
      .filter(({ polygons }) => {
        const ring = polygons[0][0];
        let hit = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
        }
        return hit;
      })
      .map((d) => d.name);

  it("gives each point the ground nearer it than any other", () => {
    expect(inside(-104.82 + 0.3 * km, lat)).toEqual(["Downtown"]);
    expect(inside(-104.82 + 0.6 * km, lat)).toEqual(["Shooks Run"]);
    expect(inside(-104.7, lat + 0.005)).toEqual(["Far"]);
  });

  it("reaches no farther than the radius", () => {
    // 900 m north of Downtown: nobody's
    expect(inside(-104.82, lat + 900 / 111195)).toEqual([]);
    expect(inside(-104.82, lat + 700 / 111195)).toEqual(["Downtown"]);
  });

  it("closes every ring", () => {
    for (const { polygons } of districts) expect(polygons[0][0].at(-1)).toEqual(polygons[0][0][0]);
  });
});
