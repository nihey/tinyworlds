// The data contract between tinyworlds-pipeline and this viewer.
// The source of truth is the "Data contract" section of the repo's root CLAUDE.md.

export interface ManifestLevel {
  /** 0 = native resolution; level z is downsampled by 2^z */
  z: number;
  cols: number;
  rows: number;
  /** base64 bitset, row-major, bit (tx + ty·cols), LSB-first: 1 = the tile file exists */
  tiles: string;
}

export interface Geo {
  lon0: number;
  lat0: number;
  betaDeg: number;
  k: number;
  kz: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Manifest {
  name: string;
  /** cache-busting id of the render, appended as ?v= to the tiles and the minimap */
  build: string;
  /**
   * cache-busting id of the indexes (places, hoods, life, the sights, their texts and pictures),
   * appended as ?v= to those: they can change without a render. `build` when the file has none.
   */
  indexes: string;
  tileSize: number;
  /** map-px position of tile (z, 0, 0)'s top-left corner, the same for every level */
  origin: { x: number; y: number };
  levels: ManifestLevel[];
  /** content bounds in map px */
  bounds: Bounds;
  start: { lon: number; lat: number; scale: number };
  /** deepest zoom, screen px per map px */
  maxScale: number;
  /** clockwise angle from screen-up to true north */
  northDeg: number;
  geo: Geo;
  /** the image spans `bounds` */
  overview: { src: string; width: number; height: number };
  attribution: string[];
}

export type PlaceType =
  "borough" | "hood" | "landmark" | "park" | "bridge" | "museum" | "station" | "street" | "place";

export interface Place {
  /** name */
  n: string;
  t: PlaceType;
  lon: number;
  lat: number;
  /** borough or other context line */
  b?: string;
  /** rank, higher first on ties */
  r: number;
  /** suggested scale when flying there */
  s?: number;
}

export interface PlacesFile {
  places: Place[];
}

export interface Hood {
  name: string;
  borough: string;
  lon: number;
  lat: number;
  /** flat [lon0, lat0, lon1, lat1, ...] per ring */
  rings: number[][];
}

export interface HoodsFile {
  hoods: Hood[];
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Checks the parts of a manifest the viewer cannot run without, so a broken or
 * half-written file fails loudly at load time instead of as NaN math later.
 */
export function parseManifest(json: unknown): Manifest {
  const fail = (what: string): never => {
    throw new Error(`manifest.json: ${what}`);
  };
  if (!isObj(json)) return fail("not an object");
  const m = json as Partial<Manifest> & Record<string, unknown>;
  if (!isNum(m.tileSize) || m.tileSize <= 0) fail("tileSize");
  if (!isObj(m.origin) || !isNum(m.origin.x) || !isNum(m.origin.y)) fail("origin");
  if (!Array.isArray(m.levels) || m.levels.length === 0) fail("levels");
  for (const l of m.levels!) {
    if (!isObj(l) || !isNum(l.z) || !isNum(l.cols) || !isNum(l.rows) || typeof l.tiles !== "string")
      fail("levels[]");
  }
  const b = m.bounds;
  if (!isObj(b) || !isNum(b.minX) || !isNum(b.minY) || !isNum(b.maxX) || !isNum(b.maxY))
    fail("bounds");
  if (b!.maxX <= b!.minX || b!.maxY <= b!.minY) fail("bounds are empty");
  const g = m.geo;
  if (!isObj(g) || !isNum(g.lon0) || !isNum(g.lat0) || !isNum(g.betaDeg) || !isNum(g.k))
    fail("geo");
  if (g!.k <= 0) fail("geo.k");
  const s = m.start;
  if (!isObj(s) || !isNum(s.lon) || !isNum(s.lat) || !isNum(s.scale)) fail("start");
  if (!isNum(m.maxScale) || m.maxScale <= 0) fail("maxScale");

  const levels = [...m.levels!].sort((a, c) => a.z - c.z);
  return {
    name: typeof m.name === "string" ? m.name : "",
    build: typeof m.build === "string" ? m.build : "",
    indexes:
      typeof m.indexes === "string" && m.indexes !== ""
        ? m.indexes
        : typeof m.build === "string"
          ? m.build
          : "",
    tileSize: m.tileSize!,
    origin: m.origin!,
    levels,
    bounds: m.bounds!,
    start: m.start!,
    maxScale: m.maxScale!,
    northDeg: isNum(m.northDeg) ? m.northDeg : 0,
    geo: m.geo!,
    overview:
      isObj(m.overview) && typeof m.overview.src === "string"
        ? m.overview
        : { src: "overview.webp", width: 0, height: 0 },
    attribution: Array.isArray(m.attribution)
      ? m.attribution.filter((a) => typeof a === "string")
      : [],
  };
}
