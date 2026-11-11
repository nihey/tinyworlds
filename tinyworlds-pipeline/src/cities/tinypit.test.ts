import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { tinypit } from "./tinypit.js";

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

describe("Pittsburgh's areas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinypit-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  const collection = (features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });
  fs.writeFileSync(
    path.join(dir, "areas.geojson"),
    collection([
      {
        type: "Feature",
        properties: { kind: "locality", name: "Pittsburgh" },
        geometry: square(-80, 40.44, 0.05),
      },
      {
        type: "Feature",
        properties: { kind: "locality", name: "Millvale" },
        geometry: square(-79.97, 40.48),
      },
      // Overture's own neighbourhoods are not used: the city's are
      {
        type: "Feature",
        properties: { kind: "hood", name: "Mexican War Streets Historic District", district: "Pittsburgh" },
        geometry: square(-80.01, 40.455),
      },
    ]),
  );
  fs.writeFileSync(
    path.join(dir, "neighborhoods.geojson"),
    collection(
      [
        ["Central Business District", -80.0, 40.441],
        ["North Shore", -80.01, 40.447],
        ["Central Oakland", -79.955, 40.437],
        ["Squirrel Hill North", -79.925, 40.44],
        ["Mount Washington", -80.008, 40.43],
      ].map(([hood, lon, lat]) => ({
        type: "Feature",
        properties: { hood },
        geometry: square(lon as number, lat as number),
      })),
    ),
  );
  const { districts, hoods } = tinypit.areas(dir);

  it("outlines the city's own neighbourhoods, in their parts of town", () => {
    expect(hoods.map((h) => [h.name, h.district])).toEqual([
      ["Central Business District", "Downtown"],
      ["North Shore", "North Side"],
      ["Central Oakland", "Oakland"],
      ["Squirrel Hill North", "East End"],
      ["Mount Washington", "Mount Washington"],
    ]);
  });

  it("makes the parts of town and the boroughs round the city its districts, not the city itself", () => {
    expect(districts.map((d) => d.name)).toEqual([
      "Downtown",
      "North Side",
      "Oakland",
      "East End",
      "Mount Washington",
      "Millvale",
    ]);
  });
});

describe("Pittsburgh's bridges", () => {
  it("lists the roads the bridges without pieces of their own name are filed under", () => {
    const bridges = tinypit.sights?.bridges ?? {};
    expect(Object.keys(bridges).sort()).toEqual([
      "fort pitt bridge",
      "hot metal bridge",
      "smithfield street bridge",
    ]);
    const curated = new Set(tinypit.curated.filter((c) => c.t === "bridge").map((c) => c.n.toLowerCase()));
    for (const name of Object.keys(bridges)) expect(curated.has(name)).toBe(true);
  });
});
