import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readCell } from "../../../tinyworlds-frontend/src/walk/cell.ts";
import { decodeCell } from "../../../tinyworlds-frontend/src/walk/format.ts";
import { cellExists, parseWalkIndex } from "../../../tinyworlds-frontend/src/walk/walk-index.ts";
import { EARTH_RADIUS, makeGeo } from "../projection.js";
import { F_FLOATING, G, Roof } from "../scene/kinds.js";
import { writeScene, type Arr } from "../scene/store.js";
import { buildWalk, closeTunnels, deckAtFromScene, shapeOf, stampWalk } from "./build.js";
import type { Tunnel } from "./network.js";
import type { Segment } from "./segments.js";

const geo = makeGeo(-73.98566, 40.74844, 45, 2);
const { k, kz } = geo;
const S = Math.SQRT1_2;
const RAD = Math.PI / 180;

/** World metres → map px at ground (the inverse of mapToEN). */
function px(e: number, n: number): [number, number] {
  const p = e * S + n * S;
  const q = e * S - n * S;
  return [(p + q) * k, ((q - p) * k) / 2];
}
const flat = (pts: [number, number][]) => pts.flatMap(([e, n]) => px(e, n));
const rectEN = (e0: number, n0: number, e1: number, n1: number): [number, number][] => [
  [e0, n0],
  [e1, n0],
  [e1, n1],
  [e0, n1],
];
const toLonLat = (e: number, n: number): [number, number] => [
  geo.lon0 + e / (RAD * EARTH_RADIUS * Math.cos(geo.lat0 * RAD)),
  geo.lat0 + n / (RAD * EARTH_RADIUS),
];

/** Volumes: a building in square (0, 0), a bridge deck 20 m up over the water at e 400–600. */
function volumes(): Record<string, Arr> {
  const f32 = (a: number[]) => Float32Array.from(a);
  return {
    "vol.ringStart": Uint32Array.of(0, 1, 2),
    "vol.vertStart": Uint32Array.of(0, 4, 8),
    "vol.xy": f32([...flat(rectEN(10, 10, 30, 30)), ...flat(rectEN(400, 40, 600, 60))]),
    "vol.center": f32([...px(20, 20), ...px(500, 50)]),
    "vol.base": f32([0, 19 * kz]),
    "vol.top": f32([30 * kz, 20 * kz]),
    "vol.roofH": f32([0, 0]),
    "vol.roofShape": Uint8Array.of(Roof.Flat, Roof.Deck),
    "vol.wall": Uint8Array.of(3, 4),
    "vol.roof": Uint8Array.of(5, 6),
    "vol.glass": Uint8Array.of(0, 0),
    "vol.pattern": Uint8Array.of(0, 0),
    "vol.flags": Uint8Array.of(0, F_FLOATING),
    "vol.seed": Uint32Array.of(7, 8),
  };
}

/**
 * Land from −300 to 300 m both ways, water round it, ten piers in a row east of it (the hash ties
 * boats to the tenth); a street drawn by the map; the fog's grid keeps p and q within ±487 m, and
 * past q = 300 m it is where the map fades (2,000 m from the city: past fog.start, short of its end).
 */
