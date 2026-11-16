/**
 * The scene (typed arrays in map px) cut into the walk's squares of 200 m, in the walk's units:
 * local dm (i16 decimetres from the square's south-west corner) for geometry that belongs to a
 * square, world dm (i32 from the projection origin) for cables, which cross squares. `cutScene`
 * keeps plain JS arrays per square; `squareArrays` turns one into what the encoder takes.
 */
import { L_BRIDGE, PAINT_RANK } from "../scene/kinds.js";
import type { Arr } from "../scene/store.js";
import { clipPolyline, splitByCells } from "./clip.js";
import type { CellArrays } from "./format.js";
import { CELL, cellKey, type Geo } from "./grid.js";
import { maskOf, type MaskPolygon } from "./mask.js";

/** How far a way runs past its square's edge, so the viewer can draw a street's width across it. */
const WAY_MARGIN = 30;

export interface SceneSquare {
  i: number;
  j: number;
  vol: {
    rings: number[];
    verts: number[];
    xy: number[];
    base: number[];
    top: number[];
    roofH: number[];
    roofShape: number[];
    wall: number[];
    roof: number[];
    glass: number[];
    pattern: number[];
    flags: number[];
    seed: number[];
  };
  gnd: { kind: number[]; order: number[]; rings: number[]; verts: number[]; xy: number[] };
  way: { kind: number[]; width: number[]; order: number[]; verts: number[]; xy: number[] };
  tree: { xy: number[]; kind: number[] };
  cab: { verts: number[]; kind: number[]; xyz: number[] };
  mask: Uint8Array;
}

interface Pending extends SceneSquare {
  polys: MaskPolygon[];
  runs: { kind: number; width: number; order: number; pts: number[] }[];
}

const dm = (metres: number): number => Math.round(metres * 10);

