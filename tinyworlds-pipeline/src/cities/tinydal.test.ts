import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { tinydal } from "./tinydal.js";
import { huntHillArch, REUNION_BALL } from "./tinydal.landmarks.js";

/** A square area as overtureAreas writes it, `half` degrees each way from a point. */
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

describe("Dallas' areas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinydal-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, "areas.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        area({ kind: "locality", name: "Dallas" }, -96.8, 32.78, 0.1),
        area({ kind: "locality", name: "Highland Park" }, -96.79, 32.83),
        area({ kind: "hood", name: "Downtown PID", district: "Dallas" }, -96.798, 32.78),
        area(
          { kind: "hood", name: "Klyde Warren Park-Arts District PID", district: "Dallas" },
          -96.8,
          32.788,
        ),
        area({ kind: "hood", name: "Bonton", district: "Dallas" }, -96.749, 32.745),
        area({ kind: "hood", name: "Wilds of Africa", district: "Dallas" }, -96.816, 32.737),
        area({ kind: "hood", name: "Roseland Commmunity", district: "Dallas" }, -96.79, 32.799),
      ],
    }),
  );
  const { districts, hoods } = tinydal.areas(dir);

  it("files the towns as districts", () => {
    expect(districts.map((d) => d.name)).toEqual(["Dallas", "Highland Park"]);
  });

  it("names the improvement districts for their neighbourhoods and leaves out the zoo's exhibits and doubles", () => {
    expect(hoods.map((h) => [h.name, h.district])).toEqual([
      ["Downtown", "Dallas"],
      ["Arts District", "Dallas"],
      ["Bonton", "Dallas"],
    ]);
  });
});

describe("the Margaret Hunt Hill Bridge's arch", () => {
  for (const beta of [0.2, 45.3]) {
    const arch = huntHillArch(beta);
    const boxes = arch.pieces.map((piece) => {
      if (!("hq" in piece)) throw new Error("the arch is boxes");
      return piece;
    });
    const along = (b: (typeof boxes)[number]) => Math.hypot(b.dp, b.dq) * Math.sign(b.dp + b.dq);

    it(`is white boxes rising from the deck to 120 m over a 183 m span (grid at ${beta}°)`, () => {
      for (const box of boxes) {
        expect(box.ramp).toBe("white");
        expect(box.from).toBeGreaterThanOrEqual(0);
        expect(box.to).toBeGreaterThan(box.from);
      }
      expect(Math.min(...boxes.map((b) => b.from))).toBe(0);
      expect(Math.max(...boxes.map((b) => b.to))).toBeCloseTo(121.4, 0);
      const span = Math.max(...boxes.map(along)) - Math.min(...boxes.map(along));
      expect(span).toBeGreaterThan(175);
      expect(span).toBeLessThan(185);
    });

    it(`is highest in the middle and the same on both sides (grid at ${beta}°)`, () => {
      const top = boxes.reduce((a, b) => (b.to > a.to ? b : a));
      expect(Math.abs(along(top))).toBeLessThan(3);
      const first = boxes[0];
      const last = boxes[boxes.length - 1];
      expect(first.dp + last.dp).toBeCloseTo(0);
      expect(first.dq + last.dq).toBeCloseTo(0);
      expect(first.to).toBeCloseTo(last.to);
    });
  }

  it("runs along the bridge, east-north-east, whichever way the grid is turned", () => {
    // on a compass grid (p north, q east) the bridge runs mostly east
    const [west, east] = [huntHillArch(0).pieces[0], huntHillArch(0).pieces.at(-1)!];
    const bearing = (Math.atan2(east.dq - west.dq, east.dp - west.dp) * 180) / Math.PI;
    expect(bearing).toBeGreaterThan(60);
    expect(bearing).toBeLessThan(75);
  });
});

describe("Reunion Tower's ball", () => {
  it("steps in under the dome the data draws from 137 m up", () => {
    const pieces = REUNION_BALL.pieces;
    expect(Math.max(...pieces.map((p) => p.to))).toBe(137);
    const radii = [...pieces].sort((a, b) => b.to - a.to).map((p) => ("r" in p ? p.r : 0));
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThan(radii[i - 1]);
  });
});