function writeTestScene(dir: string, synthetic = false): void {
  const f32 = (a: number[]) => Float32Array.from(a);
  const piers = Array.from({ length: 10 }, (_, p) => rectEN(320, -200 + 40 * p, 360, -190 + 40 * p));
  const land = synthetic
    ? [rectEN(-300, -300, 388, 300), rectEN(600, -300, 700, 300)]
    : [rectEN(-300, -300, 300, 300)];
  const rings = [...land, ...piers];
  const streets: [number, number][] = synthetic
    ? [
        [-150, 50],
        [750, 50],
        [60, -100],
        [60, 100],
        [-40, 20],
        [40, 20],
      ]
    : [
        [-150, 50],
        [150, 50],
      ];
  const fogSide = 40;
  const fog = new Float32Array(fogSide * fogSide);
  for (let y = 0; y < fogSide; y++)
    for (let x = 0; x < fogSide; x++) if (-500 + (y + 0.5) * 25 > 300) fog[y * fogSide + x] = 2000;
  writeScene(
    dir,
    {
      ...volumes(),
      "ground.ringStart": Uint32Array.from(rings.map((_, r) => r).concat(rings.length)),
      "ground.vertStart": Uint32Array.from(rings.map((_, r) => r * 4).concat(rings.length * 4)),
      "ground.xy": f32(rings.flatMap(flat)),
      "ground.kind": Uint8Array.from([...land.map(() => G.Land), ...piers.map(() => G.Pier)]),
      "lines.vertStart": synthetic ? Uint32Array.of(0, 2, 4, 6) : Uint32Array.of(0, 2),
      "lines.xy": f32(flat(streets)),
      "lines.kind": synthetic ? Uint8Array.of(G.Road, G.RoadMajor, G.Path) : Uint8Array.of(G.Road),
      "lines.flags": synthetic ? Uint8Array.of(0, 0, 0) : Uint8Array.of(0),
      "lines.width": f32(synthetic ? [10, 14, 2] : [10]),
      "trees.xy": f32(px(50, 20)),
      "trees.kind": Uint8Array.of(1),
      "cab.start": Uint32Array.of(0),
      "cab.xyz": f32([]),
      "cab.kind": Uint8Array.of(),
      "fog.d": fog,
    },
    {
      geo,
      synthetic,
      fog: { p0: -500, q0: -500, cell: 25, cols: fogSide, rows: fogSide, start: 1500, end: 2700 },
    },
  );
}

const road = (
  id: string,
  pts: number[],
  connectors: [string, number][],
  extra: Partial<Segment> = {},
): Segment => ({
  id,
  subtype: "road",
  cls: "residential",
  subclass: null,
  name: id,
  width: null,
  flags: [],
  levels: [],
  access: [],
  connectors: connectors.map(([c, at]) => ({ id: c, at })),
  pts,
  ...extra,
});

const segments = (): Segment[] => [
  // a street along n = 50, cut in two at e = 0
  road(
    "Fiftieth",
    [-150, 50, 150, 50],
    [
      ["c1", 0],
      ["c2", 0.5],
      ["c3", 1],
    ],
  ),
  // a footbridge over the land along n = 150
  road(
    "Footbridge",
    [-200, 150, 200, 150],
    [
      ["f1", 0],
      ["f2", 1],
    ],
    { cls: "footway", flags: [{ values: ["is_bridge"], between: [0.25, 0.75] }] },
  ),
  // a tunnel from the land to a portal off the map
  road(
    "Way In",
    [-100, -100, 100, -100],
    [
      ["t0", 0],
      ["t1", 1],
    ],
  ),
  road(
    "Tunnel",
    [100, -100, 900, -100],
    [
      ["t1", 0],
      ["t2", 1],
    ],
    { flags: [{ values: ["is_tunnel"] }] },
  ),
  road(
    "Way Out",
    [900, -100, 1000, -100],
    [
      ["t2", 0],
      ["t3", 1],
    ],
  ),
  // a tunnel from the land to a portal on the map where it fades (q 424 m)
  road(
    "Way In Two",
    [-100, -200, 0, -200],
    [
      ["u0", 0],
      ["u1", 1],
    ],
  ),
  road(
    "Tunnel Two",
    [0, -200, 400, -200],
    [
      ["u1", 0],
      ["u2", 1],
    ],
    { flags: [{ values: ["is_tunnel"] }] },
  ),
  road(
    "Way Out Two",
    [400, -200, 500, -200],
    [
      ["u2", 0],
      ["u3", 1],
    ],
  ),
];

