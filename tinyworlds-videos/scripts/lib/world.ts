import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Sharp } from "sharp";
import { CITIES } from "../../../tinyworlds-pipeline/src/cities/index.js";
import { makeProjection } from "../../../tinyworlds-pipeline/src/projection.js";
import { cutPlate as cutFromTiles, type PlateFrame } from "../../../tinyworlds-pipeline/src/render/plate.js";

/**
 * What the videos read about a world: its tiles and manifest as the viewer gets them
 * (tinyworlds-frontend/public/data/<world>/) and its card framing and accent as the pipeline
 * has them. Nothing is redrawn: every picture is cut from the tiles a visitor sees.
 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const REPO = path.resolve(ROOT, "..");
export const DATA = path.join(REPO, "tinyworlds-frontend/public/data");

export interface Manifest {
  name: string;
  tileSize: number;
  origin: { x: number; y: number };
  levels: { z: number; cols: number; rows: number }[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  maxScale: number;
  geo: { lon0: number; lat0: number; betaDeg: number; k: number; kz: number };
}

export interface World {
  id: string;
  /** the half of the wordmark after "tiny" */
  suffix: string;
  accent: string;
  card: { lon: number; lat: number; shrink: number };
  manifest: Manifest;
  /** lon/lat → map px (level 0) */
  toMap(lon: number, lat: number): { x: number; y: number };
}

export const WORLD_IDS = Object.keys(CITIES);

export function loadWorld(id: string): World {
  const city = CITIES[id];
  if (!city) throw new Error(`Unknown world "${id}". Known: ${WORLD_IDS.join(", ")}`);
  const file = path.join(DATA, id, "manifest.json");
  if (!fs.existsSync(file))
    throw new Error(`No map data for ${id}: run the pipeline for it first (${file}).`);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
  const projection = makeProjection(manifest.geo);
  return {
    id,
    suffix: id.replace(/^tiny/, ""),
    accent: city.accent,
    card: city.card,
    manifest,
    toMap: (lon, lat) => {
      const [x, y] = projection.toMap(lon, lat);
      return { x, y };
    },
  };
}

/**
 * Cut a picture out of the map: `width` × `height` px, centred on the map point (cx, cy), each
 * pixel standing for `shrink` map px (the pipeline's own cutter, on this world's tiles).
 */
export function cutPlate(world: World, frame: PlateFrame): Promise<Sharp> {
  return cutFromTiles(path.join(DATA, world.id), world.manifest, frame);
}
