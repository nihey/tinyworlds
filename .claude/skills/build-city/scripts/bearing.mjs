// Measures the dominant street-grid bearing (mod 90°) of road segments inside a lon/lat box.
// usage: node bearing.mjs <pipelineDir> <city> <west> <south> <east> <north>
import { createRequire } from "node:module";
import path from "node:path";
const [pipeArg, city, w, s, e, n] = process.argv.slice(2);
const pipe = path.resolve(pipeArg);
const require = createRequire(path.join(pipe, "package.json"));
const { DuckDBInstance } = require("@duckdb/node-api");
const db = await DuckDBInstance.create(":memory:");
const c = await db.connect();
await c.run("LOAD spatial;");
const file = path.join(pipe, "data", city, "raw", "segment.parquet");
const r = await c.runAndReadAll(`SELECT ST_AsGeoJSON(geometry) FROM '${file}'
  WHERE subtype='road' AND class IN ('residential','secondary','tertiary','primary','unclassified')
  AND ST_X(ST_Centroid(geometry)) BETWEEN ${w} AND ${e} AND ST_Y(ST_Centroid(geometry)) BETWEEN ${s} AND ${n}`);
const lat0 = (Number(s) + Number(n)) / 2;
const kx = Math.cos((lat0 * Math.PI) / 180);
const bins = new Float64Array(900); // 0.1° bins over [0, 90)
let total = 0;
for (const row of r.getRows()) {
  const g = JSON.parse(row[0]);
  const cs = g.type === "LineString" ? g.coordinates : [];
  for (let i = 1; i < cs.length; i++) {
    const dx = (cs[i][0] - cs[i - 1][0]) * kx * 111195;
    const dy = (cs[i][1] - cs[i - 1][1]) * 111195;
    const len = Math.hypot(dx, dy);
    if (len < 5) continue;
    // bearing clockwise from north
    let b = (Math.atan2(dx, dy) * 180) / Math.PI;
    b = ((b % 90) + 90) % 90;
    bins[Math.floor(b * 10) % 900] += len;
    total += len;
  }
}
// smooth with a ±0.5° window (circular)
const sm = new Float64Array(900);
for (let i = 0; i < 900; i++) for (let d = -5; d <= 5; d++) sm[i] += bins[(i + d + 900) % 900];
const order = [...sm.keys()].sort((a, b) => sm[b] - sm[a]);
const peaks = [];
for (const i of order) {
  if (peaks.every((p) => Math.min(Math.abs(p - i), 900 - Math.abs(p - i)) > 50)) peaks.push(i);
  if (peaks.length >= 4) break;
}
console.log(`${(total / 1000).toFixed(0)} km of streets`);
for (const p of peaks) {
  const deg = p / 10;
  console.log(`peak ${deg.toFixed(1)}° (${(deg - 90).toFixed(1)}°): ${((sm[p] / total) * 100).toFixed(1)}% within ±0.5°`);
}