let root: string;
let sceneDir: string;
const quiet = (): void => {};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "walk-"));
  sceneDir = path.join(root, "scene");
  writeTestScene(sceneDir);
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function freshOut(name: string): string {
  const out = path.join(root, name);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ name: "tinyx", build: "b1" }));
  return out;
}
const manifest = (out: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")) as Record<string, unknown>;
const square = (out: string, i: number, j: number) =>
  decodeCell(new Uint8Array(gunzipSync(fs.readFileSync(path.join(out, "walk", "cells", `${i}_${j}.bin`)))));

describe("buildWalk", () => {
  it("connects a generated intersection, raises the drawn bridge and stops at the far shore", async () => {
    const scene = path.join(root, "synthetic");
    writeTestScene(scene, true);
    const out = freshOut("generated");
    await buildWalk({ out, scene, log: quiet });

    const cross = square(out, 0, 0).arrays;
    const at = Array.from(cross["node.xyz"]!).findIndex(
      (e, i, xyz) => i % 3 === 0 && e === 600 && xyz[i + 1] === 500,
    );
    expect(at).toBeGreaterThanOrEqual(0);
    const id = cross["node.id"]![at / 3];
    expect([...cross["st.a"]!, ...cross["st.b"]!].filter((node) => node === id)).toHaveLength(4);
    const sidewalk = Array.from(cross["wk.xyz"]!);
    expect(sidewalk.some((e, i) => e >= 75 && e <= 95 && i % 3 === 0 && sidewalk[i + 1] === 200)).toBe(true);
    expect(sidewalk.some((e, i) => e >= 305 && e <= 325 && i % 3 === 0 && sidewalk[i + 1] === 200)).toBe(
      true,
    );
    const approach = square(out, 1, 0).arrays;
    const nodes = new Map(
      Array.from(approach["node.id"]!, (id, i) => [
        id,
        Array.from(approach["node.xyz"]!.slice(i * 3, i * 3 + 3)),
      ]),
    );
    expect(
      Array.from(approach["st.a"]!, (id, i) => [nodes.get(id), nodes.get(approach["st.b"]![i])]),
    ).toContainEqual([
      [3880, 500, expect.any(Number)],
      [4000, 500, 200],
    ]);
    const span = square(out, 2, 0).arrays;
    expect(Math.max(...span["elev.xyz"]!.filter((_, i) => i % 3 === 2))).toBe(200);
    const shore = square(out, 3, 0).arrays;
    expect(Math.max(...shore["st.xyz"]!.filter((_, i) => i % 3 === 0))).toBe(7000);
  });

  it("writes an index the viewer reads, a file for every square it names, and squares that decode", async () => {
    const out = freshOut("one");
    await buildWalk({ out, scene: sceneDir, segments: segments(), log: quiet });

    const index = parseWalkIndex(JSON.parse(fs.readFileSync(path.join(out, "walk", "walk.json"), "utf8")));
    expect(index.cell).toBe(200);
    expect(index.geo).toEqual(geo);
    expect(index.sunDeg).toBe(254);

    const files = new Set(fs.readdirSync(path.join(out, "walk", "cells")));
    let bits = 0;
    for (let j = index.j0; j < index.j0 + index.rows; j++)
      for (let i = index.i0; i < index.i0 + index.cols; i++)
        if (cellExists(index, i, j)) {
          bits++;
          expect(files.has(`${i}_${j}.bin`)).toBe(true);
        }
    expect(bits).toBe(files.size);
    // the squares inside the fog's grid, and none beyond it
    expect(files.has("0_0.bin")).toBe(true);
    expect(files.has("2_0.bin")).toBe(true);
    expect(files.has("4_0.bin")).toBe(false);

    // square (0, 0): its building, its mask, its street with its nodes, in world decimetres
    const home = square(out, 0, 0);
    expect([home.i, home.j]).toEqual([0, 0]);
    const a = home.arrays;
    expect(Array.from(a["vol.top"]!)).toEqual([300]);
    expect(Array.from(a.mask!)).toEqual([0]);
    expect(a.shore).toBeUndefined();
    const st = a["st.xyz"]!;
    const ends = new Set<string>();
    for (let v = 0; v < st.length; v += 3) ends.add(`${st[v]},${st[v + 1]},${st[v + 2]}`);
    expect(ends.has("0,500,0")).toBe(true);
    expect(ends.has("1500,500,0")).toBe(true);
    const ids = new Set(a["node.id"]!);
    for (const id of [...a["st.a"]!, ...a["st.b"]!]) expect(ids.has(id)).toBe(true);
    expect(a["node.xyz"]!.length).toBe(a["node.id"]!.length * 3);

    // the footbridge is an elevated way the walk builds itself
    expect(a["elev.kind"]![0]).toBe(1);
    expect(Math.max(...a["elev.xyz"]!.filter((_, v) => v % 3 === 2))).toBe(65);
    expect(a["elev.own"]!.every((o) => o === 1)).toBe(true);

    // the pier square: water round the piers, boats at the tenth
    const piers = square(out, 1, 0).arrays;
    expect(piers.mask![0]).toBe(2);
    expect(piers.shore).toHaveLength(10000);
    expect(Array.from(piers["moor.kind"]!).every((m) => m === 0 || m === 1)).toBe(true);
    expect(piers["moor.xy"]!.length).toBe(12);
    // and the viewer reads both as they are written: every array where its counts say
    const read = readCell(square(out, 1, 0));
    expect(read.moorings).toHaveLength(6);
    const main = readCell(square(out, 0, 0));
    expect(main.elevated).toHaveLength(a["elev.kind"]!.length);
    expect(main.streets.length).toBe(a["st.a"]!.length);
    expect(main.nodes.length).toBe(a["node.id"]!.length);

    // the tunnel's far portal is off the map: closed there
    const tunnel = index.tunnels.find((t) => t.name === "Tunnel")!;
    expect(tunnel.b).toBeNull();
    expect(tunnel.a[0]).toBeCloseTo(100, 6);
    expect(tunnel.a[1]).toBeCloseTo(-100, 6);
  });

  it("closes a tunnel at a portal past where the fog starts, short of where the map ends", async () => {
    const out = freshOut("fading");
    await buildWalk({ out, scene: sceneDir, segments: segments(), log: quiet });
    const index = parseWalkIndex(JSON.parse(fs.readFileSync(path.join(out, "walk", "walk.json"), "utf8")));
    expect(index.tunnels.map((t) => t.name).sort()).toEqual(["Tunnel", "Tunnel Two"]);
    // its far end's square is on the map and written, but the tunnel is closed there
    expect(fs.existsSync(path.join(out, "walk", "cells", "2_-1.bin"))).toBe(true);
    const two = index.tunnels.find((t) => t.name === "Tunnel Two")!;
    expect(two.b).toBeNull();
    expect(two.a[0]).toBeCloseTo(0, 6);
    expect(two.a[1]).toBeCloseTo(-200, 6);
  });

  it("is what the deploy script's check takes the walk's version and its problems to be", async () => {
    const out = freshOut("deploy-check");
    await buildWalk({ out, scene: sceneDir, segments: segments(), log: quiet });
    const check = (await import("../../../deploy/walk-check.mjs")) as {
      walkVersion: (walk: string) => string;
      walkProblems: (data: string) => string[];
      manifestProblems: (here: string, there: string, field: string) => string[];
    };
    expect(check.walkVersion(path.join(out, "walk"))).toBe(manifest(out).walk);
    expect(check.walkProblems(out)).toEqual([]);
    // copied back and not stamped
    fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ ...manifest(out), walk: "old" }));
    expect(check.walkProblems(out).join()).toMatch(/names walk old/);
    stampWalk(out, quiet);
    // a square under another name (as many squares, not the same ones), one missing, then none
    const cells = path.join(out, "walk", "cells");
    const files = fs.readdirSync(cells);
    fs.renameSync(path.join(cells, files[0]), path.join(cells, "9999_9999.bin"));
    expect(check.walkProblems(out).join()).toMatch(
      new RegExp(`1 missing \\(${files[0].replace(".", "\\.")}\\), 1 not listed \\(9999_9999\\.bin\\)`),
    );
    fs.rmSync(path.join(cells, "9999_9999.bin"));
    expect(check.walkProblems(out).join()).toMatch(/squares, walk.json lists .*1 missing/);
    for (const f of files.slice(1)) fs.rmSync(path.join(cells, f));
    expect(check.walkProblems(out).join()).toMatch(/has no squares/);
    // a manifest that differs from the server's in its walk alone may go; in its render, not
    const here = path.join(out, "manifest.json");
    const there = path.join(out, "server-manifest.json");
    fs.writeFileSync(there, JSON.stringify({ ...manifest(out), walk: "other" }));
    expect(check.manifestProblems(here, there, "walk")).toEqual([]);
    fs.writeFileSync(there, JSON.stringify({ ...manifest(out), build: "another" }));
    expect(check.manifestProblems(here, there, "walk").join()).toMatch(/more than walk: build/);
    expect(check.manifestProblems(here, path.join(out, "none.json"), "walk").join()).toMatch(/no manifest/);
  });

  it("stamps the version of the walk folder already there", async () => {
    const out = freshOut("stamp");
    await buildWalk({ out, scene: sceneDir, segments: segments(), log: quiet });
    const version = manifest(out).walk;
    fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ ...manifest(out), walk: "old" }));
    stampWalk(out, quiet);
    expect(manifest(out).walk).toBe(version);
    fs.rmSync(path.join(out, "walk", "cells", "0_0.bin"));
    stampWalk(out, quiet);
    expect(manifest(out).walk).toMatch(/^[0-9a-f]{12}$/);
    expect(manifest(out).walk).not.toBe(version);
  });

  it("names the same version twice, and an update round a point keeps the rest", async () => {
    const one = freshOut("twice-a");
    const two = freshOut("twice-b");
    await buildWalk({ out: one, scene: sceneDir, segments: segments(), log: quiet });
    await buildWalk({ out: two, scene: sceneDir, segments: segments(), log: quiet });
    const version = manifest(one).walk;
    expect(version).toMatch(/^[0-9a-f]{12}$/);
    expect(manifest(two).walk).toBe(version);

    // a stale square far off and a changed one nearby: only the nearby one is written again
    const cells = path.join(two, "walk", "cells");
    fs.writeFileSync(path.join(cells, "0_0.bin"), "stale");
    fs.writeFileSync(path.join(cells, "-2_-2.bin"), "kept");
    const [lon, lat] = toLonLat(100, 100);
    await buildWalk({
      out: two,
      scene: sceneDir,
      segments: segments(),
      around: { lon, lat, radius: 50 },
      log: quiet,
    });
    expect(fs.readFileSync(path.join(cells, "-2_-2.bin"), "utf8")).toBe("kept");
    expect(fs.readFileSync(path.join(cells, "0_0.bin"))).toEqual(
      fs.readFileSync(path.join(one, "walk", "cells", "0_0.bin")),
    );
    fs.copyFileSync(path.join(one, "walk", "cells", "-2_-2.bin"), path.join(cells, "-2_-2.bin"));
    await buildWalk({
      out: two,
      scene: sceneDir,
      segments: segments(),
      around: { lon, lat, radius: 50 },
      log: quiet,
    });
    expect(manifest(two).walk).toBe(version);
  });

  it("leaves a folder without a manifest alone", async () => {
    const out = path.join(root, "bare");
    await buildWalk({ out, scene: sceneDir, segments: segments(), log: quiet });
    expect(fs.existsSync(path.join(out, "walk", "walk.json"))).toBe(true);
    expect(fs.existsSync(path.join(out, "manifest.json"))).toBe(false);
  });
});

