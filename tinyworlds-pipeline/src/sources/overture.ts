import fs from "node:fs";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { OVERTURE_RELEASE } from "../env.js";
import type { DataSource, FetchContext } from "./types.js";

/** Overture theme/type pairs copied to local Parquet, clipped to the city's bounding box. */
const LAYERS: { file: string; theme: string; type: string; where?: string }[] = [
  { file: "building", theme: "buildings", type: "building" },
  { file: "building_part", theme: "buildings", type: "building_part" },
  { file: "land", theme: "base", type: "land" },
  { file: "water", theme: "base", type: "water" },
  { file: "land_use", theme: "base", type: "land_use" },
  { file: "land_cover", theme: "base", type: "land_cover" },
  { file: "infrastructure", theme: "base", type: "infrastructure" },
  { file: "segment", theme: "transportation", type: "segment" },
  { file: "place", theme: "places", type: "place", where: "confidence >= 0.6" },
  { file: "division", theme: "divisions", type: "division" },
  { file: "division_area", theme: "divisions", type: "division_area" },
];

/**
 * Overture Maps (OpenStreetMap plus other open sources, one schema): buildings with heights,
 * land, water, land use, roads and places. Read straight from the public bucket with DuckDB,
 * which only downloads the row groups that touch the bounding box.
 */
export const overture: DataSource = {
  name: "overture",
  files: LAYERS.map((l) => `${l.file}.parquet`),

  async fetch(ctx: FetchContext) {
    const todo = LAYERS.filter(
      (l) => ctx.force || !fs.existsSync(path.join(ctx.rawDir, `${l.file}.parquet`)),
    );
    if (todo.length === 0) return ctx.log("overture: everything already downloaded");

    const db = await DuckDBInstance.create(":memory:");
    const conn = await db.connect();
    await conn.run("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';");
    const base = `s3://overturemaps-us-west-2/release/${OVERTURE_RELEASE}`;
    const { west, south, east, north } = ctx.bbox;
    const inBox = `bbox.xmin < ${east} AND bbox.xmax > ${west} AND bbox.ymin < ${north} AND bbox.ymax > ${south}`;

    for (const layer of todo) {
      const started = Date.now();
      const dest = path.join(ctx.rawDir, `${layer.file}.parquet`);
      const tmp = `${dest}.part`;
      const where = layer.where ? `${inBox} AND ${layer.where}` : inBox;
      await conn.run(
        `COPY (
           SELECT * EXCLUDE (sources)
           FROM read_parquet('${base}/theme=${layer.theme}/type=${layer.type}/*', hive_partitioning=1)
           WHERE ${where}
         ) TO '${tmp}' (FORMAT parquet, COMPRESSION zstd)`,
      );
      fs.renameSync(tmp, dest);
      const mb = (fs.statSync(dest).size / 1e6).toFixed(1);
      ctx.log(`overture: ${layer.file} ${mb} MB in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
    conn.closeSync();
  },
};
