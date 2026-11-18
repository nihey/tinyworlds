import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SECTIONS, tinysfo } from "./tinysfo.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinysfo-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const area = (properties: Record<string, string>, lon: number, lat: number) => ({
  type: "Feature",
  properties,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [lon - 0.001, lat - 0.001],
        [lon + 0.001, lat - 0.001],
        [lon + 0.001, lat + 0.001],
        [lon - 0.001, lat + 0.001],
        [lon - 0.001, lat - 0.001],
      ],
    ],
  },
});

function writeAreas(file: string, features: ReturnType<typeof area>[]): void {
  fs.writeFileSync(path.join(dir, file), JSON.stringify({ type: "FeatureCollection", features }));
}

describe("San Francisco's areas", () => {
  it("places DataSF neighborhoods in their districts and keeps Alcatraz and nearby towns from Overture", () => {
    writeAreas("neighborhoods.geojson", [
      area({ nhood: "Financial District/South Beach" }, -122.4, 37.795),
      area({ nhood: "Japantown" }, -122.431, 37.785),
      area({ nhood: "Outer Richmond" }, -122.49, 37.777),
      area({ nhood: "Excelsior" }, -122.43, 37.724),
      area({ nhood: "Out of bounds" }, -122.7, 37.8),
    ]);
    writeAreas("areas.geojson", [
      area({ kind: "locality", name: "Daly City" }, -122.46, 37.706),
      area({ kind: "locality", name: "Alcatraz Island" }, -122.423, 37.827),
      area({ kind: "locality", name: "San Francisco" }, -122.45, 37.76),
    ]);

    const { districts, hoods } = tinysfo.areas(dir);
    expect(hoods.map(({ name, district }) => [name, district])).toEqual([
      ["Financial District/South Beach", "Downtown"],
      ["Japantown", "Western Addition"],
      ["Outer Richmond", "Richmond"],
      ["Excelsior", "Southern Neighborhoods"],
    ]);
    expect(districts.map(({ name }) => name)).toEqual([
      "Downtown",
      "Western Addition",
      "Richmond",
      "Southern Neighborhoods",
      "Daly City",
      "Alcatraz Island",
    ]);
  });

  it("groups all 41 DataSF analysis neighborhoods exactly once", () => {
    const names = Object.values(SECTIONS).flat();
    expect(names).toHaveLength(41);
    expect(new Set(names).size).toBe(41);
  });
});
