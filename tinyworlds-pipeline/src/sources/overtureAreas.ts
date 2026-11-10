import fs from "node:fs";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { DataSource, FetchContext } from "./types.js";

/**
 * A city's subdivisions as Overture has them: localities (municipalities and census places) and
 * the neighbourhoods inside them, written as `areas.geojson` with `name`, `kind` ("locality" or
 * "hood") and, for a hood, the `district` (locality) its middle lies in. Runs after the Overture
 * source, from its `division_area.parquet`. For cities whose own open-data portal is not needed
 * for this. `rename` corrects names the data has only in another script.
 */
export function overtureAreas(opts: { rename?: Record<string, string> } = {}): DataSource {
  const rename = opts.rename ?? {};
  return {
    name: "overture-areas",
    files: ["areas.geojson"],

    async fetch(ctx: FetchContext) {
      const dest = path.join(ctx.rawDir, "areas.geojson");
      if (!ctx.force && fs.existsSync(dest)) return;
      const { west, south, east, north } = ctx.bbox;
      const file = path.join(ctx.rawDir, "division_area.parquet").replaceAll("'", "''");
      const db = await DuckDBInstance.create(":memory:");
      const conn = await db.connect();
      await conn.run("INSTALL spatial; LOAD spatial;");
      // the English name where the primary one is in another script; nothing as large as a county
      await conn.run(
        `CREATE TABLE area AS
       SELECT subtype, coalesce(nullif(names.common['en'], ''), names."primary") AS name, geometry,
              ST_X(ST_Centroid(geometry)) AS lon, ST_Y(ST_Centroid(geometry)) AS lat
       FROM '${file}'
       WHERE subtype IN ('locality', 'neighborhood', 'macrohood') AND coalesce(is_land, true)
         AND names."primary" IS NOT NULL AND ST_Area(geometry) < 0.05`,
      );
      const inBox = `lon > ${west} AND lon < ${east} AND lat > ${south} AND lat < ${north}`;
      const reader = await conn.runAndReadAll(
        `SELECT 'locality', name, NULL, ST_AsGeoJSON(geometry) FROM area WHERE subtype = 'locality' AND ${inBox}
       UNION ALL
       SELECT 'hood', h.name,
              (SELECT l.name FROM area l WHERE l.subtype = 'locality' AND ST_Contains(l.geometry, ST_Point(h.lon, h.lat))
               ORDER BY ST_Area(l.geometry) LIMIT 1),
              ST_AsGeoJSON(h.geometry)
       FROM area h WHERE h.subtype <> 'locality' AND ${inBox.replaceAll("lon", "h.lon").replaceAll("lat", "h.lat")}
       ORDER BY 1, 2`,
      );
      const named = (name: string): string => rename[name] ?? name;
      const features = reader.getRows().map((row) => ({
        type: "Feature",
        properties: {
          kind: String(row[0]),
          name: named(String(row[1])),
          ...(row[2] ? { district: named(String(row[2])) } : {}),
        },
        geometry: JSON.parse(String(row[3])) as unknown,
      }));
      conn.closeSync();
      if (features.length === 0)
        throw new Error("overture-areas: no localities or neighbourhoods in the box");
      fs.writeFileSync(dest, JSON.stringify({ type: "FeatureCollection", features }));
      const hoods = features.filter((f) => f.properties.kind === "hood").length;
      ctx.log(
        `overture-areas: areas.geojson, ${features.length - hoods} localities, ${hoods} neighbourhoods`,
      );
    },
  };
}
