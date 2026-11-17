// Street-level spike (throwaway): the drivable street network of the walk's region, with one-way
// streets, from the Overture segments the map's streets come from.
//
//   node roads.mjs <segment.parquet> <world.json> <out roads.json>
//
// Nodes are Overture connectors; an edge is a segment's stretch between two of them.
// World space as the cells: metres east and north of the projection origin.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const PIPELINE = process.env.PIPELINE ?? new URL("../../../../tinyworlds-pipeline", import.meta.url).pathname;
const require = createRequire(path.join(PIPELINE, "package.json"));
const { DuckDBInstance } = await import(require.resolve("@duckdb/node-api"));

const [parquet, worldPath, outPath] = process.argv.slice(2);
const WORLD = JSON.parse(fs.readFileSync(worldPath, "utf8"));
const { geo, cell: CELL } = WORLD;
const RAD = Math.PI / 180, R = 6371008.8;
const toEN = (lon, lat) => [(lon - geo.lon0) * RAD * R * Math.cos(geo.lat0 * RAD), (lat - geo.lat0) * RAD * R];
const toLon = (e) => geo.lon0 + e / (RAD * R * Math.cos(geo.lat0 * RAD));
const toLat = (n) => geo.lat0 + n / (RAD * R);
const box = { e0: WORLD.i0 * CELL, e1: (WORLD.i1 + 1) * CELL, n0: WORLD.j0 * CELL, n1: (WORLD.j1 + 1) * CELL };

// the classes cars drive on, their speed (m/s) and their width when Overture has none (the map's)
const CLASSES = {
  motorway: [22, 14], trunk: [18, 13], primary: [12, 17], secondary: [12, 14],
  tertiary: [10, 12], residential: [8.5, 10], unclassified: [8, 10],
};

const db = await DuckDBInstance.create(":memory:");
const c = await db.connect();
await c.run("INSTALL spatial; LOAD spatial;");
const res = await c.runAndReadAll(`
  SELECT class, subclass, CAST(to_json(access_restrictions) AS VARCHAR), CAST(to_json(connectors) AS VARCHAR),
         CAST(to_json(road_flags) AS VARCHAR), CAST(to_json(level_rules) AS VARCHAR), width_rules[1]."value",
         ST_AsGeoJSON(geometry), names."primary"
  FROM '${parquet}'
  WHERE subtype = 'road' AND class IN (${Object.keys(CLASSES).map((k) => `'${k}'`).join(",")})
    AND bbox.xmax > ${toLon(box.e0)} AND bbox.xmin < ${toLon(box.e1)}
    AND bbox.ymax > ${toLat(box.n0)} AND bbox.ymin < ${toLat(box.n1)}`);

const nodes = new Map(); // connector id → index
const nodeXY = [];
const edges = [];
let skipped = 0;
const r1 = (x) => Math.round(x * 10) / 10;

for (const [cls, subclass, accJ, conJ, flagJ, levelJ, mappedW, gj, name] of res.getRows()) {
  const flags = flagJ && flagJ !== "null" ? JSON.parse(flagJ) : [];
  const levels = levelJ && levelJ !== "null" ? JSON.parse(levelJ) : [];
  // bridges, tunnels and anything off the ground are left out whole: the walk has no decks yet
  if (flags.some((f) => f.values?.some((v) => v === "is_bridge" || v === "is_tunnel")) || levels.some((l) => (l.value ?? 0) !== 0)) { skipped++; continue; }
  const acc = accJ && accJ !== "null" ? JSON.parse(accJ) : [];
  // denied to everyone, all along, but for a heading: a one-way street
  let oneway = 0;
  for (const a of acc)
    if (a.access_type === "denied" && !a.between && a.when?.heading && !a.when.mode && !a.when.using && !a.when.during && !a.when.vehicle)
      oneway = a.when.heading === "backward" ? 1 : -1;
  if (acc.some((a) => a.access_type === "denied" && !a.between && !a.when)) { skipped++; continue; }
  const coords = JSON.parse(gj).coordinates;
  const pts = coords.map(([lon, lat]) => toEN(lon, lat));
  // cumulative length, to find where each connector sits
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  if (total < 1) continue;
  const at = (s) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
  };
  const cons = (conJ && conJ !== "null" ? JSON.parse(conJ) : []).sort((a, b) => a.at - b.at);
  if (cons.length < 2) continue;
  const width = mappedW && mappedW > 2 && mappedW < 60 ? mappedW : CLASSES[cls][1] * (subclass === "link" ? 0.6 : 1);
  const nodeOf = (con) => {
    let i = nodes.get(con.connector_id);
    if (i === undefined) {
      i = nodeXY.length / 2;
      nodes.set(con.connector_id, i);
      const [e, n] = at(con.at * total);
      nodeXY.push(r1(e), r1(n));
    }
    return i;
  };
  for (let k = 0; k + 1 < cons.length; k++) {
    const s0 = cons[k].at * total, s1 = cons[k + 1].at * total;
    if (s1 - s0 < 0.5) continue;
    const a = nodeOf(cons[k]), b = nodeOf(cons[k + 1]);
    const path = [...at(s0)];
    for (let i = 0; i < pts.length; i++) if (cum[i] > s0 + 0.3 && cum[i] < s1 - 0.3) path.push(...pts[i]);
    path.push(...at(s1));
    // keep only what touches the region
    let inside = false;
    for (let i = 0; i < path.length; i += 2) if (path[i] > box.e0 && path[i] < box.e1 && path[i + 1] > box.n0 && path[i + 1] < box.n1) inside = true;
    if (!inside) continue;
    edges.push({ a, b, ow: oneway, w: r1(width), v: CLASSES[cls][0] * (subclass === "link" ? 0.7 : 1), c: cls, nm: name ?? "", p: path.map(r1) });
  }
}