export function cutScene(
  scene: { arrays: Record<string, Arr>; meta: Record<string, unknown> },
  geo: Geo,
  keep: (i: number, j: number) => boolean = () => true,
): Map<string, SceneSquare> {
  const A = scene.arrays;
  const { k, kz } = geo;
  const beta = (geo.betaDeg * Math.PI) / 180;
  const sinB = Math.sin(beta);
  const cosB = Math.cos(beta);
  // mapToEN, inlined as two functions so the hot loops allocate nothing
  const east = (x: number, y: number): number => {
    const p = (x / k - (2 * y) / k) / 2;
    const q = (x / k + (2 * y) / k) / 2;
    return p * sinB + q * cosB;
  };
  const north = (x: number, y: number): number => {
    const p = (x / k - (2 * y) / k) / 2;
    const q = (x / k + (2 * y) / k) / 2;
    return p * cosB - q * sinB;
  };

  const squares = new Map<string, Pending>();
  const square = (i: number, j: number): Pending | null => {
    if (!keep(i, j)) return null;
    const key = cellKey(i, j);
    let s = squares.get(key);
    if (!s) {
      s = {
        i,
        j,
        vol: {
          rings: [],
          verts: [],
          xy: [],
          base: [],
          top: [],
          roofH: [],
          roofShape: [],
          wall: [],
          roof: [],
          glass: [],
          pattern: [],
          flags: [],
          seed: [],
        },
        gnd: { kind: [], order: [], rings: [], verts: [], xy: [] },
        way: { kind: [], width: [], order: [], verts: [], xy: [] },
        tree: { xy: [], kind: [] },
        cab: { verts: [], kind: [], xyz: [] },
        mask: new Uint8Array(0),
        polys: [],
        runs: [],
      };
      squares.set(key, s);
    }
    return s;
  };

  // ---- volumes: filed under the square of their centre
  const vRing = A["vol.ringStart"];
  const vVert = A["vol.vertStart"];
  const vXY = A["vol.xy"];
  const vCenter = A["vol.center"];
  const volumes = vRing.length - 1;
  for (let v = 0; v < volumes; v++) {
    const i = Math.floor(east(vCenter[v * 2], vCenter[v * 2 + 1]) / CELL);
    const j = Math.floor(north(vCenter[v * 2], vCenter[v * 2 + 1]) / CELL);
    const s = square(i, j);
    if (!s) continue;
    const o = s.vol;
    o.rings.push(vRing[v + 1] - vRing[v]);
    for (let r = vRing[v]; r < vRing[v + 1]; r++) {
      o.verts.push(vVert[r + 1] - vVert[r]);
      for (let p = vVert[r]; p < vVert[r + 1]; p++) {
        o.xy.push(
          dm(east(vXY[p * 2], vXY[p * 2 + 1]) - i * CELL),
          dm(north(vXY[p * 2], vXY[p * 2 + 1]) - j * CELL),
        );
      }
    }
    o.base.push(dm(A["vol.base"][v] / kz));
    o.top.push(dm(A["vol.top"][v] / kz));
    o.roofH.push(dm(A["vol.roofH"][v] / kz));
    o.roofShape.push(A["vol.roofShape"][v]);
    o.wall.push(A["vol.wall"][v]);
    o.roof.push(A["vol.roof"][v]);
    o.glass.push(A["vol.glass"][v]);
    o.pattern.push(A["vol.pattern"][v]);
    o.flags.push(A["vol.flags"][v]);
    o.seed.push(A["vol.seed"][v]);
  }

  // ---- ground: each polygon cut along the squares it crosses
  const gRing = A["ground.ringStart"];
  const gVert = A["ground.vertStart"];
  const gXY = A["ground.xy"];
  const polygons = gRing.length - 1;
  const cellsOf = (lo: number, hi: number): [number, number] => {
    const a = Math.floor(lo / CELL);
    return [a, Math.max(a, Math.ceil(hi / CELL) - 1)];
  };
  for (let g = 0; g < polygons; g++) {
    const rings: number[][] = [];
    let e0 = Infinity;
    let e1 = -Infinity;
    let n0 = Infinity;
    let n1 = -Infinity;
    for (let r = gRing[g]; r < gRing[g + 1]; r++) {
      const ring: number[] = [];
      for (let p = gVert[r]; p < gVert[r + 1]; p++) {
        const e = east(gXY[p * 2], gXY[p * 2 + 1]);
        const n = north(gXY[p * 2], gXY[p * 2 + 1]);
        ring.push(e, n);
        if (e < e0) e0 = e;
        if (e > e1) e1 = e;
        if (n < n0) n0 = n;
        if (n > n1) n1 = n;
      }
      rings.push(ring);
    }
    if (rings.length === 0) continue;
    const [i0, i1] = cellsOf(e0, e1);
    const [j0, j1] = cellsOf(n0, n1);
    const kind = A["ground.kind"][g];
    if (i0 === i1 && j0 === j1) {
      square(i0, j0)?.polys.push({ kind, order: g, rings });
      continue;
    }
    for (const [key, pieces] of splitByCells(rings, i0, i1, j0, j1)) {
      const [i, j] = key.split("_").map(Number);
      square(i, j)?.polys.push({ kind, order: g, rings: pieces });
    }
  }

  // ---- lines: bridges are left to the elevated ways; the rest is clipped to each square
  // they touch, grown by WAY_MARGIN
  const lVert = A["lines.vertStart"];
  const lXY = A["lines.xy"];
  const lines = A["lines.kind"].length;
  const touched = new Set<number>();
  for (let l = 0; l < lines; l++) {
    if (A["lines.flags"][l] & L_BRIDGE) continue;
    const pts: number[] = [];
    for (let p = lVert[l]; p < lVert[l + 1]; p++)
      pts.push(east(lXY[p * 2], lXY[p * 2 + 1]), north(lXY[p * 2], lXY[p * 2 + 1]));
    touched.clear();
    for (let p = 0; p + 3 < pts.length; p += 2) {
      const [i0, i1] = cellsOf(
        Math.min(pts[p], pts[p + 2]) - WAY_MARGIN,
        Math.max(pts[p], pts[p + 2]) + WAY_MARGIN,
      );
      const [j0, j1] = cellsOf(
        Math.min(pts[p + 1], pts[p + 3]) - WAY_MARGIN,
        Math.max(pts[p + 1], pts[p + 3]) + WAY_MARGIN,
      );
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) touched.add((i + 32768) * 65536 + (j + 32768));
    }
    const width = dm(A["lines.width"][l]);
    const kind = A["lines.kind"][l];
    for (const key of touched) {
      const i = Math.floor(key / 65536) - 32768;
      const j = (key % 65536) - 32768;
      const s = square(i, j);
      if (!s) continue;
      const box = {
        e0: i * CELL - WAY_MARGIN,
        n0: j * CELL - WAY_MARGIN,
        e1: (i + 1) * CELL + WAY_MARGIN,
        n1: (j + 1) * CELL + WAY_MARGIN,
      };
      for (const run of clipPolyline(pts, box)) s.runs.push({ kind, width, order: l, pts: run });
    }
  }

  // ---- trees
  const treeXY = A["trees.xy"];
  const trees = A["trees.kind"].length;
  for (let t = 0; t < trees; t++) {
    const e = east(treeXY[t * 2], treeXY[t * 2 + 1]);
    const n = north(treeXY[t * 2], treeXY[t * 2 + 1]);
    const i = Math.floor(e / CELL);
    const j = Math.floor(n / CELL);
    const s = square(i, j);
    if (!s) continue;
    s.tree.xy.push(dm(e - i * CELL), dm(n - j * CELL));
    s.tree.kind.push(A["trees.kind"][t]);
  }

  // ---- cables: filed under their middle vertex, in world dm
  const cStart = A["cab.start"];
  const cXYZ = A["cab.xyz"];
  const cables = A["cab.kind"].length;
  for (let c = 0; c < cables; c++) {
    const a = cStart[c];
    const count = cStart[c + 1] - a;
    const mid = a + (count >> 1);
    const i = Math.floor(east(cXYZ[mid * 3], cXYZ[mid * 3 + 1]) / CELL);
    const j = Math.floor(north(cXYZ[mid * 3], cXYZ[mid * 3 + 1]) / CELL);
    const s = square(i, j);
    if (!s) continue;
    s.cab.verts.push(count);
    s.cab.kind.push(A["cab.kind"][c]);
    for (let p = a; p < a + count; p++) {
      s.cab.xyz.push(
        dm(east(cXYZ[p * 3], cXYZ[p * 3 + 1])),
        dm(north(cXYZ[p * 3], cXYZ[p * 3 + 1])),
        dm(cXYZ[p * 3 + 2] / kz),
      );
    }
  }

  // ---- finish: localize ground and ways, paint each square's mask
  const out = new Map<string, SceneSquare>();
  for (const [key, s] of squares) {
    const oe = s.i * CELL;
    const on = s.j * CELL;
    for (const poly of s.polys) {
      s.gnd.kind.push(poly.kind);
      s.gnd.order.push(poly.order);
      s.gnd.rings.push(poly.rings.length);
      for (const ring of poly.rings) {
        s.gnd.verts.push(ring.length / 2);
        for (let p = 0; p < ring.length; p += 2) s.gnd.xy.push(dm(ring[p] - oe), dm(ring[p + 1] - on));
      }
    }
    for (const run of s.runs) {
      s.way.kind.push(run.kind);
      s.way.width.push(run.width);
      s.way.order.push(run.order);
      s.way.verts.push(run.pts.length / 2);
      for (let p = 0; p < run.pts.length; p += 2) s.way.xy.push(dm(run.pts[p] - oe), dm(run.pts[p + 1] - on));
    }
    s.mask = maskOf(s.polys, s.i, s.j, PAINT_RANK);
    out.set(key, {
      i: s.i,
      j: s.j,
      vol: s.vol,
      gnd: s.gnd,
      way: s.way,
      tree: s.tree,
      cab: s.cab,
      mask: s.mask,
    });
  }
  return out;
}

