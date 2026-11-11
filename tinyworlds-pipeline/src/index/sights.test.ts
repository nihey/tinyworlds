import { describe, expect, it } from "vitest";
import type { Scene } from "../render/scene.js";
import { resolveSights, toSightFile, type Candidate, type Found } from "./sights.js";

describe("toSightFile", () => {
  it("says how near the viewer a sight stands and where its sign hangs", () => {
    // one 10 × 10 px footprint, 40 px tall
    const scene = {
      vol: {
        ringStart: Uint32Array.from([0, 1]),
        vertStart: Uint32Array.from([0, 4]),
        xy: Float32Array.from([100, 200, 110, 200, 110, 210, 100, 210]),
        bbox: Float32Array.from([100, 200, 110, 210]),
        count: 1,
        seed: Uint32Array.from([3]),
        base: Float32Array.from([0]),
        top: Float32Array.from([40]),
        roofH: Float32Array.from([0]),
      },
    } as unknown as Scene;
    const file = toSightFile(
      [
        {
          key: "b3",
          vols: [0],
          n: "Tower",
          t: "landmark",
          b: "Manhattan",
          lon: -73.123456,
          lat: 40.654321,
          r: 50,
          order: 0,
        },
      ],
      scene,
    );
    expect(file.sights).toHaveLength(1);
    const [sight] = file.sights;
    expect(sight).toMatchObject({
      id: "b3",
      n: "Tower",
      t: "landmark",
      b: "Manhattan",
      lon: -73.12346,
      lat: 40.65432,
    });
    expect(sight.front).toBe(210);
    expect(sight.anchor[1]).toBe(160);
    expect(sight.rings).toHaveLength(1);
  });
});

const at = { lon: -74, lat: 40.7 };
const cand = (c: Partial<Candidate> & Pick<Candidate, "n" | "src">): Candidate => ({
  t: "landmark",
  r: 34,
  order: 0,
  ...at,
  ...c,
});
/** Every candidate whose name is in `keys` is found on that key. */
const finder =
  (keys: Record<string, Found>) =>
  (c: Candidate): Found | null =>
    keys[c.n] ?? null;
const none = (): undefined => undefined;

describe("resolveSights", () => {
  it("makes one sight of several entries on one building, named by the curated one", () => {
    const met: Found = { key: "b1", vols: [1, 2], seed: 1 };
    const sights = resolveSights(
      [
        cand({ n: "The Met", src: "poi", t: "museum", order: 1 }),
        cand({ n: "Metropolitan Museum of Art", src: "curated", t: "museum", r: 89, order: 0 }),
      ],
      finder({ "The Met": met, "Metropolitan Museum of Art": met }),
      none,
    );
    expect(sights).toHaveLength(1);
    expect(sights[0]).toMatchObject({
      key: "b1",
      n: "Metropolitan Museum of Art",
      t: "museum",
      vols: [1, 2],
    });
  });

  it("never lets a point of interest rename a building that has a name of its own", () => {
    const wtc: Found = { key: "b5", vols: [5], seed: 5 };
    const sights = resolveSights(
      [
        cand({ n: "America's Response Monument", src: "poi", order: 2 }),
        cand({ n: "One World Trade Center", src: "curated", r: 95, order: 0 }),
      ],
      finder({ "America's Response Monument": wtc, "One World Trade Center": wtc }),
      (seed) => (seed === 5 ? "One World Trade Center" : undefined),
    );
    expect(sights.map((s) => s.n)).toEqual(["One World Trade Center"]);
  });

  it("names a building by its own name over a misplaced listing, as a building", () => {
    const tower: Found = { key: "b9", vols: [9], seed: 9 };
    const sights = resolveSights(
      [cand({ n: "Union Station, Washington DC", src: "poi", t: "station", lon: -73.99, lat: 40.76 })],
      finder({ "Union Station, Washington DC": tower }),
      (seed) => (seed === 9 ? "555TEN" : undefined),
    );
    expect(sights[0]).toMatchObject({ n: "555TEN", t: "building", lon: -73.99, lat: 40.76 });
  });

  it("settles a tie between listings by the index's own order", () => {
    const shop: Found = { key: "b3", vols: [3], seed: 3 };
    const sights = resolveSights(
      [
        cand({ n: "Under My Skin", src: "poi", order: 7 }),
        cand({ n: "Wild_About_CheerFit", src: "poi", order: 3 }),
      ],
      finder({ "Under My Skin": shop, Wild_About_CheerFit: shop }),
      none,
    );
    expect(sights.map((s) => s.n)).toEqual(["Wild_About_CheerFit"]);
  });

  it("leaves out an entry that stands on nothing", () => {
    expect(resolveSights([cand({ n: "Bowling Green station", src: "station" })], () => null, none)).toEqual(
      [],
    );
  });

  it("takes its point from the entry that named it", () => {
    const b: Found = { key: "b4", vols: [4], seed: 4 };
    const sights = resolveSights(
      [
        cand({ n: "Some listing", src: "poi", lon: -73.9, lat: 40.1, order: 1 }),
        cand({ n: "Flatiron Building", src: "curated", r: 91, lon: -73.98, lat: 40.74, order: 0 }),
      ],
      finder({ "Some listing": b, "Flatiron Building": b }),
      none,
    );
    expect(sights[0]).toMatchObject({ lon: -73.98, lat: 40.74 });
  });

  it("orders sights by the rank of the entry that named them", () => {
    const sights = resolveSights(
      [
        cand({ n: "Low", src: "poi", r: 34, order: 0 }),
        cand({ n: "High", src: "building", r: 70, order: 1 }),
      ],
      finder({ Low: { key: "b1", vols: [1] }, High: { key: "b2", vols: [2] } }),
      none,
    );
    expect(sights.map((s) => s.n)).toEqual(["High", "Low"]);
  });
});
