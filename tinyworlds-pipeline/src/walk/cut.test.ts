import { describe, expect, it } from "vitest";
import { makeGeo } from "../projection.js";
import { G, L_BRIDGE } from "../scene/kinds.js";
import type { Arr } from "../scene/store.js";
import { cutScene, squareArrays } from "./cut.js";
import { mapToEN } from "./grid.js";

const geo = makeGeo(-73.98566, 40.74844, 45, 2);
const { k, kz } = geo;
const S = Math.SQRT1_2;

/** World metres → map px at ground (the inverse of mapToEN), for building a scene by hand. */
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

function scene() {
  const f32 = (a: number[]) => Float32Array.from(a);
  const a: Record<string, Arr> = {
    // two volumes: one square footprint in square (0,0), one centred in (1,0)
    "vol.ringStart": Uint32Array.of(0, 1, 2),
    "vol.vertStart": Uint32Array.of(0, 4, 8),
    "vol.xy": f32([...flat(rectEN(10, 10, 30, 30)), ...flat(rectEN(250, 20, 270, 40))]),
    "vol.center": f32([...px(20, 20), ...px(260, 30)]),
    "vol.base": f32([0, 0]),
    "vol.top": f32([30 * kz, 12 * kz]),
    "vol.roofH": f32([0, 2 * kz]),
    "vol.roofShape": Uint8Array.of(0, 1),
    "vol.wall": Uint8Array.of(3, 4),
    "vol.roof": Uint8Array.of(5, 6),
    "vol.glass": Uint8Array.of(0, 1),
    "vol.pattern": Uint8Array.of(0, 2),
    "vol.flags": Uint8Array.of(0, 0),
    "vol.seed": Uint32Array.of(7, 8),
    "vol.ridge": Uint8Array.of(0, 0),
    "vol.area": f32([400, 400]),
    // one land polygon across squares (0,0) and (1,0)
    "ground.ringStart": Uint32Array.of(0, 1),
    "ground.vertStart": Uint32Array.of(0, 4),
    "ground.xy": f32(flat(rectEN(100, 50, 300, 150))),
    "ground.bbox": f32([0, 0, 0, 0]),
    "ground.kind": Uint8Array.of(G.Land),
    // a bridge (left out) and a street from (-50, 100) to (250, 100)
    "lines.vertStart": Uint32Array.of(0, 2, 4),
    "lines.xy": f32([
      ...flat([
        [0, 0],
        [100, 0],
      ]),
      ...flat([
        [-50, 100],
        [250, 100],
      ]),
    ]),
    "lines.bbox": f32([0, 0, 0, 0, 0, 0, 0, 0]),
    "lines.kind": Uint8Array.of(G.Road, G.Road),
    "lines.flags": Uint8Array.of(L_BRIDGE, 0),
    "lines.width": f32([12, 9.5]),
    "trees.xy": f32(px(5, 395)),
    "trees.kind": Uint8Array.of(2),
    // a cable of three vertices whose middle one is in square (1,0), 40 m up at the middle
    "cab.start": Uint32Array.of(0, 3),
    "cab.xyz": f32([...px(150, 20), 0, ...px(220, 20), 40 * kz, ...px(290, 20), 0]),
    "cab.kind": Uint8Array.of(1),
    "cab.bbox": f32([0, 0, 0, 0]),
    "fog.d": new Float32Array(0),
  };
  return { arrays: a, meta: { geo } };
}

describe("cutScene", () => {
  const squares = cutScene(scene(), geo);

  it("agrees with mapToEN", () => {
    const [e, n] = mapToEN(geo, ...px(123.4, -56.7));
    expect(e).toBeCloseTo(123.4, 6);
    expect(n).toBeCloseTo(-56.7, 6);
  });

  it("files volumes by their centres, in local dm, with heights in dm", () => {
    const a = squares.get("0_0")!.vol;
    const b = squares.get("1_0")!.vol;
    expect(a.rings).toEqual([1]);
    expect(a.verts).toEqual([4]);
    expect(a.xy).toEqual([100, 100, 300, 100, 300, 300, 100, 300]);
    expect(a.top).toEqual([300]);
    expect(a.roofH).toEqual([0]);
    expect(a.seed).toEqual([7]);
    expect(b.xy).toEqual([500, 200, 700, 200, 700, 400, 500, 400]);
    expect(b.top).toEqual([120]);
    expect(b.roofH).toEqual([20]);
    expect(b.wall).toEqual([4]);
  });

  it("splits the ground polygon between its two squares", () => {
    const a = squares.get("0_0")!.gnd;
    const b = squares.get("1_0")!.gnd;
    expect(a.kind).toEqual([G.Land]);
    expect(a.order).toEqual([0]);
    expect(a.xy).toEqual([1000, 500, 2000, 500, 2000, 1500, 1000, 1500]);
    expect(b.xy).toEqual([0, 500, 1000, 500, 1000, 1500, 0, 1500]);
  });

  it("leaves bridge lines out and clips a plain line to every square it crosses, grown by 30 m", () => {
    for (const sq of squares.values()) expect(sq.way.width.every((w) => w === 95)).toBe(true);
    const a = squares.get("0_0")!.way;
    const b = squares.get("1_0")!.way;
    expect(a.verts).toEqual([2]);
    expect(a.order).toEqual([1]);
    expect(a.kind).toEqual([G.Road]);
    expect(a.xy).toEqual([-300, 1000, 2300, 1000]);
    expect(b.xy).toEqual([-300, 1000, 500, 1000]);
    // no way anywhere for the bridge (order 0)
    for (const sq of squares.values()) expect(sq.way.order.includes(0)).toBe(false);
  });

  it("files trees by position and cables by their middle vertex", () => {
    const t = squares.get("0_1")!.tree;
    expect(t.xy).toEqual([50, 1950]);
    expect(t.kind).toEqual([2]);
    const c = squares.get("1_0")!.cab;
    expect(c.verts).toEqual([3]);
    expect(c.kind).toEqual([1]);
    // world dm, the middle vertex 40 m up
    expect(c.xyz.slice(0, 3)).toEqual([1500, 200, 0]);
    expect(c.xyz.slice(3, 6)).toEqual([2200, 200, 400]);
    expect(squares.get("0_0")!.cab.verts).toEqual([]);
  });

  it("masks each square: land where the polygon is, water elsewhere", () => {
    expect(squares.get("0_0")!.mask[0]).toBe(2);
    expect(squares.get("0_1")!.mask).toEqual(Uint8Array.of(1));
  });

  it("keeps only the squares asked for", () => {
    const only = cutScene(scene(), geo, (i, j) => i === 1 && j === 0);
    expect([...only.keys()]).toEqual(["1_0"]);
    expect(only.get("1_0")!.vol.rings).toEqual([1]);
  });
});

describe("squareArrays", () => {
  it("gives typed arrays for what is there and leaves the rest out", () => {
    const arrays = squareArrays(cutScene(scene(), geo).get("1_0")!);
    expect(arrays["vol.xy"]).toBeInstanceOf(Int16Array);
    expect(arrays["cab.xyz"]).toBeInstanceOf(Int32Array);
    expect(arrays["vol.seed"]).toBeInstanceOf(Uint32Array);
    expect(arrays["tree.xy"]).toBeUndefined();
    expect(arrays.mask).toBeInstanceOf(Uint8Array);
  });
});
