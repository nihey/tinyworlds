/**
 * The `walk` step: the city at street level, in squares of 200 m the viewer loads as you walk.
 * It reads the scene (what the map draws) and Overture's segments (streets, sidewalks, rails),
 * solves the heights of bridges and overpasses, builds the network traffic and people follow,
 * and writes one file per square inside the map (`walk/cells/<i>_<j>.bin`), the index
 * (`walk/walk.json`) and their version into the manifest (`walk`). The contract is in the root
 * CLAUDE.md.
 *
 * A square is written when the scene's fog leaves its centre on the map, or when it holds
 * something the map draws (volumes, ways, trees, cables): the ground alone does not count, as
 * the harbour's polygons reach far past the map. Streets, walks, elevated ways and boats are
 * filed only under the squares written.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CITY, DIRS } from "../config.js";
import { SUN_BEARING } from "../render/chunk.js";
import { buildPalette, RAMP_NAMES } from "../render/palette.js";
import { fogAt, type FogGrid } from "../scene/fog.js";
import { F_FLOATING, G, PAINT_RANK, Roof } from "../scene/kinds.js";
import { readScene, type Arr } from "../scene/store.js";
import { cutScene, squareArrays, type SceneSquare } from "./cut.js";
import { encodeCell, packed, type CellArrays, type IntType } from "./format.js";
import { CELL, cellKey, lonLatToEN, mapToEN, type Geo } from "./grid.js";
import { decksOf, solveHeights, type DeckAt, type DeckStats } from "./heights.js";
import { waterAt } from "./mask.js";
import { mooringsOf, type Mooring } from "./moorings.js";
import { buildNetwork, type NetNode, type Network, type Tunnel } from "./network.js";
import { piecesOf } from "./pieces.js";
import { readSegments, type Segment } from "./segments.js";
import { SHORE_SQUARES, shoreDistances } from "./shore.js";
import { syntheticNetwork } from "./synthetic.js";

type Scene = { arrays: Record<string, Arr>; meta: Record<string, unknown> };

export interface WalkOptions {
  /** The world's data folder (default: the viewer's); the walk goes in its `walk/`. */
  out?: string;
  /** Only the squares within `radius` metres of a point are written; the others are left as they are. */
  around?: { lon: number; lat: number; radius: number };
  /** The scene's folder (default: the city's). */
  scene?: string;
  /** The segments, instead of reading `raw/segment.parquet` (for tests). */
  segments?: Segment[];
  log?: (m: string) => void;
}

/** Metres: the grid that finds the decks holding a point. */
const DECK_GRID = 25;
/** How far over the map's deck a vertex on it may stand before the run says so. */
const DECK_SLACK = 0.1;
const MOOR_KIND = { speedboat: 0, motorboat: 1 } as const;

const dm = (metres: number): number => Math.round(metres * 10);
/** A square as one number, for the hot loops: i and j within ±32,768. */
const num = (i: number, j: number): number => (i + 32768) * 65536 + (j + 32768);
const unnum = (key: number): [number, number] => [Math.floor(key / 65536) - 32768, (key % 65536) - 32768];

/** Even-odd: whether flat e, n rings hold a point. */
function holds(rings: number[][], e: number, n: number): boolean {
  let inside = false;
  for (const r of rings) {
    const m = r.length / 2;
    for (let a = 0, b = m - 1; a < m; b = a++) {
      const na = r[a * 2 + 1];
      const nb = r[b * 2 + 1];
      if (na > n !== nb > n && e < r[a * 2] + ((n - na) * (r[b * 2] - r[a * 2])) / (nb - na))
        inside = !inside;
    }
  }
  return inside;
}

/**
 * The map's deck heights under a point: the top of every floating deck volume (`F_FLOATING`,
 * `Roof.Deck`: the decks the scene raises over the water) whose footprint holds it, highest
 * first; none off the decks. Where decks stack (the Queensboro's levels and ramps), which one a
 * way is on is the heights' choice (`decksOf`).
 */
