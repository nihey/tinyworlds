import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { laAreas } from "./tinylax.areas.js";
import { HOLLYWOOD_SIGN } from "./tinylax.landmarks.js";

/** A square area of the County's table, `half` degrees each way from a point. */
const area = (props: Record<string, string>, lon: number, lat: number, half = 0.005) => ({
  type: "Feature",
  properties: props,
  geometry: {
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
  },
});

describe("laAreas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinylax-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const city = (name: string, lon: number, lat: number) =>
    area({ CITY_TYPE: "City", LCITY: name, COMMUNITY: " " }, lon, lat);
  const community = (name: string, lon: number, lat: number) =>
    area({ CITY_TYPE: "City", LCITY: "Los Angeles", COMMUNITY: name }, lon, lat);
  const county = (name: string, lon: number, lat: number) =>
    area({ CITY_TYPE: "Unincorporated", LCITY: "Unincorporated", COMMUNITY: name }, lon, lat, 0.001);
  fs.writeFileSync(
    path.join(dir, "csa.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        community("Hollywood", -118.33, 34.1),
        community("Silverlake", -118.27, 34.09),
        community("Del Rey", -118.43, 33.99),
        city("Santa Monica", -118.49, 34.02),
        county("Marina del Rey", -118.45, 33.98),
        // a county pocket inside the community of the same name
        county("Del Rey", -118.42, 33.98),
        // reaches into the box, but its middle is far outside it
        city("Pasadena", -118.13, 34.16),
      ],
    }),
  );
  const { districts, hoods } = laAreas(dir, "Los Angeles", {
    west: -118.53,
    south: 33.92,
    east: -118.15,
    north: 34.165,
  });

  it("files the City of Los Angeles as one district, and every other city and county community as its own", () => {
    expect(districts.map((d) => d.name)).toEqual([
      "Los Angeles",
      "Santa Monica",
      "Pasadena",
      "Marina del Rey",
    ]);
    // Hollywood, Silver Lake and Del Rey with the county pocket that shares its name
    expect(districts[0].polygons).toHaveLength(4);
  });

  it("outlines the communities under the city, and the other districts under their own names", () => {
    expect(hoods.map((h) => [h.name, h.district, h.listed?.type ?? "hood"])).toEqual([
      ["Hollywood", "Los Angeles", "hood"],
      ["Silver Lake", "Los Angeles", "hood"],
      ["Del Rey", "Los Angeles", "hood"],
      ["Santa Monica", "Los Angeles", "borough"],
      ["Marina del Rey", "Los Angeles", "borough"],
    ]);
    expect(hoods.find((h) => h.name === "Del Rey")?.polygons).toHaveLength(2);
  });
});

describe("the Hollywood Sign", () => {
  const pieces = HOLLYWOOD_SIGN.pieces;
  const boxes = pieces.map((piece) => {
    if (!("hq" in piece)) throw new Error("the letters are boxes");
    return piece;
  });

  it("is white boxes, standing on the ground, as tall as the real letters", () => {
    for (const box of boxes) {
      expect(box.ramp).toBe("white");
      expect(box.from).toBeGreaterThanOrEqual(0);
      expect(box.to).toBeGreaterThan(box.from);
      expect(box.to).toBeLessThanOrEqual(13.7 + 1e-9);
    }
    expect(Math.min(...boxes.map((b) => b.from))).toBe(0);
    expect(Math.max(...boxes.map((b) => b.to))).toBeCloseTo(13.7);
  });

  it("reads west to east along a line about as long as the real one, centred on its spot", () => {
    const west = Math.min(...boxes.map((b) => b.dq - b.hq));
    const east = Math.max(...boxes.map((b) => b.dq + b.hq));
    expect(east - west).toBeGreaterThan(100);
    expect(east - west).toBeLessThan(115);
    expect(west + east).toBeCloseTo(0);
    for (const box of boxes) expect(box.dp).toBe(0);
  });

  it("leaves a gap between each of its nine letters", () => {
    // the strip of the line each box covers, merged: one run per letter
    const spans = boxes.map((b) => [b.dq - b.hq, b.dq + b.hq]).sort((a, b) => a[0] - b[0]);
    const letters: number[][] = [];
    for (const [a, b] of spans) {
      const last = letters[letters.length - 1];
      if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
      else letters.push([a, b]);
    }
    expect(letters).toHaveLength(9);
  });
});
