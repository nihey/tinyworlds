import fs from "node:fs";
import path from "node:path";
import { USER_AGENT } from "../env.js";
import type { DataSource, FetchContext } from "./types.js";

/**
 * One GeoJSON file of areas a city publishes (its neighbourhoods, as its people name them),
 * downloaded as it is into the raw directory. Pittsburgh's come from the Western Pennsylvania
 * Regional Data Center, Philadelphia's from OpenDataPhilly; the city's `areas()` reads them and
 * its attribution credits them.
 */
export function publishedAreas(opts: { name: string; url: string; file: string }): DataSource {
  return {
    name: opts.name,
    files: [opts.file],

    async fetch(ctx: FetchContext) {
      const dest = path.join(ctx.rawDir, opts.file);
      if (!ctx.force && fs.existsSync(dest)) return;
      const res = await fetch(opts.url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${opts.url}`);
      const body = (await res.json()) as { features?: unknown[] };
      if (!body.features?.length) throw new Error(`${opts.name}: no features in the answer`);
      fs.writeFileSync(`${dest}.part`, JSON.stringify(body));
      fs.renameSync(`${dest}.part`, dest);
      ctx.log(`${opts.name}: ${opts.file}, ${body.features.length} areas`);
    },
  };
}