export function deckAtFromScene(scene: Scene, geo: Geo): DeckAt {
  const A = scene.arrays;
  const ringStart = A["vol.ringStart"];
  const vertStart = A["vol.vertStart"];
  const xy = A["vol.xy"];
  const decks: { rings: number[][]; top: number; e0: number; n0: number; e1: number; n1: number }[] = [];
  const grid = new Map<number, number[]>();
  for (let v = 0; v + 1 < ringStart.length; v++) {
    if (!(A["vol.flags"][v] & F_FLOATING) || A["vol.roofShape"][v] !== Roof.Deck) continue;
    const deck = {
      rings: [] as number[][],
      top: A["vol.top"][v] / geo.kz,
      e0: Infinity,
      n0: Infinity,
      e1: -Infinity,
      n1: -Infinity,
    };
    for (let r = ringStart[v]; r < ringStart[v + 1]; r++) {
      const ring: number[] = [];
      for (let p = vertStart[r]; p < vertStart[r + 1]; p++) {
        const [e, n] = mapToEN(geo, xy[p * 2], xy[p * 2 + 1]);
        ring.push(e, n);
        deck.e0 = Math.min(deck.e0, e);
        deck.n0 = Math.min(deck.n0, n);
        deck.e1 = Math.max(deck.e1, e);
        deck.n1 = Math.max(deck.n1, n);
      }
      deck.rings.push(ring);
    }
    if (deck.e0 > deck.e1) continue;
    const at = decks.push(deck) - 1;
    for (let gx = Math.floor(deck.e0 / DECK_GRID); gx <= Math.floor(deck.e1 / DECK_GRID); gx++)
      for (let gy = Math.floor(deck.n0 / DECK_GRID); gy <= Math.floor(deck.n1 / DECK_GRID); gy++) {
        const list = grid.get(num(gx, gy));
        if (list) list.push(at);
        else grid.set(num(gx, gy), [at]);
      }
  }
  return (e, n) => {
    const tops: number[] = [];
    for (const at of grid.get(num(Math.floor(e / DECK_GRID), Math.floor(n / DECK_GRID))) ?? []) {
      const d = decks[at];
      if (e < d.e0 || e > d.e1 || n < d.n0 || n > d.n1) continue;
      if (holds(d.rings, e, n) && !tops.includes(d.top)) tops.push(d.top);
    }
    return tops.sort((a, b) => b - a);
  };
}

/**
 * Tunnels as the map can show them: a portal off the map (`onMap` false) is closed by a barrier,
 * so its end becomes null, the open end first; a tunnel with no portal on the map is left out.
 */
export function closeTunnels(tunnels: Tunnel[], onMap: (e: number, n: number) => boolean): Tunnel[] {
  const out: Tunnel[] = [];
  for (const t of tunnels) {
    const a = onMap(t.a[0], t.a[1]);
    const b = t.b !== null && onMap(t.b[0], t.b[1]);
    if (a && b) out.push(t);
    else if (a) out.push({ ...t, b: null });
    else if (b) out.push({ ...t, a: t.b!, b: null });
  }
  return out;
}

/** The scene's fog: how far a point (e, n) is from the city, where the map starts to fade and
 * where it ends. */
function fogOf(
  scene: Scene,
  geo: Geo,
): { distance: (e: number, n: number) => number; start: number; end: number } {
  const f = scene.meta.fog as Omit<FogGrid, "d"> & { start: number; end: number };
  const grid: FogGrid = {
    p0: f.p0,
    q0: f.q0,
    cell: f.cell,
    cols: f.cols,
    rows: f.rows,
    d: scene.arrays["fog.d"] as Float32Array,
  };
  const b = (geo.betaDeg * Math.PI) / 180;
  const sinB = Math.sin(b);
  const cosB = Math.cos(b);
  return {
    distance: (e, n) => fogAt(grid, e * sinB + n * cosB, e * cosB - n * sinB),
    start: f.start,
    end: f.end,
  };
}

