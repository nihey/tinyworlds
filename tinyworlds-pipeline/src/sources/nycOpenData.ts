import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { USER_AGENT } from "../env.js";
import type { DataSource, FetchContext } from "./types.js";

const SOCRATA = "https://data.cityofnewyork.us/resource";

const FILES: { file: string; url: string }[] = [
  // the five boroughs, clipped to the shoreline: what counts as "the city" for the fog
  { file: "boroughs.geojson", url: `${SOCRATA}/gthc-hcne.geojson` },
  // 2020 Neighborhood Tabulation Areas: the neighbourhood lines and their names
  { file: "ntas.geojson", url: `${SOCRATA}/9nt8-h7nd.geojson?$limit=5000` },
  // 2015 Street Tree Census: every living street tree, position only
  {
    file: "street_trees.csv",
    url: `${SOCRATA}/uvpi-gqnh.csv?$select=latitude,longitude&$where=status='Alive'&$limit=1000000`,
  },
];

async function download(url: string, dest: string): Promise<number> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmp));
  fs.renameSync(tmp, dest);
  return fs.statSync(dest).size;
}

/** NYC Open Data: the city's own boundary, neighbourhoods and street trees. */
export const nycOpenData: DataSource = {
  name: "nyc-open-data",
  files: FILES.map((f) => f.file),

  async fetch(ctx: FetchContext) {
    for (const { file, url } of FILES) {
      const dest = path.join(ctx.rawDir, file);
      if (!ctx.force && fs.existsSync(dest)) continue;
      const bytes = await download(url, dest);
      ctx.log(`nyc-open-data: ${file} ${(bytes / 1e6).toFixed(1)} MB`);
    }
  },
};
