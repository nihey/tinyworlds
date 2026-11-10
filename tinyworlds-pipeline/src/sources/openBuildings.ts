import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { DuckDBInstance } from "@duckdb/node-api";
import { fromUrl } from "geotiff";
import { USER_AGENT } from "../env.js";
import { toUtm, utmEpsg, utmZone } from "../geom/utm.js";
import type { DataSource, FetchContext } from "./types.js";

const BUCKET = "open-buildings-temporal-data";
const HOST = "https://storage.googleapis.com";
/** The newest yearly snapshot. */
const SNAPSHOT = "2023_06_30";
/** Metres per pixel to keep: the data's effective resolution (it is published upsampled to 0.5 m). */
const RESOLUTION = 4;
/** A tile is only worth downloading if this many mapped buildings stand on it. */
const MIN_BUILDINGS = 400;
const NODATA = 255;

/** What `heights/index.json` holds. Tiles are rows of bytes, top row first: height in half metres, 255 = no data. */
export interface HeightIndex {
  zone: number;
  south: boolean;
  /** metres per pixel */
  res: number;
  tiles: { file: string; x0: number; y1: number; width: number; height: number }[];
}

interface Manifest {
  uriPrefix: string;
  tilesets: {
    sources: {
      uris: string[];
      affineTransform: { scaleX: number; scaleY: number; translateX: number; translateY: number };
      dimensions: { width: number; height: number };
    }[];
  }[];
  bands: { id: string; tilesetBandIndex?: number }[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

/**
 * Google Open Buildings 2.5D Temporal (CC BY 4.0): a raster of building heights estimated from
 * satellite imagery, for the parts of the world where almost no building has a mapped height.
 * Published as cloud-optimised GeoTIFFs in UTM, so only the height band of one overview level is
 * read. Runs after the Overture source: it uses the building footprints to decide which tiles
 * matter.
 */
export const openBuildings: DataSource = {
  name: "open-buildings",
  files: ["heights/index.json"],

  async fetch(ctx: FetchContext) {
    const dir = path.join(ctx.rawDir, "heights");
    const indexFile = path.join(dir, "index.json");
    if (!ctx.force && fs.existsSync(indexFile)) return;
    fs.mkdirSync(dir, { recursive: true });

    const { west, south, east, north } = ctx.bbox;
    const zone = utmZone((west + east) / 2);
    const isSouth = (south + north) / 2 < 0;
    const suffix = `_EPSG_${utmEpsg(zone, isSouth)}_${SNAPSHOT}.json`;

    // every manifest of this UTM zone and year (they are split by a coarse S2 cell)
    const manifests: string[] = [];
    let page: string | undefined;
    do {
      const list = await getJson<{ items?: { name: string }[]; nextPageToken?: string }>(
        `${HOST}/storage/v1/b/${BUCKET}/o?prefix=v1/manifests/&maxResults=1000&fields=items(name),nextPageToken` +
          (page ? `&pageToken=${encodeURIComponent(page)}` : ""),
      );
      for (const item of list.items ?? []) if (item.name.endsWith(suffix)) manifests.push(item.name);
      page = list.nextPageToken;
    } while (page);

    // where the buildings are, in UTM
    const db = await DuckDBInstance.create(":memory:");
    const conn = await db.connect();
    await conn.run("INSTALL spatial; LOAD spatial;");
    const reader = await conn.runAndReadAll(
      `SELECT ST_X(ST_Centroid(geometry)), ST_Y(ST_Centroid(geometry))
       FROM '${path.join(ctx.rawDir, "building.parquet").replaceAll("'", "''")}'`,
    );
    const buildings = reader.getRows().map((row) => toUtm(Number(row[0]), Number(row[1]), zone, isSouth));
    conn.closeSync();

    const index: HeightIndex = { zone, south: isSouth, res: RESOLUTION, tiles: [] };
    for (const name of manifests) {
      const manifest = await getJson<Manifest>(`${HOST}/${BUCKET}/${name}`);
      const band = manifest.bands.find((b) => b.id === "building_height")?.tilesetBandIndex ?? 1;
      const prefix = manifest.uriPrefix.replace(`gs://${BUCKET}/`, "");
      for (const source of manifest.tilesets[0].sources) {
        const t = source.affineTransform;
        const x0 = t.translateX;
        const y1 = t.translateY;
        const x1 = x0 + source.dimensions.width * t.scaleX;
        const y0 = y1 + source.dimensions.height * t.scaleY;
        let count = 0;
        for (const [x, y] of buildings) if (x >= x0 && x < x1 && y >= y0 && y < y1) count++;
        if (count < MIN_BUILDINGS) continue;

        const started = Date.now();
        // megabyte blocks: the default 64 kB turns one tile into thousands of range requests
        const remote = { headers: { "User-Agent": USER_AGENT }, blockSize: 1 << 20 };
        const tiff = await fromUrl(`${HOST}/${BUCKET}/${prefix}${source.uris[0]}`, remote);
        const want = Math.round((source.dimensions.width * t.scaleX) / RESOLUTION);
        let image = await tiff.getImage(0);
        for (let i = 1; i < (await tiff.getImageCount()); i++) {
          const candidate = await tiff.getImage(i);
          if (Math.abs(candidate.getWidth() - want) <= 1) image = candidate;
        }
        const width = image.getWidth();
        const height = image.getHeight();
        const [raster] = (await image.readRasters({ samples: [band] })) as unknown as [Float32Array];
        const bytes = new Uint8Array(width * height);
        let known = 0;
        for (let i = 0; i < bytes.length; i++) {
          const v = raster[i];
          if (!(v >= 0)) bytes[i] = NODATA;
          else {
            bytes[i] = Math.min(NODATA - 1, Math.round(v * 2));
            known++;
          }
        }
        if (known === 0) continue;
        const file = `${path.basename(path.dirname(source.uris[0]))}_${path.basename(source.uris[0], ".tif")}.u8.gz`;
        fs.writeFileSync(path.join(dir, file), zlib.gzipSync(bytes, { level: 6 }));
        index.tiles.push({ file, x0, y1, width, height });
        ctx.log(
          `open-buildings: ${file} ${width}×${height}, ${count} buildings, ` +
            `${Math.round((known / bytes.length) * 100)}% covered, ${((Date.now() - started) / 1000).toFixed(0)} s`,
        );
      }
    }
    if (index.tiles.length === 0) throw new Error("open-buildings: no height tiles cover this city");
    fs.writeFileSync(indexFile, JSON.stringify(index));
  },
};