/** The squares whose centres the fog leaves on the map (those `keep` allows). */
function squaresOnMap(scene: Scene, geo: Geo, keep: (i: number, j: number) => boolean): Set<number> {
  const f = scene.meta.fog as Omit<FogGrid, "d"> & { end: number };
  const { distance, end } = fogOf(scene, geo);
  const d = scene.arrays["fog.d"];
  const b = (geo.betaDeg * Math.PI) / 180;
  const sinB = Math.sin(b);
  const cosB = Math.cos(b);
  // the extent, in squares, of every fog cell on the map
  let i0 = Infinity;
  let i1 = -Infinity;
  let j0 = Infinity;
  let j1 = -Infinity;
  for (let y = 0; y < f.rows; y++)
    for (let x = 0; x < f.cols; x++) {
      if (d[y * f.cols + x] >= end) continue;
      const p = f.p0 + (x + 0.5) * f.cell;
      const q = f.q0 + (y + 0.5) * f.cell;
      const e = p * sinB + q * cosB;
      const n = p * cosB - q * sinB;
      i0 = Math.min(i0, Math.floor(e / CELL));
      i1 = Math.max(i1, Math.floor(e / CELL));
      j0 = Math.min(j0, Math.floor(n / CELL));
      j1 = Math.max(j1, Math.floor(n / CELL));
    }
  const out = new Set<number>();
  for (let j = j0 - 1; j <= j1 + 1; j++)
    for (let i = i0 - 1; i <= i1 + 1; i++)
      if (keep(i, j) && distance((i + 0.5) * CELL, (j + 0.5) * CELL) < end) out.add(num(i, j));
  return out;
}

/** Every pier of the scene (ground kind `Pier`), its rings in e, n, in the scene's order. */
function piersOf(scene: Scene, geo: Geo): number[][][] {
  const A = scene.arrays;
  const piers: number[][][] = [];
  for (let g = 0; g < A["ground.kind"].length; g++) {
    if (A["ground.kind"][g] !== G.Pier) continue;
    const rings: number[][] = [];
    for (let r = A["ground.ringStart"][g]; r < A["ground.ringStart"][g + 1]; r++) {
      const ring: number[] = [];
      for (let p = A["ground.vertStart"][r]; p < A["ground.vertStart"][r + 1]; p++)
        ring.push(...mapToEN(geo, A["ground.xy"][p * 2], A["ground.xy"][p * 2 + 1]));
      rings.push(ring);
    }
    piers.push(rings);
  }
  return piers;
}

/** The network: streets, walks, elevated ways, tunnels, with heights on the map's decks. */
function networkOf(segments: Segment[], deckAt: DeckAt, log: (m: string) => void): Network {
  const pieces = piecesOf(segments);
  const stats: DeckStats = { onDeck: 0, floored: 0, dropped: 0 };
  const decks = decksOf(pieces, deckAt, stats);
  const z = solveHeights(pieces, deckAt, { decks });
  // a vertex on a deck stands at it (unless its level asks for more): only where pieces meet on
  // different decks can one stand higher
  let above = 0;
  pieces.forEach((p, i) => {
    for (let k = 0; k < p.level.length; k++)
      if (decks.floor[i][k] === 0 && z[i][k] > decks.at[i][k] + DECK_SLACK) above++;
  });
  log(
    `walk: ${pieces.length} pieces; ${stats.onDeck} vertices on the map's decks (${stats.floored} ` +
      `raised to their bridge's level, ${above} above their deck where pieces meet); ` +
      `${stats.dropped} off a deck that holds them`,
  );
  return buildNetwork(pieces, z, decks.at);
}

/** Metres: a vertex this close to the line through the vertices kept either side is left out. */
const STRAIGHT = 0.1;

/** Whether every vertex between a and b (flat e, n, z) lies within STRAIGHT of the line from a to b,
 * in plan and in height. */
function straight(pts: number[], a: number, b: number): boolean {
  const de = pts[b * 3] - pts[a * 3];
  const dn = pts[b * 3 + 1] - pts[a * 3 + 1];
  const dz = pts[b * 3 + 2] - pts[a * 3 + 2];
  const long = de * de + dn * dn;
  for (let v = a + 1; v < b; v++) {
    const ve = pts[v * 3] - pts[a * 3];
    const vn = pts[v * 3 + 1] - pts[a * 3 + 1];
    // clamped: a vertex past either end, doubling back along the line, is never on it
    const t = long > 0 ? Math.min(1, Math.max(0, (ve * de + vn * dn) / long)) : 0;
    if (Math.hypot(ve - de * t, vn - dn * t) > STRAIGHT) return false;
    if (Math.abs(pts[a * 3 + 2] + dz * t - pts[v * 3 + 2]) > STRAIGHT) return false;
  }
  return true;
}

/**
 * The vertices a way's shape needs (indices into flat e, n, z points): the pieces were cut every
 * 10 m for the heights, and a straight stretch at one grade needs only its ends. With `own`
 * (an elevated way's), both vertices where who builds the deck changes are kept.
 */