const clamp16 = (v: number): number => (v < -32768 ? -32768 : v > 32767 ? 32767 : v);

/** A square as the encoder takes it; arrays with nothing in them are left out, `mask` is always there. */
export function squareArrays(sq: SceneSquare): CellArrays {
  const all: CellArrays = {
    "vol.rings": Uint16Array.from(sq.vol.rings),
    "vol.verts": Uint16Array.from(sq.vol.verts),
    "vol.xy": Int16Array.from(sq.vol.xy, clamp16),
    "vol.base": Uint16Array.from(sq.vol.base),
    "vol.top": Uint16Array.from(sq.vol.top),
    "vol.roofH": Uint16Array.from(sq.vol.roofH),
    "vol.roofShape": Uint8Array.from(sq.vol.roofShape),
    "vol.wall": Uint8Array.from(sq.vol.wall),
    "vol.roof": Uint8Array.from(sq.vol.roof),
    "vol.glass": Uint8Array.from(sq.vol.glass),
    "vol.pattern": Uint8Array.from(sq.vol.pattern),
    "vol.flags": Uint8Array.from(sq.vol.flags),
    "vol.seed": Uint32Array.from(sq.vol.seed),
    "cab.verts": Uint16Array.from(sq.cab.verts),
    "cab.kind": Uint8Array.from(sq.cab.kind),
    "cab.xyz": Int32Array.from(sq.cab.xyz),
    "gnd.kind": Uint8Array.from(sq.gnd.kind),
    "gnd.order": Uint32Array.from(sq.gnd.order),
    "gnd.rings": Uint16Array.from(sq.gnd.rings),
    "gnd.verts": Uint16Array.from(sq.gnd.verts),
    "gnd.xy": Int16Array.from(sq.gnd.xy, clamp16),
    "way.kind": Uint8Array.from(sq.way.kind),
    "way.width": Uint16Array.from(sq.way.width),
    "way.order": Uint32Array.from(sq.way.order),
    "way.verts": Uint16Array.from(sq.way.verts),
    "way.xy": Int16Array.from(sq.way.xy, clamp16),
    "tree.xy": Int16Array.from(sq.tree.xy, clamp16),
    "tree.kind": Uint8Array.from(sq.tree.kind),
  };
  const out: CellArrays = {};
  for (const [name, a] of Object.entries(all)) if (a.length > 0) out[name] = a;
  out.mask = sq.mask;
  return out;
}
