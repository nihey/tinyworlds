import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { tinymke } from "./tinymke.js";

const feature = (properties: Record<string, string>, lon: number, lat: number) => ({
  type: "Feature",
  properties,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [lon, lat],
        [lon + 0.002, lat],
        [lon + 0.002, lat + 0.002],
        [lon, lat],
      ],
    ],
  },
});

describe("Milwaukee's areas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinymke-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const collection = (features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });

  fs.writeFileSync(
    path.join(dir, "neighborhoods.geojson"),
    collection([
      feature({ NEIGHBORHD: "JUNEAU TOWN" }, -87.905, 43.04),
      feature({ NEIGHBORHD: "KILBOURN TOWN" }, -87.92, 43.04),
      feature({ NEIGHBORHD: "WALKER'S POINT" }, -87.915, 43.025),
      feature({ NEIGHBORHD: "MILLER VALLEY" }, -87.955, 43.04),
      feature({ NEIGHBORHD: "RIVERWEST" }, -87.901, 43.07),
      feature({ NEIGHBORHD: "NEW COELN" }, -87.9, 42.93),
    ]),
  );
  fs.writeFileSync(
    path.join(dir, "areas.geojson"),
    collection([
      feature({ kind: "locality", name: "Milwaukee" }, -87.93, 43.03),
      feature({ kind: "locality", name: "West Milwaukee" }, -87.985, 43.014),
      feature({ kind: "hood", name: "Deer District" }, -87.917, 43.045),
    ]),
  );

  it("uses the City's outlines and keeps neighboring municipalities distinct", () => {
    const { hoods, districts } = tinymke.areas(dir);
    expect(hoods.map(({ name, district }) => [name, district])).toEqual([
      ["Juneau Town", "Downtown"],
      ["Kilbourn Town", "Downtown"],
      ["Walker's Point", "Walker's Point"],
      ["Miller Valley", "Near West Side"],
      ["Riverwest", "Riverwest"],
    ]);
    expect(districts.map(({ name }) => name)).toEqual([
      "Downtown",
      "Walker's Point",
      "Near West Side",
      "Riverwest",
      "West Milwaukee",
    ]);
  });
});
