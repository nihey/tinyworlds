import fs from "node:fs";
import path from "node:path";
import { USER_AGENT } from "../env.js";
import type { DataSource, FetchContext } from "./types.js";

/**
 * Los Angeles County's Countywide Statistical Areas (Enterprise GIS): the county cut into its
 * cities, the City of Los Angeles cut into its communities (Hollywood, Venice, Westwood…), and
 * the unincorporated communities (Marina del Rey, East Los Angeles…). Each feature has
 * `CITY_TYPE` ("City" or "Unincorporated"), `LCITY` (the city, or "Unincorporated") and
 * `COMMUNITY` (blank for a city that is not cut up).
 */
const CSA =
  "https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/eGISBOS_Countywide_Statistical_Areas/FeatureServer/0/query";

export const laCounty: DataSource = {
  name: "la-county",
  files: ["csa.geojson"],

  async fetch(ctx: FetchContext) {
    const dest = path.join(ctx.rawDir, "csa.geojson");
    if (!ctx.force && fs.existsSync(dest)) return;
    const { west, south, east, north } = ctx.bbox;
    const query = new URLSearchParams({
      where: "1=1",
      geometry: `${west},${south},${east},${north}`,
      geometryType: "esriGeometryEnvelope",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "CITY_TYPE,LCITY,COMMUNITY",
      outSR: "4326",
      resultRecordCount: "2000",
      f: "geojson",
    });
    const res = await fetch(`${CSA}?${query}`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${CSA}`);
    const body = (await res.json()) as {
      features?: unknown[];
      properties?: { exceededTransferLimit?: boolean };
      error?: { message?: string };
    };
    if (!body.features) throw new Error(`la-county: ${body.error?.message ?? "no features in the answer"}`);
    // one page holds the whole county (it has a few hundred areas): more would mean the box is wrong
    if (body.properties?.exceededTransferLimit) throw new Error("la-county: more areas than one page holds");
    fs.writeFileSync(`${dest}.part`, JSON.stringify(body));
    fs.renameSync(`${dest}.part`, dest);
    ctx.log(`la-county: csa.geojson, ${body.features.length} areas`);
  },
};
