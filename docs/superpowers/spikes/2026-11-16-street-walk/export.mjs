// Street-level spike (throwaway): cut the pipeline's scene into square cells of ground metres
// that a first-person viewer can stream.
//
//   node export.mjs <scene dir> <out dir> <lon> <lat> <half-size m> [cell m]
//
// World space: metres east and north of the projection origin (geo.lon0/lat0); heights in metres.
// One JSON file per cell, `cells/<i>_<j>.json`, plus `world.json`.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pc = require(
  path.resolve(process.env.PIPELINE ?? new URL("../../../../tinyworlds-pipeline", import.meta.url).pathname, "node_modules/polygon-clipping"),
);
const clip = pc.default ?? pc;

const [sceneDir, outDir, lonS, latS, halfS, cellS] = process.argv.slice(2);
const HALF = Number(halfS);
const CELL = Number(cellS ?? 200);

const index = JSON.parse(fs.readFileSync(path.join(sceneDir, "scene.json"), "utf8"));
const TYPES = { f32: Float32Array, u32: Uint32Array, u8: Uint8Array, u16: Uint16Array, i16: Int16Array };
const A = {};
for (const [name, { type }] of Object.entries(index.arrays)) {
  const buf = fs.readFileSync(path.join(sceneDir, `${name}.bin`));
  A[name] = new TYPES[type](buf.buffer, buf.byteOffset, buf.byteLength / TYPES[type].BYTES_PER_ELEMENT);
}
const geo = index.meta.geo;
const { k, kz } = geo;
const RAD = Math.PI / 180;
const sinB = Math.sin(geo.betaDeg * RAD);
const cosB = Math.cos(geo.betaDeg * RAD);
const R = 6371008.8;

/** map px (ground) → [east, north] metres */
function en(X, Y) {
  const s = X / k; // p + q
  const d = (2 * Y) / k; // q - p
  const p = (s - d) / 2;
  const q = (s + d) / 2;
  return [p * sinB + q * cosB, p * cosB - q * sinB];
}
const cE = (Number(lonS) - geo.lon0) * RAD * R * Math.cos(geo.lat0 * RAD);
const cN = (Number(latS) - geo.lat0) * RAD * R;
const box = { e0: cE - HALF, e1: cE + HALF, n0: cN - HALF, n1: cN + HALF };
const i0 = Math.floor(box.e0 / CELL), i1 = Math.floor(box.e1 / CELL);
const j0 = Math.floor(box.n0 / CELL), j1 = Math.floor(box.n1 / CELL);

const cells = new Map();
const cell = (i, j) => {
  const key = `${i}_${j}`;
  let c = cells.get(key);
  if (!c) {
    c = { v: [], g: [], l: [], t: [] };
    cells.set(key, c);
  }
  return c;
};
const inRegion = (i, j) => i >= i0 && i <= i1 && j >= j0 && j <= j1;
const r1 = (x) => Math.round(x * 10) / 10;

/** A poly's rings in [east, north] metres. */
function rings(prefix, n) {
  const rs = A[`${prefix}.ringStart`], vs = A[`${prefix}.vertStart`], xy = A[`${prefix}.xy`];
  const out = [];
  for (let r = rs[n]; r < rs[n + 1]; r++) {
    const ring = [];
    for (let v = vs[r]; v < vs[r + 1]; v++) {
      const [e, nn] = en(xy[v * 2], xy[v * 2 + 1]);
      ring.push(r1(e), r1(nn));
    }
    out.push(ring);
  }
  return out;
}
/** The bbox of a map-px bbox in [east, north] (the corners, projected). */
function bboxEN(bb, n) {
  const xs = [bb[n * 4], bb[n * 4 + 2]], ys = [bb[n * 4 + 1], bb[n * 4 + 3]];
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (const x of xs)
    for (const y of ys) {
      const [e, nn] = en(x, y);
      e0 = Math.min(e0, e); e1 = Math.max(e1, e); n0 = Math.min(n0, nn); n1 = Math.max(n1, nn);
    }
  return { e0, e1, n0, n1 };
}
const overlaps = (b) => b.e1 >= box.e0 && b.e0 <= box.e1 && b.n1 >= box.n0 && b.n0 <= box.n1;

