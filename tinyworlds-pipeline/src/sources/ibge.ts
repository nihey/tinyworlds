import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DuckDBInstance } from "@duckdb/node-api";
import { USER_AGENT } from "../env.js";
import type { DataSource, FetchContext } from "./types.js";

const BASE =
  "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/bairros/shp/UF";

/**
 * IBGE, 2022 census: the "bairros" each municipality declared, as polygons. One shapefile per
 * state; only the municipality asked for is kept, written as `bairros.geojson` with a `name`.
 */
export function ibgeBairros(opts: { uf: string; municipality: string }): DataSource {
  return {
    name: "ibge",
    files: ["bairros.geojson"],

    async fetch(ctx: FetchContext) {
      const dest = path.join(ctx.rawDir, "bairros.geojson");
      if (!ctx.force && fs.existsSync(dest)) return;
      const stem = `${opts.uf}_bairros_CD2022`;
      const zip = path.join(ctx.rawDir, `${stem}.zip`);
      const res = await fetch(`${BASE}/${stem}.zip`, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} for ${stem}.zip`);
      await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(zip));

      const db = await DuckDBInstance.create(":memory:");
      const conn = await db.connect();
      await conn.run("INSTALL spatial; LOAD spatial;");
      const reader = await conn.runAndReadAll(
        `SELECT NM_BAIRRO, ST_AsGeoJSON(geom) FROM ST_Read('/vsizip/${zip.replaceAll("'", "''")}/${stem}.shp')
         WHERE CD_MUN = '${opts.municipality}' ORDER BY NM_BAIRRO`,
      );
      const features = reader.getRows().map((row) => ({
        type: "Feature",
        properties: { name: String(row[0]) },
        geometry: JSON.parse(String(row[1])) as unknown,
      }));
      conn.closeSync();
      fs.rmSync(zip);
      if (features.length === 0) throw new Error(`IBGE has no bairros for municipality ${opts.municipality}`);
      fs.writeFileSync(dest, JSON.stringify({ type: "FeatureCollection", features }));
      ctx.log(`ibge: bairros.geojson, ${features.length} areas`);
    },
  };
}