describe("deckAtFromScene", () => {
  it("is the top of every floating deck holding the point, else none", () => {
    const deckAt = deckAtFromScene({ arrays: volumes(), meta: { geo } }, geo);
    expect(deckAt(500, 50)).toHaveLength(1);
    expect(deckAt(500, 50)[0]).toBeCloseTo(20, 4);
    expect(deckAt(401, 41)[0]).toBeCloseTo(20, 4);
    expect(deckAt(500, 70)).toEqual([]);
    // the building is no deck
    expect(deckAt(20, 20)).toEqual([]);
  });
});

describe("closeTunnels", () => {
  const t = (a: [number, number, number], b: [number, number, number] | null): Tunnel => ({
    name: "T",
    a,
    b,
    length: 100,
  });
  const onMap = (e: number): boolean => e < 500;

  it("keeps a tunnel with both portals on the map", () => {
    const both = t([0, 0, 1], [100, 0, 2]);
    expect(closeTunnels([both], onMap)).toEqual([both]);
  });

  it("closes the end off the map, the end on it first", () => {
    expect(closeTunnels([t([0, 0, 1], [900, 0, 2])], onMap)).toEqual([t([0, 0, 1], null)]);
    expect(closeTunnels([t([900, 0, 2], [0, 0, 1])], onMap)).toEqual([t([0, 0, 1], null)]);
  });

  it("drops a tunnel with no portal on the map", () => {
    expect(closeTunnels([t([900, 0, 1], [800, 0, 2]), t([700, 0, 1], null)], onMap)).toEqual([]);
  });
});

