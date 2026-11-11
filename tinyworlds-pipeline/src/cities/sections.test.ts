import { describe, expect, it } from "vitest";
import type { AreaFeature } from "../geom/geojson.js";
import { sectioned } from "./sections.js";

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
