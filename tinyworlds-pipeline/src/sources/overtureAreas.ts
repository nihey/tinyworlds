import fs from "node:fs";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { DataSource, FetchContext } from "./types.js";

export interface OvertureAreasOptions {
  /** Corrects names the data has only in another script. */
  rename?: Record<string, string>;
  /** Division subtypes that count as districts (default: localities). */
  districts?: ("locality" | "macrohood")[];
  /** Division subtypes that count as outlined areas (default: neighbourhoods and macrohoods). */
  hoods?: ("neighborhood" | "macrohood" | "microhood")[];
  /** District names to leave out: the city itself where its own districts are listed, regions larger than a town. */
  skip?: RegExp;
  /** Areas larger than this (square degrees) are left out, so no county counts as a town (default 0.05; Dallas is 0.1). */
  maxArea?: number;
  /**
   * Land use areas, by name, that are places of their own though no division says so (Colorado
   * Springs' Air Force Academy, a town in all but name): written as districts like the localities.
   */
  landUse?: string[];
}

/**
 * A city's subdivisions as Overture has them: districts (localities by default: municipalities
 * and census places) and the neighbourhoods inside them, written as `areas.geojson` with `name`,
 * `kind` ("locality" or "hood") and, for a hood, the `district` its middle lies in. Runs after
 * the Overture source, from its `division_area.parquet`. For cities whose own open-data portal
 * is not needed for this.
 */
export function overtureAreas(opts: OvertureAreasOptions = {}): DataSource {
  const rename = opts.rename ?? {};
  const districts: string[] = opts.districts ?? ["locality"];
  const hoods: string[] = (opts.hoods ?? ["neighborhood", "macrohood"]).filter((h) => !districts.includes(h));
  const list = (items: string[]): string => items.map((i) => `'${i}'`).join(", ");
  const skipped = (name: string): boolean => !!opts.skip && opts.skip.test(name);
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
      // the English name where the primary one is in another script; nothing as large as a county.
      // A district counts if it reaches into the box at all; a neighbourhood if its middle is inside.
      await conn.run(
        `CREATE TABLE area AS
         SELECT subtype, coalesce(nullif(names.common['en'], ''), names."primary") AS name, geometry,
                ST_X(ST_Centroid(geometry)) AS lon, ST_Y(ST_Centroid(geometry)) AS lat
         FROM '${file}'
         WHERE subtype IN (${list([...districts, ...hoods])}) AND coalesce(is_land, true)
           AND names."primary" IS NOT NULL AND ST_Area(geometry) < ${opts.maxArea ?? 0.05}`,
      );
      const inBox = (t: string): string =>
        `${t}lon > ${west} AND ${t}lon < ${east} AND ${t}lat > ${south} AND ${t}lat < ${north}`;
      const reader = await conn.runAndReadAll(
        `SELECT 'locality', name, NULL, ST_AsGeoJSON(geometry) FROM area
           WHERE subtype IN (${list(districts)})
             AND ST_XMax(geometry) > ${west} AND ST_XMin(geometry) < ${east}
             AND ST_YMax(geometry) > ${south} AND ST_YMin(geometry) < ${north}
           UNION ALL
         SELECT 'hood', h.name,
                (SELECT string_agg(l.name, '\t' ORDER BY ST_Area(l.geometry)) FROM area l
                 WHERE l.subtype IN (${list(districts)}) AND ST_Contains(l.geometry, ST_Point(h.lon, h.lat))),
                ST_AsGeoJSON(h.geometry)
         FROM area h WHERE h.subtype IN (${list(hoods.length > 0 ? hoods : ["-"])}) AND ${inBox("h.")}
         ORDER BY 1, 2`,
      );
      const named = (name: string): string => rename[name] ?? name;
      const features: { type: string; properties: Record<string, string>; geometry: unknown }[] = [];
      for (const row of reader.getRows()) {
        const kind = String(row[0]);
        const name = String(row[1]);
        if (kind === "locality" && skipped(name)) continue;
        // the smallest district around a hood that is not one of the skipped ones
        const district = row[2]
          ? String(row[2])
              .split("\t")
              .find((d) => !skipped(d))
          : undefined;
        features.push({
          type: "Feature",
          properties: { kind, name: named(name), ...(district ? { district: named(district) } : {}) },
          geometry: JSON.parse(String(row[3])) as unknown,
        });
      }
      if (opts.landUse && opts.landUse.length > 0) {
        const landUse = path.join(ctx.rawDir, "land_use.parquet").replaceAll("'", "''");
        const wanted = opts.landUse.map((n) => `'${n.replaceAll("'", "''")}'`).join(", ");
        const found = await conn.runAndReadAll(
          `SELECT names."primary", ST_AsGeoJSON(geometry) FROM '${landUse}'
           WHERE names."primary" IN (${wanted}) ORDER BY ST_Area(geometry) DESC`,
        );
        const seen = new Set<string>();
        for (const [name, geometry] of found.getRows()) {
          // the largest area of a name: a campus is mapped again as its parts
          if (seen.has(String(name))) continue;
          seen.add(String(name));
          features.push({
            type: "Feature",
            properties: { kind: "locality", name: named(String(name)) },
            geometry: JSON.parse(String(geometry)) as unknown,
          });
        }
        for (const name of opts.landUse)
          if (!seen.has(name)) ctx.log(`overture-areas: no land use area named "${name}"`);
      }
      conn.closeSync();
      if (features.length === 0)
        throw new Error("overture-areas: no localities or neighbourhoods in the box");
      fs.writeFileSync(dest, JSON.stringify({ type: "FeatureCollection", features }));
      const count = features.filter((f) => f.properties.kind === "hood").length;
      ctx.log(`overture-areas: areas.geojson, ${features.length - count} districts, ${count} neighbourhoods`);
    },
  };
}
