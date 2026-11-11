import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { tinycvg } from "./tinycvg.js";

const square = (lon: number, lat: number, half = 0.005) => ({
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

describe("Cincinnati's areas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinycvg-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const feature = (kind: string, name: string, district?: string) => ({
    type: "Feature",
    properties: { kind, name, ...(district ? { district } : {}) },
    geometry: square(-84.51, 39.11),
  });
  fs.writeFileSync(
    path.join(dir, "areas.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        feature("locality", "Cincinnati"),
        feature("locality", "Covington"),
        feature("hood", "Over-the-Rhine", "Cincinnati"),
        feature("hood", "Clifton Heights", "Cincinnati"),
        feature("hood", "Clifton Heights–University Heights–Fairview", "Cincinnati"),
        feature("hood", "The Heights", "Cincinnati"),
        feature("hood", "Mainstrasse Village", "Covington"),
      ],
    }),
  );
  const { districts, hoods } = tinycvg.areas(dir);

  it("files the towns on both banks as districts", () => {
    expect(districts.map((d) => d.name)).toEqual(["Cincinnati", "Covington"]);
  });

  it("outlines the neighbourhoods, not the umbrella areas drawn over them", () => {
    expect(hoods.map((h) => [h.name, h.district])).toEqual([
      ["Over-the-Rhine", "Cincinnati"],
      ["Clifton Heights", "Cincinnati"],
      ["Mainstrasse Village", "Covington"],
    ]);
  });
});

describe("the Roebling Bridge's cables", () => {
  it("are strung between its two towers, one main span apart", () => {
    const [span] = tinycvg.suspensions ?? [];
    const lat0 = (span.a[1] * Math.PI) / 180;
    const east = (span.b[0] - span.a[0]) * Math.cos(lat0) * 111195;
    const north = (span.b[1] - span.a[1]) * 111195;
    // its main span is 322 m; the scene strings cables over 250 to 1,600 m
    expect(Math.hypot(east, north)).toBeGreaterThan(300);
    expect(Math.hypot(east, north)).toBeLessThan(340);
    expect(span.top).toBeLessThan(65);
  });
});

describe("the riverboat", () => {
  it("sails a route of its own, from Newport downstream", () => {
    const [boat] = tinycvg.boats ?? [];
    expect(boat.path.length).toBeGreaterThan(2);
    expect(boat.path[0][0]).toBeGreaterThan(boat.path.at(-1)![0]);
  });
});