describe("shapeOf", () => {
  /** Flat e, n, z every 10 m along a path of corners. */
  const along = (corners: [number, number, number][]): number[] => {
    const out: number[] = [...corners[0]];
    for (let c = 1; c < corners.length; c++) {
      const [e0, n0, z0] = corners[c - 1];
      const [e1, n1, z1] = corners[c];
      const steps = Math.round(Math.hypot(e1 - e0, n1 - n0) / 10);
      for (let s = 1; s <= steps; s++)
        out.push(e0 + ((e1 - e0) * s) / steps, n0 + ((n1 - n0) * s) / steps, z0 + ((z1 - z0) * s) / steps);
    }
    return out;
  };

  it("keeps the ends of a straight way at one grade", () => {
    expect(
      shapeOf(
        along([
          [0, 0, 0],
          [100, 0, 0],
        ]),
      ),
    ).toEqual([0, 10]);
    expect(
      shapeOf(
        along([
          [0, 0, 0],
          [0, 100, 8],
        ]),
      ),
    ).toEqual([0, 10]);
  });

  it("keeps a corner and the foot and top of a ramp", () => {
    expect(
      shapeOf(
        along([
          [0, 0, 0],
          [100, 0, 0],
          [100, 50, 0],
        ]),
      ),
    ).toEqual([0, 10, 15]);
    expect(
      shapeOf(
        along([
          [0, 0, 0],
          [50, 0, 0],
          [130, 0, 6.4],
          [200, 0, 6.4],
        ]),
      ),
    ).toEqual([0, 5, 13, 20]);
  });

  it("follows a curve within a tenth of a metre", () => {
    const arc: number[] = [];
    // a highway's gentle curve, 5 km across, a vertex every 10 m
    for (let s = 0; s <= 600; s += 10) arc.push(5000 * Math.cos(s / 5000), 5000 * Math.sin(s / 5000), 0);
    const kept = shapeOf(arc);
    expect(kept.length).toBeLessThan(arc.length / 3);
    for (let k = 0; k + 1 < kept.length; k++) {
      const [a, b] = [kept[k], kept[k + 1]];
      for (let v = a + 1; v < b; v++) {
        // the dropped vertex's distance to the chord
        const [ae, an, be, bn] = [arc[a * 3], arc[a * 3 + 1], arc[b * 3], arc[b * 3 + 1]];
        const d =
          Math.abs((be - ae) * (an - arc[v * 3 + 1]) - (ae - arc[v * 3]) * (bn - an)) /
          Math.hypot(be - ae, bn - an);
        expect(d).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it("never drops a vertex that doubles back past either end of the line", () => {
    expect(shapeOf([0, 0, 0, 120, 0, 0, 100, 0, 0])).toEqual([0, 1, 2]);
    expect(shapeOf([0, 0, 0, -20, 0, 0, 100, 0, 0])).toEqual([0, 1, 2]);
  });

  it("keeps both vertices where who builds the deck changes", () => {
    const pts = along([
      [0, 0, 6.5],
      [100, 0, 6.5],
    ]);
    const own = Uint8Array.from({ length: 11 }, (_, k) => (k < 6 ? 1 : 0));
    expect(shapeOf(pts, own)).toEqual([0, 5, 6, 10]);
  });
});