// ---- volumes: filed under the cell of their centre
const nVol = A["vol.ringStart"].length - 1;
let vols = 0;
for (let v = 0; v < nVol; v++) {
  const [e, nn] = en(A["vol.center"][v * 2], A["vol.center"][v * 2 + 1]);
  const i = Math.floor(e / CELL), j = Math.floor(nn / CELL);
  if (!inRegion(i, j)) continue;
  cell(i, j).v.push([
    r1(A["vol.base"][v] / kz),
    r1(A["vol.top"][v] / kz),
    r1(A["vol.roofH"][v] / kz),
    A["vol.roofShape"][v],
    A["vol.wall"][v],
    A["vol.roof"][v],
    A["vol.glass"][v],
    A["vol.pattern"][v],
    A["vol.seed"][v],
    A["vol.flags"][v],
    rings("vol", v),
  ]);
  vols++;
}

// ---- ground polygons: clipped to the cells they cross
const nG = A["ground.ringStart"].length - 1;
const kinds = {};
let gPolys = 0;
for (let g = 0; g < nG; g++) {
  const b = bboxEN(A["ground.bbox"], g);
  if (!overlaps(b)) continue;
  const kind = A["ground.kind"][g];
  kinds[kind] = (kinds[kind] ?? 0) + 1;
  const rs = rings("ground", g);
  const ci0 = Math.max(i0, Math.floor(b.e0 / CELL)), ci1 = Math.min(i1, Math.floor(b.e1 / CELL));
  const cj0 = Math.max(j0, Math.floor(b.n0 / CELL)), cj1 = Math.min(j1, Math.floor(b.n1 / CELL));
  if (ci0 === ci1 && cj0 === cj1) {
    cell(ci0, cj0).g.push([kind, g, rs]);
    gPolys++;
    continue;
  }
  const poly = [rs.map((r) => { const pts = []; for (let x = 0; x < r.length; x += 2) pts.push([r[x], r[x + 1]]); return pts; })];
  for (let i = ci0; i <= ci1; i++)
    for (let j = cj0; j <= cj1; j++) {
      const sq = [[[i * CELL, j * CELL], [(i + 1) * CELL, j * CELL], [(i + 1) * CELL, (j + 1) * CELL], [i * CELL, (j + 1) * CELL]]];
      let cut;
      try { cut = clip.intersection(poly, sq); } catch { continue; }
      for (const part of cut) {
        cell(i, j).g.push([kind, g, part.map((ring) => ring.slice(0, -1).flatMap(([x, y]) => [r1(x), r1(y)]))]);
        gPolys++;
      }
    }
}

// ---- lines (streets, paths, rails): filed under every cell their box touches; bridges left out
const nL = A["lines.kind"].length;
let lines = 0;
for (let l = 0; l < nL; l++) {
  if (A["lines.flags"][l] & 1) continue;
  const b = bboxEN(A["lines.bbox"], l);
  if (!overlaps(b)) continue;
  const vs = A["lines.vertStart"], xy = A["lines.xy"];
  const pathEN = [];
  for (let v = vs[l]; v < vs[l + 1]; v++) {
    const [e, nn] = en(xy[v * 2], xy[v * 2 + 1]);
    pathEN.push(r1(e), r1(nn));
  }
  const ci0 = Math.max(i0, Math.floor(b.e0 / CELL)), ci1 = Math.min(i1, Math.floor(b.e1 / CELL));
  const cj0 = Math.max(j0, Math.floor(b.n0 / CELL)), cj1 = Math.min(j1, Math.floor(b.n1 / CELL));
  for (let i = ci0; i <= ci1; i++) for (let j = cj0; j <= cj1; j++) cell(i, j).l.push([A["lines.kind"][l], r1(A["lines.width"][l]), l, pathEN]);
  lines++;
}

// ---- trees
const nT = A["trees.kind"].length;
let trees = 0;
for (let t = 0; t < nT; t++) {
  const [e, nn] = en(A["trees.xy"][t * 2], A["trees.xy"][t * 2 + 1]);
  const i = Math.floor(e / CELL), j = Math.floor(nn / CELL);
  if (!inRegion(i, j)) continue;
  cell(i, j).t.push(r1(e), r1(nn), A["trees.kind"][t]);
  trees++;
}

fs.mkdirSync(path.join(outDir, "cells"), { recursive: true });
let bytes = 0;
for (const [key, c] of cells) {
  const s = JSON.stringify(c);
  bytes += s.length;
  fs.writeFileSync(path.join(outDir, "cells", `${key}.json`), s);
}
fs.writeFileSync(
  path.join(outDir, "world.json"),
  JSON.stringify({ cell: CELL, i0, i1, j0, j1, geo, cells: [...cells.keys()] }),
);
console.log(
  `${cells.size} cells, ${vols} volumes, ${gPolys} ground pieces, ${lines} lines, ${trees} trees, ${(bytes / 1e6).toFixed(1)} MB`,
);
console.log("ground kinds:", kinds);