// ---- where people walk: sidewalks, crosswalks, plazas and paths (no steps, nothing off the ground)
const walks = [];
const foot = await c.runAndReadAll(`
  SELECT class, subclass, CAST(to_json(connectors) AS VARCHAR), CAST(to_json(road_flags) AS VARCHAR),
         CAST(to_json(level_rules) AS VARCHAR), ST_AsGeoJSON(geometry)
  FROM '${parquet}'
  WHERE subtype = 'road' AND class IN ('footway', 'pedestrian', 'living_street', 'path')
    AND bbox.xmax > ${toLon(box.e0)} AND bbox.xmin < ${toLon(box.e1)}
    AND bbox.ymax > ${toLat(box.n0)} AND bbox.ymin < ${toLat(box.n1)}`);
for (const [cls, subclass, conJ, flagJ, levelJ, gj] of foot.getRows()) {
  const flags = flagJ && flagJ !== "null" ? JSON.parse(flagJ) : [];
  const levels = levelJ && levelJ !== "null" ? JSON.parse(levelJ) : [];
  if (flags.some((f) => f.values?.some((v) => ["is_bridge", "is_tunnel", "is_indoor", "is_under_construction", "is_covered"].includes(v))) || levels.some((l) => (l.value ?? 0) !== 0)) continue;
  const pts = JSON.parse(gj).coordinates.map(([lon, lat]) => toEN(lon, lat));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  if (total < 1) continue;
  const at = (s) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
  };
  const cons = (conJ && conJ !== "null" ? JSON.parse(conJ) : []).sort((x, y) => x.at - y.at);
  if (cons.length < 2) continue;
  const nodeOf = (con) => {
    let i = nodes.get(con.connector_id);
    if (i === undefined) {
      i = nodeXY.length / 2;
      nodes.set(con.connector_id, i);
      const [e, n] = at(con.at * total);
      nodeXY.push(r1(e), r1(n));
    }
    return i;
  };
  for (let k = 0; k + 1 < cons.length; k++) {
    const s0 = cons[k].at * total, s1 = cons[k + 1].at * total;
    if (s1 - s0 < 0.5) continue;
    const a = nodeOf(cons[k]), b = nodeOf(cons[k + 1]);
    if (a === b) continue;
    const path = [...at(s0)];
    for (let i = 0; i < pts.length; i++) if (cum[i] > s0 + 0.3 && cum[i] < s1 - 0.3) path.push(...pts[i]);
    path.push(...at(s1));
    let inside = false;
    for (let i = 0; i < path.length; i += 2) if (path[i] > box.e0 && path[i] < box.e1 && path[i + 1] > box.n0 && path[i + 1] < box.n1) inside = true;
    if (!inside) continue;
    walks.push({ a, b, x: subclass === "crosswalk" ? 1 : 0, p: path.map(r1) });
  }
}

fs.writeFileSync(outPath, JSON.stringify({ nodes: nodeXY, edges, walks }));
console.log(`${walks.length} walking pieces (${walks.filter((w) => w.x).length} crosswalks)`);
const ow = edges.filter((e) => e.ow).length;
console.log(`${nodeXY.length / 2} nodes, ${edges.length} edges (${ow} one-way), ${skipped} segments left out (bridges, tunnels, closed); ${(fs.statSync(outPath).size / 1e6).toFixed(1)} MB`);