export function shapeOf(pts: number[], own?: Uint8Array): number[] {
  const m = pts.length / 3;
  const keep = [0];
  for (let k = 1; k < m - 1; k++)
    if (
      (own && (own[k] !== own[k - 1] || own[k] !== own[k + 1])) ||
      !straight(pts, keep[keep.length - 1], k + 1)
    )
      keep.push(k);
  if (m > 1) keep.push(m - 1);
  return keep;
}

/** The kept vertices of flat e, n, z points, in world decimetres. */
const xyzAt = (pts: number[], keep: number[]): number[] =>
  keep.flatMap((k) => [dm(pts[k * 3]), dm(pts[k * 3 + 1]), dm(pts[k * 3 + 2])]);

interface Filed {
  st: number[];
  wk: number[];
  el: number[];
  moor: Mooring[];
}

/** Every square a way's strip touches (flat e, n, z points, half its width either side). */
function touched(pts: number[], half: number, into: Set<number>): Set<number> {
  into.clear();
  for (let v = 0; v + 5 < pts.length; v += 3) {
    const i0 = Math.floor((Math.min(pts[v], pts[v + 3]) - half) / CELL);
    const i1 = Math.floor((Math.max(pts[v], pts[v + 3]) + half) / CELL);
    const j0 = Math.floor((Math.min(pts[v + 1], pts[v + 4]) - half) / CELL);
    const j1 = Math.floor((Math.max(pts[v + 1], pts[v + 4]) + half) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) into.add(num(i, j));
  }
  return into;
}

/** A square's share of the network and its boats, as the encoder takes them. */
function networkArrays(key: string, f: Filed, net: Network, nodes: NetNode[]): CellArrays {
  const ids = new Set<number>();
  for (const s of f.st) ids.add(net.streets[s].a).add(net.streets[s].b);
  for (const w of f.wk) ids.add(net.walks[w].a).add(net.walks[w].b);
  const at = [...ids].sort((a, b) => a - b).map((id) => nodes[id]);
  const st = f.st.map((s) => ({ ...net.streets[s], keep: shapeOf(net.streets[s].pts) }));
  const wk = f.wk.map((w) => ({ ...net.walks[w], keep: shapeOf(net.walks[w].pts) }));
  const el = f.el.map((e) => ({
    ...net.elevated[e],
    keep: shapeOf(net.elevated[e].pts, net.elevated[e].own),
  }));
  const fields: [string, IntType, number[]][] = [
    ["node.id", "u32", at.map((nd) => nd.id)],
    ["node.xyz", "i32", at.flatMap((nd) => [dm(nd.e), dm(nd.n), dm(nd.z)])],
    ["node.flags", "u8", at.map((nd) => nd.flags)],
    ["node.bearing", "u8", at.map((nd) => Math.round((nd.bearing / Math.PI) * 255))],
    ["st.a", "u32", st.map((s) => s.a)],
    ["st.b", "u32", st.map((s) => s.b)],
    ["st.cls", "u8", st.map((s) => s.cls)],
    ["st.flags", "u8", st.map((s) => s.flags)],
    ["st.width", "u16", st.map((s) => dm(s.width))],
    ["st.verts", "u16", st.map((s) => s.keep.length)],
    ["st.xyz", "i32", st.flatMap((s) => xyzAt(s.pts, s.keep))],
    ["wk.a", "u32", wk.map((w) => w.a)],
    ["wk.b", "u32", wk.map((w) => w.b)],
    ["wk.flags", "u8", wk.map((w) => w.flags)],
    ["wk.verts", "u16", wk.map((w) => w.keep.length)],
    ["wk.xyz", "i32", wk.flatMap((w) => xyzAt(w.pts, w.keep))],
    ["elev.kind", "u8", el.map((e) => e.kind)],
    ["elev.width", "u16", el.map((e) => dm(e.width))],
    ["elev.verts", "u16", el.map((e) => e.keep.length)],
    ["elev.xyz", "i32", el.flatMap((e) => xyzAt(e.pts, e.keep))],
    ["elev.own", "u8", el.flatMap((e) => e.keep.map((k) => e.own[k]))],
    ["moor.xy", "i32", f.moor.flatMap((m) => [dm(m.e), dm(m.n)])],
    ["moor.heading", "u8", f.moor.map((m) => Math.round((m.heading / (2 * Math.PI)) * 255))],
    ["moor.kind", "u8", f.moor.map((m) => MOOR_KIND[m.kind])],
  ];
  const out: CellArrays = {};
  for (const [name, type, values] of fields)
    if (values.length > 0) out[name] = packed(key, name, type, values);
  return out;
}

