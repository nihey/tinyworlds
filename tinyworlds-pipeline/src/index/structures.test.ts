import { describe, expect, it } from "vitest";
import { makeGeo, makeProjection } from "../projection.js";
import type { Scene } from "../render/scene.js";
import type { Owners } from "../scene/owners.js";
import type { Candidate } from "./sights.js";
import { makeFinder, piecesOf } from "./structures.js";

const proj = makeProjection(makeGeo(-74, 40.7, 0, 2));

/** A square of `s` metres whose corner is at grid (p, q), as flat map px. */
function square(p: number, q: number, s: number): number[] {
  const out: number[] = [];
  for (const [dp, dq] of [
    [0, 0],
    [s, 0],
    [s, s],
    [0, s],
  ])
    out.push(...proj.gridToMap(p + dp, q + dq));
  return out;
}

interface FakeVol {
  ring: number[];
  seed: number;
  base?: number;
  top?: number;
  roofH?: number;
  /** Roof enum value: 0 flat, 2 pyramid, 3 dome */
  roofShape?: number;
}

/** Just the volumes, packed the way the scene packs them. */
function fakeScene(vols: FakeVol[]): Scene {
  const ringStart: number[] = [];
  const vertStart: number[] = [];
  const xy: number[] = [];
  const bbox: number[] = [];
  for (const [i, v] of vols.entries()) {
    ringStart.push(i);
    vertStart.push(xy.length / 2);
    xy.push(...v.ring);
    const xs = v.ring.filter((_, j) => j % 2 === 0);
    const ys = v.ring.filter((_, j) => j % 2 === 1);
    bbox.push(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  }
  ringStart.push(vols.length);
  vertStart.push(xy.length / 2);
  return {
    vol: {
      ringStart: Uint32Array.from(ringStart),
      vertStart: Uint32Array.from(vertStart),
      xy: Float32Array.from(xy),
      bbox: Float32Array.from(bbox),
      count: vols.length,
      seed: Uint32Array.from(vols.map((v) => v.seed)),
      base: Float32Array.from(vols.map((v) => v.base ?? 0)),
      top: Float32Array.from(vols.map((v) => v.top ?? 30)),
      roofH: Float32Array.from(vols.map((v) => v.roofH ?? 0)),
      roofShape: Uint8Array.from(vols.map((v) => v.roofShape ?? 0)),
      center: Float32Array.from(
        vols.flatMap((_, i) => [
          (bbox[i * 4] + bbox[i * 4 + 2]) / 2,
          (bbox[i * 4 + 1] + bbox[i * 4 + 3]) / 2,
        ]),
      ),
    },
  } as unknown as Scene;
}

/** A candidate standing at grid (p, q). */
function at(p: number, q: number, more: Partial<Candidate> = {}): Candidate {
  const [lon, lat] = proj.toLonLat(...proj.gridToMap(p, q));
  return { n: "x", t: "landmark", r: 34, lon, lat, order: 0, src: "poi", ...more };
}

const scene = fakeScene([
  { ring: square(0, 0, 20), seed: 7 },
  { ring: square(20, 0, 20), seed: 7 },
  { ring: square(500, 500, 20), seed: 9 },
  { ring: square(-200, 0, 10), seed: 11 }, // a deck piece of a bridge
  { ring: square(-400, 0, 4), seed: 12, top: 50 }, // the statue
  { ring: square(300, 0, 30), seed: 21 }, // stands of a stadium, west side
  { ring: square(300, 60, 30), seed: 22 }, // and east side
]);
const owners: Owners = {
  bridges: [{ name: "Ed Koch Queensboro Bridge Upper Level", vols: [3] }],
  statues: [
    {
      ...((): { lon: number; lat: number } => {
        const [lon, lat] = proj.toLonLat(...proj.gridToMap(-398, 2));
        return { lon, lat };
      })(),
      vols: [4],
    },
  ],
};
const stands = [{ ring: [...square(290, -10, 110)], seeds: [21, 22] }];
const find = makeFinder(scene, owners, proj, stands);

describe("makeFinder", () => {
  it("finds a building and all its parts from a point inside it", () => {
    expect(find(at(5, 5))).toEqual({ key: "b7", vols: [0, 1], seed: 7 });
  });

  it("lets a point just outside a footprint snap to it, but not one further out", () => {
    expect(find(at(-3, 10))?.key).toBe("b7");
    expect(find(at(-6, 10))).toBeNull();
  });

  it("finds a building entry's own building by its seed, wherever its point is", () => {
    expect(find(at(450, 450, { src: "building", seed: 9 }))).toEqual({ key: "b9", vols: [2], seed: 9 });
  });

  it("finds a bridge by its name inside the roads' names", () => {
    expect(find(at(0, -300, { t: "bridge", n: "Queensboro Bridge" }))).toEqual({
      key: "bridge:queensboro bridge",
      vols: [3],
    });
    expect(find(at(0, -300, { t: "bridge", n: "Manhattan Bridge" }))).toBeNull();
  });

  it("takes in the pieces of a bridge filed under other roads' names, near it only", () => {
    const bridgeScene = fakeScene([
      { ring: square(0, 0, 10), seed: 1 }, // 0: "Manhattan Bridge Bike Path"
      { ring: square(10, 0, 10), seed: 2 }, // 1: "Canal Street (lower level)": a tower on the bridge
      { ring: square(3000, 0, 10), seed: 3 }, // 2: "Canal Street (lower level)" somewhere else
    ]);
    const bridgeOwners: Owners = {
      bridges: [
        { name: "Manhattan Bridge Bike Path", vols: [0] },
        { name: "Canal Street (lower level)", vols: [1, 2] },
      ],
      statues: [],
    };
    const findBridge = makeFinder(bridgeScene, bridgeOwners, proj, [], {
      "manhattan bridge": ["Canal Street (lower level)"],
    });
    expect(findBridge(at(0, -100, { t: "bridge", n: "Manhattan Bridge" }))?.vols).toEqual([0, 1]);
  });

  it("makes a bridge with no piece of its own name of its listed roads' pieces near its point", () => {
    const bridgeScene = fakeScene([
      { ring: square(0, 0, 10), seed: 1 }, // 0: "Smithfield Street", on the bridge
      { ring: square(100, 0, 10), seed: 2 }, // 1: "Smithfield Street", the bridge's far end
      { ring: square(3000, 0, 10), seed: 3 }, // 2: "Smithfield Street" over a railway, far off
    ]);
    const bridgeOwners: Owners = {
      bridges: [{ name: "Smithfield Street", vols: [0, 1, 2] }],
      statues: [],
    };
    const findBridge = makeFinder(bridgeScene, bridgeOwners, proj, [], {
      "smithfield street bridge": ["Smithfield Street"],
    });
    const bridge = at(50, 5, { t: "bridge", n: "Smithfield Street Bridge" });
    expect(findBridge(bridge)).toEqual({ key: "bridge:smithfield street bridge", vols: [0, 1] });
    // without the city listing the road, it is no sight, as before
    expect(makeFinder(bridgeScene, bridgeOwners, proj, [], {})(bridge)).toBeNull();
  });

  it("finds the statue from a point beside it", () => {
    expect(find(at(-380, 2))?.key).toBe("statue:0");
  });

  it("lights a stadium's stands from a point on its field", () => {
    expect(find(at(340, 40))).toEqual({ key: "b" + (21).toString(36), vols: [5, 6], seed: 21 });
  });

  it("gives the same stadium whichever stand a point lands on", () => {
    expect(find(at(310, 70))?.key).toBe("b" + (21).toString(36));
  });
});

describe("piecesOf", () => {
  it("reads a volume's footprint, underside and top", () => {
    const s = fakeScene([{ ring: square(0, 0, 10), seed: 1, base: 4, top: 20, roofH: 6 }]);
    const [piece] = piecesOf(s, [0]);
    expect(piece.lift).toBe(4);
    expect(piece.rise).toBe(26);
    expect(piece.rings).toHaveLength(1);
    expect(piece.rings[0]).toHaveLength(8);
  });

  /** The width in map px of a piece's first ring. */
  const width = (ring: number[]): number => {
    const xs = ring.filter((_, j) => j % 2 === 0);
    return Math.max(...xs) - Math.min(...xs);
  };

  it("narrows a spire towards its tip, as the renderer draws it", () => {
    const s = fakeScene([{ ring: square(0, 0, 20), seed: 1, top: 100, roofH: 80, roofShape: 2 }]);
    const pieces = piecesOf(s, [0]);
    const walls = pieces[0];
    expect(walls.rise).toBe(100);
    const tip = pieces[pieces.length - 1];
    expect(tip.rise).toBe(180);
    expect(width(tip.rings[0])).toBeLessThan(width(walls.rings[0]) * 0.2);
    // every step of the roof is no wider than the one below it
    for (let i = 2; i < pieces.length; i++)
      expect(width(pieces[i].rings[0])).toBeLessThanOrEqual(width(pieces[i - 1].rings[0]) + 1e-9);
  });

  it("rounds a dome off: still wide halfway up, narrow at the top", () => {
    const s = fakeScene([{ ring: square(0, 0, 20), seed: 1, top: 30, roofH: 20, roofShape: 3 }]);
    const pieces = piecesOf(s, [0]);
    const full = width(pieces[0].rings[0]);
    const half = pieces.find((p) => p.lift >= 40)!;
    expect(width(half.rings[0])).toBeGreaterThan(full * 0.8);
    expect(pieces[pieces.length - 1].rise).toBe(50);
  });
});
