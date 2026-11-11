import { describe, expect, it } from "vitest";
import { comparePlaces } from "./build.js";

const place = (n: string, r: number, b?: string, lon = -74, lat = 40.7) =>
  ({ n, t: "station", r, b, lon, lat }) as const;

describe("comparePlaces", () => {
  it("lists the best-ranked first, then by name", () => {
    const list = [place("B", 30), place("A", 30), place("Z", 90)];
    expect([...list].sort(comparePlaces).map((p) => p.n)).toEqual(["Z", "A", "B"]);
  });

  it("orders places of one rank and name the same way whatever order they came in", () => {
    const a = place("Broadway", 30, "Queens", -73.8, 40.76);
    const b = place("Broadway", 30, "Brooklyn", -73.9, 40.68);
    const c = place("Broadway", 30, "Brooklyn", -73.95, 40.7);
    const one = [a, b, c].sort(comparePlaces);
    const two = [c, a, b].sort(comparePlaces);
    expect(two).toEqual(one);
  });
});