const emptySquare = (i: number, j: number): SceneSquare => ({
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
  // nothing painted is water, as on the map
  mask: Uint8Array.of(1),
});

const holdsSomething = (sq: SceneSquare): boolean =>
  sq.vol.rings.length > 0 || sq.way.kind.length > 0 || sq.tree.kind.length > 0 || sq.cab.kind.length > 0;

/** The squares that have a file, from the folder's names. */
function squaresOnDisk(cells: string): [number, number][] {
  if (!fs.existsSync(cells)) return [];
  return fs
    .readdirSync(cells)
    .filter((name) => /^-?\d+_-?\d+\.bin$/.test(name))
    .map((name) => name.slice(0, -4).split("_").map(Number) as [number, number]);
}

/** The bitset of squares with a file over their extent, as walk.json has it. */
function cellsIndex(squares: [number, number][]): {
  i0: number;
  j0: number;
  cols: number;
  rows: number;
  cells: string;
} {
  if (squares.length === 0) return { i0: 0, j0: 0, cols: 0, rows: 0, cells: "" };
  let [i0, j0, i1, j1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [i, j] of squares) {
    i0 = Math.min(i0, i);
    j0 = Math.min(j0, j);
    i1 = Math.max(i1, i);
    j1 = Math.max(j1, j);
  }
  const cols = i1 - i0 + 1;
  const rows = j1 - j0 + 1;
  const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (const [i, j] of squares) {
    const b = i - i0 + (j - j0) * cols;
    bits[b >> 3] |= 1 << (b & 7);
  }
  return { i0, j0, cols, rows, cells: Buffer.from(bits).toString("base64") };
}

