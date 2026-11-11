// Every English Wikipedia article with coordinates in a box, each with the building footprint at
// its point (after `fetch`): the sights to curate when the data names its buildings otherwise
// ("Wells Fargo" for Wells Fargo Tower) or not at all (historic houses, churches).
// Prints TSV: title, the footprint's name, metres from the article's point to it, whether the
// point is inside it, and the footprint's point on surface (lon, lat) for a curated entry.
// usage: node articles.mjs <pipelineDir> <city> <west> <south> <east> <north> [> out.tsv]
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const [pipeArg, city, ...box] = process.argv.slice(2);
const pipe = path.resolve(pipeArg);
const [w, s, e, n] = box.map(Number);
const UA = "tinyworlds-pipeline/0.1 (https://github.com/nihey/tinyworlds)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// geosearch answers at most 500 articles within 10 km of a point: walk the box in 4 km steps
const found = new Map();
const kx = 111195 * Math.cos((((s + n) / 2) * Math.PI) / 180);
for (let lat = s; lat <= n + 0.036; lat += 0.036)
  for (let lon = w; lon <= e + 4000 / kx; lon += 4000 / kx) {
    const q = new URLSearchParams({
      action: "query",
      list: "geosearch",
      gscoord: `${lat}|${lon}`,
      gsradius: "5000",
      gslimit: "500",
      format: "json",
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`https://en.wikipedia.org/w/api.php?${q}`, { headers: { "User-Agent": UA } });
        const body = await res.json();
        for (const g of body.query?.geosearch ?? [])
          if (g.lon > w && g.lon < e && g.lat > s && g.lat < n) found.set(g.title, g);
        break;
      } catch {
        await sleep(2000);
      }
    }
    await sleep(200);
  }

const tsv = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "articles-")), "a.tsv");
fs.writeFileSync(tsv, [...found.values()].map((g) => `${g.title.replaceAll("\t", " ")}\t${g.lon}\t${g.lat}`).join("\n"));
const require = createRequire(path.join(pipe, "package.json"));
const { DuckDBInstance } = require("@duckdb/node-api");
const db = await DuckDBInstance.create(":memory:");
const c = await db.connect();
await c.run("LOAD spatial;");
const building = path.join(pipe, "data", city, "raw", "building.parquet");
const r = await c.runAndReadAll(`
  WITH a AS (SELECT column0 title, column1::DOUBLE lon, column2::DOUBLE lat
             FROM read_csv('${tsv}', delim='\t', header=false, quote='')),
       j AS (SELECT a.title, b.names."primary" bn,
                    round(ST_Distance(ST_Point(a.lon, a.lat), b.geometry) * 111195) d,
                    ST_Contains(b.geometry, ST_Point(a.lon, a.lat)) inside,
                    round(ST_X(ST_PointOnSurface(b.geometry)), 5) blon,
                    round(ST_Y(ST_PointOnSurface(b.geometry)), 5) blat,
                    row_number() OVER (PARTITION BY a.title
                      ORDER BY ST_Contains(b.geometry, ST_Point(a.lon, a.lat)) DESC,
                               ST_Distance(ST_Point(a.lon, a.lat), b.geometry)) rk
             FROM a LEFT JOIN '${building}' b ON ST_DWithin(ST_Point(a.lon, a.lat), b.geometry, 0.0005))
  SELECT title, bn, d, inside, blon, blat FROM j WHERE rk = 1 ORDER BY inside DESC NULLS LAST, d, title`);
console.log(["title", "footprint", "metres", "inside", "lon", "lat"].join("\t"));
for (const row of r.getRows()) console.log(row.map((v) => (v === null ? "∅" : String(v))).join("\t"));
fs.rmSync(path.dirname(tsv), { recursive: true, force: true });