/** The walk's version: a hash of every file's name and contents, so it moves only when they do. */
export function walkVersion(walk: string): string {
  const files = [
    "walk.json",
    ...squaresOnDisk(path.join(walk, "cells")).map(([i, j]) => `cells/${cellKey(i, j)}.bin`),
  ].sort();
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(fs.readFileSync(path.join(walk, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

/**
 * Names the walk's version in the manifest (`walk`), from the walk folder on disk; a folder with
 * no manifest yet is left alone.
 */
export function stampWalk(out: string, log: (m: string) => void): void {
  const file = path.join(out, "manifest.json");
  if (!fs.existsSync(file)) return;
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const version = walkVersion(path.join(out, "walk"));
  if (manifest.walk === version) return;
  manifest.walk = version;
  fs.writeFileSync(file, JSON.stringify(manifest));
  log(`walk: the manifest names the walk's version ${version}`);
}

const round = (v: number, places: number): number => Math.round(v * 10 ** places) / 10 ** places;

export async function buildWalk(opts: WalkOptions = {}): Promise<void> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const started = Date.now();
  const lap = (m: string): void => log(`walk: ${m} (${((Date.now() - started) / 1000).toFixed(1)} s)`);

  const scene = readScene(opts.scene ?? DIRS.scene);
  const geo = scene.meta.geo as Geo;
  const fog = fogOf(scene, geo);
  const deckAt = deckAtFromScene(scene, geo);
  const synthetic =
    scene.meta.synthetic === true || CITY.synthetic ? syntheticNetwork(scene.arrays, geo, deckAt) : null;
  const segments =
    opts.segments ??
    synthetic?.segments ??
    (await readSegments(path.join(DIRS.raw, "segment.parquet"), geo, CITY.walkCycleways));
  lap(`scene and ${segments.length} segments read`);
  const net = networkOf(segments, deckAt, log);
  lap(
    `network: ${net.nodes.size} nodes, ${net.streets.length} streets, ${net.walks.length} walks, ` +
      `${net.elevated.length} elevated ways, ${net.tunnels.length} tunnels`,
  );

  // which squares: all of them, or those near a point and, for their shores, boats and the
  // tunnels' portals, what is round them
  let writes: (i: number, j: number) => boolean = () => true;
  let cuts: (i: number, j: number) => boolean = () => true;
  if (opts.around) {
    const { radius } = opts.around;
    const [ce, cn] = lonLatToEN(geo, opts.around.lon, opts.around.lat);
    const near = (i: number, j: number): boolean =>
      Math.hypot(
        Math.max(0, Math.abs(ce - (i + 0.5) * CELL) - CELL / 2),
        Math.max(0, Math.abs(cn - (j + 0.5) * CELL) - CELL / 2),
      ) <= radius;
    const area = new Set<number>();
    const reach = Math.ceil(radius / CELL) + 1;
    const [ci, cj] = [Math.floor(ce / CELL), Math.floor(cn / CELL)];
    for (let i = ci - reach; i <= ci + reach; i++)
      for (let j = cj - reach; j <= cj + reach; j++) if (near(i, j)) area.add(num(i, j));
    const reached = new Set<number>();
    for (const key of area) {
      const [i, j] = unnum(key);
      for (let di = -SHORE_SQUARES; di <= SHORE_SQUARES; di++)
        for (let dj = -SHORE_SQUARES; dj <= SHORE_SQUARES; dj++) reached.add(num(i + di, j + dj));
    }
    for (const t of net.tunnels)
      for (const end of [t.a, t.b])
        if (end) reached.add(num(Math.floor(end[0] / CELL), Math.floor(end[1] / CELL)));
    writes = (i, j) => area.has(num(i, j));
    cuts = (i, j) => reached.has(num(i, j));
  }

  const onMap = squaresOnMap(scene, geo, cuts);
  const splitMainCables = CITY.suspensions?.some((span) => span.mappedTowers);
  const cut = cutScene(scene, geo, cuts, synthetic?.piers, splitMainCables, [...onMap].map(unnum));
  const squares = new Map<number, SceneSquare>();
  for (const sq of cut.values())
    if (onMap.has(num(sq.i, sq.j)) || holdsSomething(sq)) squares.set(num(sq.i, sq.j), sq);
  cut.clear();
  for (const key of onMap) if (!squares.has(key)) squares.set(key, emptySquare(...unnum(key)));
  const masks = new Map<string, Uint8Array>();
  for (const sq of squares.values()) masks.set(cellKey(sq.i, sq.j), sq.mask);
  lap(`${squares.size} squares on the map${opts.around ? " round the point" : ""}`);

  // the tunnels, closed where a portal is past the whole map, where the fog starts (the Holland
  // and Lincoln tunnels' New Jersey ends), or has no square
  const tunnels = closeTunnels(
    net.tunnels,
    (e, n) => fog.distance(e, n) < fog.start && squares.has(num(Math.floor(e / CELL), Math.floor(n / CELL))),
  );
  const closed = tunnels
    .filter((t) => t.b === null)
    .map((t) => `${t.name || "(unnamed)"} ${Math.round(t.length)} m`);
  log(
    `walk: ${tunnels.length} tunnels, ${closed.length} closed at one end` +
      (closed.length ? `: ${closed.join(", ")}` : "") +
      `; ${net.tunnels.length - tunnels.length} with no portal on the map left out`,
  );

  // what each square written holds of the network, and its boats
  const filed = new Map<number, Filed>();
  for (const [key, sq] of squares)
    if (writes(sq.i, sq.j)) filed.set(key, { st: [], wk: [], el: [], moor: [] });
  const seen = new Set<number>();
  const file = (pts: number[], half: number, add: (f: Filed) => void): void => {
    for (const key of touched(pts, half, seen)) {
      const f = filed.get(key);
      if (f) add(f);
    }
  };
  net.streets.forEach((s, x) => file(s.pts, s.width / 2, (f) => f.st.push(x)));
  net.walks.forEach((w, x) => file(w.pts, 0, (f) => f.wk.push(x)));
  net.elevated.forEach((el, x) => file(el.pts, el.width / 2, (f) => f.el.push(x)));
  const piers = [...piersOf(scene, geo), ...(synthetic?.piers.map((ring) => [ring]) ?? [])];
  const boats = mooringsOf(
    piers,
    (e, n) => {
      const i = Math.floor(e / CELL);
      const j = Math.floor(n / CELL);
      const mask = masks.get(cellKey(i, j));
      return mask !== undefined && waterAt(mask, e - i * CELL, n - j * CELL);
    },
    synthetic !== null,
  );
  for (const b of boats) filed.get(num(Math.floor(b.e / CELL), Math.floor(b.n / CELL)))?.moor.push(b);
  const nodes: NetNode[] = [];
  for (const node of net.nodes.values()) nodes[node.id] = node;

  // the squares, one file each
  const walk = path.join(path.resolve(opts.out ?? DIRS.out), "walk");
  const cells = path.join(walk, "cells");
  fs.mkdirSync(cells, { recursive: true });
  const order = [...filed.keys()].sort((a, b) => {
    const [ai, aj] = unnum(a);
    const [bi, bj] = unnum(b);
    return aj - bj || ai - bi;
  });
  const written = new Set<string>();
  const arrayBytes = new Map<string, number>();
  let bytes = 0;
  let largest = { key: "", bytes: 0, arrays: {} as CellArrays };
  const every = Math.max(1, Math.round(order.length / 20));
  for (const [x, at] of order.entries()) {
    const sq = squares.get(at)!;
    const key = cellKey(sq.i, sq.j);
    const arrays: CellArrays = { ...squareArrays(sq), ...networkArrays(key, filed.get(at)!, net, nodes) };
    const shore = shoreDistances(masks, [key]).get(key);
    if (shore) arrays.shore = shore;
    const buf = encodeCell(sq.i, sq.j, arrays);
    fs.writeFileSync(path.join(cells, `${key}.bin`), buf);
    written.add(key);
    bytes += buf.length;
    for (const [name, a] of Object.entries(arrays))
      arrayBytes.set(name, (arrayBytes.get(name) ?? 0) + a.byteLength);
    if (buf.length > largest.bytes) largest = { key, bytes: buf.length, arrays };
    if ((x + 1) % every === 0 || x + 1 === order.length) lap(`${x + 1} / ${order.length} squares written`);
  }

  // squares that are no longer there: all of them, or those in reach of the point
  for (const [i, j] of squaresOnDisk(cells))
    if (writes(i, j) && !written.has(cellKey(i, j))) fs.rmSync(path.join(cells, `${cellKey(i, j)}.bin`));

  const { rgb } = buildPalette(CITY.colors);
  const index = {
    v: 1,
    cell: CELL,
    ...cellsIndex(squaresOnDisk(cells)),
    geo,
    // the street grid's own bearing (the city file's), whichever way the map is turned
    gridDeg: CITY.gridDeg,
    sunDeg: SUN_BEARING,
    palette: { names: RAMP_NAMES, rgb: rgb.flat() },
    paintRank: Array.from(PAINT_RANK),
    tunnels: tunnels.map((t) => ({
      name: t.name,
      a: [round(t.a[0], 2), round(t.a[1], 2), round(t.a[2], 4)],
      b: t.b && [round(t.b[0], 2), round(t.b[1], 2), round(t.b[2], 4)],
      length: round(t.length, 1),
    })),
  };
  fs.writeFileSync(path.join(walk, "walk.json"), JSON.stringify(index));

  const counts = [...filed.values()].reduce(
    (c, f) => ({
      st: c.st + f.st.length,
      wk: c.wk + f.wk.length,
      el: c.el + f.el.length,
      moor: c.moor + f.moor.length,
    }),
    { st: 0, wk: 0, el: 0, moor: 0 },
  );
  const mb = (b: number): string => `${(b / 1e6).toFixed(1)} MB`;
  const sizes = (arrays: Map<string, number>): string =>
    [...arrays]
      .sort((a, b) => b[1] - a[1])
      .map(([name, b]) => `${name} ${b >= 1e5 ? mb(b) : `${(b / 1e3).toFixed(1)} kB`}`)
      .join(", ");
  log(
    `walk: ${written.size} squares written, ${mb(bytes)} gzipped (${boats.length} boats at the piers in reach); ` +
      `filed: ${counts.st} streets, ${counts.wk} walks, ${counts.el} elevated ways, ${counts.moor} boats`,
  );
  log(`walk: arrays before gzip: ${sizes(arrayBytes)}`);
  if (largest.key)
    log(
      `walk: the largest square is ${largest.key}, ${(largest.bytes / 1e3).toFixed(0)} kB gzipped: ` +
        sizes(new Map(Object.entries(largest.arrays).map(([name, a]) => [name, a.byteLength]))),
    );
  stampWalk(path.resolve(opts.out ?? DIRS.out), log);
  lap(`${squaresOnDisk(cells).length} squares in ${path.relative(process.cwd(), walk) || walk}`);
}
