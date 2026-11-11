import fs from "node:fs";
import path from "node:path";
import { DuckDBBlobValue, DuckDBInstance, type DuckDBConnection, type DuckDBValue } from "@duckdb/node-api";
import { CITY, DIRS } from "../config.js";
import type { Polygons } from "../cities/types.js";
import { readAreas } from "../geom/geojson.js";
import { GeomKind, readWkb } from "../geom/wkb.js";
import { EARTH_RADIUS, makeGeo, makeProjection, type Projection } from "../projection.js";
import { fillPolygon } from "../render/raster.js";
import {
  buildFog,
  buildFogBuiltUp,
  distanceTransform,
  FOG,
  fogAt,
  type FogGrid,
  type Footprint,
} from "./fog.js";
import { distanceAlong, holdDecks, type DeckPath, type DeckRun } from "./decks.js";
import { hashString, mix, rand } from "./hash.js";
import { loadHeights } from "./heights.js";
import { buildSyntheticScene } from "./synthetic.js";
import { cantileverTruss, type Truss } from "./truss.js";
import { F_FLOATING, F_NO_OUTLINE, G, Pattern, Roof } from "./kinds.js";
import { nearestBridge, type Owners } from "./owners.js";
import { LineSink, PolySink } from "./sinks.js";
import { f32, u32, u8, writeScene } from "./store.js";
import { R } from "../render/palette.js";
import { chooseStyle, type Style } from "./styles.js";

/**
 * Raw open data → a scene: flat typed arrays in map pixels that the renderer can draw without
 * knowing where anything came from.
 *
 *   ground   polygons tagged with a ground kind
 *   lines    roads, rails, piers and streams: paths with a kind and a width in metres
 *   volumes  extruded footprints: buildings, building parts, tanks
 *   trees    points
 *   fog      distance from the city, which decides where the map ends
 */

export const GEO = makeGeo(CITY.origin.lon, CITY.origin.lat, CITY.betaDeg, CITY.k);

/** Line flags. */
export const L_BRIDGE = 1;

// ---------------------------------------------------------------------------------------------
// projection scratch
// ---------------------------------------------------------------------------------------------

let gridBuf = new Float64Array(4096);
let mapBuf = new Float64Array(4096);

/**
 * Project a lon/lat path into `gridBuf` (metres) and `mapBuf` (px), dropping repeated points and,
 * for rings, the closing duplicate. Returns the number of points kept.
 */
function project(proj: Projection, lonlat: Float64Array, ring: boolean): number {
  const count = lonlat.length / 2;
  if (gridBuf.length < count * 2) {
    gridBuf = new Float64Array(count * 2);
    mapBuf = new Float64Array(count * 2);
  }
  let n = 0;
  for (let i = 0; i < count; i++) {
    const [p, q] = proj.toGrid(lonlat[i * 2], lonlat[i * 2 + 1]);
    if (n > 0 && Math.abs(p - gridBuf[n * 2 - 2]) < 0.01 && Math.abs(q - gridBuf[n * 2 - 1]) < 0.01) continue;
    gridBuf[n * 2] = p;
    gridBuf[n * 2 + 1] = q;
    n++;
  }
  if (
    ring &&
    n > 1 &&
    Math.abs(gridBuf[0] - gridBuf[n * 2 - 2]) < 0.01 &&
    Math.abs(gridBuf[1] - gridBuf[n * 2 - 1]) < 0.01
  )
    n--;
  const k = proj.geo.k;
  for (let i = 0; i < n; i++) {
    const p = gridBuf[i * 2];
    const q = gridBuf[i * 2 + 1];
    mapBuf[i * 2] = (p + q) * k;
    mapBuf[i * 2 + 1] = ((q - p) * k) / 2;
  }
  return n;
}

/** Signed area (m²) of the ring currently in gridBuf. */
function gridArea(n: number): number {
  let sum = 0;
  let ap = gridBuf[n * 2 - 2];
  let aq = gridBuf[n * 2 - 1];
  for (let i = 0; i < n; i++) {
    const bp = gridBuf[i * 2];
    const bq = gridBuf[i * 2 + 1];
    sum += ap * bq - bp * aq;
    ap = bp;
    aq = bq;
  }
  return sum / 2;
}

// ---------------------------------------------------------------------------------------------
// classification
// ---------------------------------------------------------------------------------------------

function landKind(subtype: string | null, cls: string | null): number {
  switch (subtype) {
    case "land":
      return G.Land;
    case "forest":
      return G.Forest;
    case "shrub":
      return G.Scrub;
    case "wetland":
      return G.Wetland;
    case "sand":
      return G.Sand;
    case "rock":
      if (cls && CITY.ground.land?.[cls] !== undefined) return CITY.ground.land[cls];
      return cls === "bare_rock" || cls === "rock" || cls === "shingle" || cls === "scree" ? G.Rock : -1;
    case "grass":
      return G.Lawn;
    default:
      return -1;
  }
}

function landCoverKind(subtype: string | null): number {
  switch (subtype) {
    case "forest":
      return G.Park;
    case "shrub":
      return G.Scrub;
    case "wetland":
      return G.Wetland;
    case "crop":
    case "grass":
      return G.Lawn;
    default:
      return -1;
  }
}

const COURT_BLUE = new Set(["tennis", "pickleball", "padel"]);
const COURT_GREEN = new Set([
  "basketball",
  "american_handball",
  "volleyball",
  "four_square",
  "skateboard",
  "boules",
  "handball",
  "netball",
  "multi",
  "badminton",
  "roller_hockey",
  "ice_hockey",
]);

function landUseKind(subtype: string | null, cls: string | null, sport: string | null): number {
  switch (cls) {
    case "park":
    case "dog_park":
    case "village_green":
    case "recreation_ground":
    case "golf_course":
    case "rough":
    case "zoo":
      return G.Park;
    case "grass":
    case "meadow":
    case "farmland":
    case "animal_keeping":
      return G.Lawn;
    case "garden":
    case "flowerbed":
    case "allotments":
    case "plant_nursery":
      return G.Garden;
    case "pitch": {
      const first = sport?.split(";")[0] ?? "";
      if (COURT_BLUE.has(first)) return G.Court;
      if (COURT_GREEN.has(first)) return G.CourtGreen;
      if (first === "baseball" || first === "softball") return G.Diamond;
      if (first === "athletics" || first === "running") return G.Track;
      return G.Pitch;
    }
    case "track":
      return G.Track;
    case "playground":
      return G.Playground;
    case "fairway":
    case "driving_range":
      return G.Fairway;
    case "green":
    case "tee":
      return G.GolfGreen;
    case "bunker":
      return G.Bunker;
    case "water_hazard":
    case "lateral_water_hazard":
      return G.Lake;
    case "cemetery":
    case "grave_yard":
      return G.Cemetery;
    case "pedestrian":
    case "plaza":
    case "traffic_island":
      return G.Plaza;
    case "industrial":
    case "works":
      return G.Industrial;
    case "railway":
      return G.Railyard;
    case "construction":
    case "brownfield":
    case "greenfield":
    case "landfill":
    case "quarry":
      return G.Construction;
    default:
      return subtype === "park" ? G.Park : -1;
  }
}

function waterKind(subtype: string | null, cls: string | null): number {
  if (subtype === "ocean" || subtype === "physical") return -1; // the sea is the default
  if (cls === "swimming_pool") return G.Pool;
  return G.Lake;
}

interface RoadSpec {
  kind: number;
  width: number;
}

function roadSpec(cls: string | null, subclass: string | null): RoadSpec | null {
  if (subclass === "sidewalk" || subclass === "crosswalk" || subclass === "cycle_crossing") return null;
  const link = subclass === "link" ? 0.6 : 1;
  switch (cls) {
    case "motorway":
      return { kind: G.Highway, width: 14 * link };
    case "trunk":
      return { kind: G.Highway, width: 13 * link };
    case "primary":
      return { kind: G.RoadMajor, width: 17 * link };
    case "secondary":
      return { kind: G.RoadMajor, width: 14 * link };
    case "tertiary":
      return { kind: G.Road, width: 12 * link };
    case "residential":
    case "unclassified":
    case "living_street":
    case "unknown":
      return { kind: G.Road, width: 10 };
    case "service":
      return { kind: G.Service, width: subclass === "driveway" ? 3.4 : subclass === "alley" ? 4 : 5 };
    case "pedestrian":
      return { kind: G.Plaza, width: 7 };
    case "footway":
    case "path":
    case "cycleway":
    case "track":
    case "bridleway":
      return { kind: G.Path, width: 2.6 };
    case "steps":
      return { kind: G.Path, width: 2.2 };
    default:
      return null;
  }
}

function fallbackHeight(cls: string | null, floors: number | null, area: number, seed: number): number {
  if (floors && floors > 0) return floors * CITY.heights.storey + 1;
  if (cls === "garage" || cls === "garages" || cls === "shed" || cls === "carport" || cls === "roof")
    return 2.8;
  if (cls === "house" || cls === "detached" || cls === "semidetached_house") return 6.4 + rand(seed, 9) * 2.4;
  if (area < 40) return 2.8;
  if (area > 2500) return 8 + rand(seed, 9) * 4;
  return 6 + rand(seed, 9) * 5;
}

// ---------------------------------------------------------------------------------------------
// linear referencing
// ---------------------------------------------------------------------------------------------

interface Rule {
  values?: string[] | null;
  value?: number | null;
  between?: [number, number] | null;
}

/** Cut the path in gridBuf (n points) to the fraction [a, b] of its length; writes map px into `out`. */
function slicePath(n: number, a: number, b: number, k: number, out: number[]): number {
  out.length = 0;
  let total = 0;
  for (let i = 1; i < n; i++)
    total += Math.hypot(gridBuf[i * 2] - gridBuf[i * 2 - 2], gridBuf[i * 2 + 1] - gridBuf[i * 2 - 1]);
  if (total <= 0) return 0;
  const from = a * total;
  const to = b * total;
  const emit = (p: number, q: number): void => {
    out.push((p + q) * k, ((q - p) * k) / 2);
  };
  let walked = 0;
  for (let i = 1; i < n; i++) {
    const p0 = gridBuf[i * 2 - 2];
    const q0 = gridBuf[i * 2 - 1];
    const p1 = gridBuf[i * 2];
    const q1 = gridBuf[i * 2 + 1];
    const len = Math.hypot(p1 - p0, q1 - q0);
    const s0 = walked;
    const s1 = walked + len;
    walked = s1;
    if (s1 < from || len === 0) continue;
    if (s0 > to) break;
    if (out.length === 0) {
      const t = Math.max(0, (from - s0) / len);
      emit(p0 + (p1 - p0) * t, q0 + (q1 - q0) * t);
    }
    const t = Math.min(1, (to - s0) / len);
    emit(p0 + (p1 - p0) * t, q0 + (q1 - q0) * t);
  }
  return out.length / 2;
}

const covers = (rules: Rule[], at: number, test: (r: Rule) => boolean): boolean =>
  rules.some((r) => test(r) && (!r.between || (at >= r.between[0] && at <= r.between[1])));

// ---------------------------------------------------------------------------------------------
// the build
// ---------------------------------------------------------------------------------------------

async function each(conn: DuckDBConnection, sql: string, fn: (row: DuckDBValue[]) => void): Promise<number> {
  const result = await conn.stream(sql);
  let rows = 0;
  for (;;) {
    const chunk = await result.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    for (const row of chunk.getRows()) {
      fn(row);
      rows++;
    }
  }
  return rows;
}

const str = (v: DuckDBValue): string | null => (typeof v === "string" ? v : null);
const num = (v: DuckDBValue): number | null =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : null;
const blob = (v: DuckDBValue): Uint8Array | null => (v instanceof DuckDBBlobValue ? v.bytes : null);

export interface BuildOptions {
  log?: (msg: string) => void;
}

const quote = (file: string): string => path.join(DIRS.raw, file).replaceAll("'", "''");

/** The fog grid for the active city: how far every point is from what counts as the city. */
export async function cityFog(conn: DuckDBConnection, proj: Projection): Promise<FogGrid> {
  const limits = CITY.limits;
  if (limits.kind === "geojson") {
    const polygons = readAreas(path.join(DIRS.raw, limits.file)).flatMap((f) => f.polygons);
    return buildFog(polygons, proj);
  }
  let polygons: Polygons;
  if (limits.division) {
    const outline = await conn.runAndReadAll(
      `SELECT ST_AsGeoJSON(geometry) FROM '${quote("division_area.parquet")}'
       WHERE names."primary" = '${limits.division.replaceAll("'", "''")}' AND subtype = 'locality'
       ORDER BY ST_Area(geometry) DESC LIMIT 1`,
    );
    const row = outline.getRows()[0];
    if (!row) throw new Error(`no division area called "${limits.division}" in the raw data`);
    const geometry = JSON.parse(String(row[0])) as { type: string; coordinates: unknown };
    polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates as number[][][]]
        : (geometry.coordinates as Polygons);
  } else {
    // no division: whatever is built up inside the bounding box
    const { west, south, east, north } = CITY.bbox;
    polygons = [
      [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    ];
  }

  // square degrees → m² at the city's latitude
  const rad = Math.PI / 180;
  const m2 = (rad * EARTH_RADIUS) ** 2 * Math.cos(CITY.origin.lat * rad);
  const footprints: Footprint[] = [];
  await each(
    conn,
    `SELECT ST_X(ST_Centroid(geometry)), ST_Y(ST_Centroid(geometry)), ST_Area(geometry) FROM '${quote("building.parquet")}'`,
    (r) => footprints.push({ lon: Number(r[0]), lat: Number(r[1]), area: Number(r[2]) * m2 }),
  );
  const parks: Polygons = [];
  if (limits.parks && limits.parks.length > 0) {
    const names = limits.parks.map((name) => `'${name.replaceAll("'", "''")}'`).join(", ");
    await each(
      conn,
      `SELECT ST_AsGeoJSON(geometry) FROM '${quote("land_use.parquet")}' WHERE names."primary" IN (${names})`,
      (r) => {
        const geometry = JSON.parse(String(r[0])) as { type: string; coordinates: unknown };
        if (geometry.type === "Polygon") parks.push(geometry.coordinates as number[][][]);
        else if (geometry.type === "MultiPolygon") parks.push(...(geometry.coordinates as Polygons));
      },
    );
    if (parks.length === 0) throw new Error(`none of the parks ${names} is in the land use data`);
  }
  return buildFogBuiltUp(polygons, footprints, proj, parks);
}

export async function buildScene(opts: BuildOptions = {}): Promise<void> {
  // a city with no map data draws itself: see scene/synthetic.ts
  if (CITY.synthetic) return buildSyntheticScene(opts);
  const log = opts.log ?? ((m: string) => console.log(m));
  const proj = makeProjection(GEO);
  const k = GEO.k;
  const raw = quote;

  let started = Date.now();
  const lap = (label: string): void => {
    log(`scene: ${label} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    started = Date.now();
  };

  const db = await DuckDBInstance.create(":memory:");
  const conn = await db.connect();
  await conn.run("INSTALL spatial; LOAD spatial;");

  // ---- fog: where the map ends
  const fog: FogGrid = await cityFog(conn, proj);
  const keepLimit = FOG.end + 150;
  /** Is the (already projected) first point of the current path close enough to the city to draw? */
  const near = (): boolean => fogAt(fog, gridBuf[0], gridBuf[1]) < keepLimit;
  /**
   * The same question for a ring of n points that may be far larger than the map (a hundred
   * square kilometres of cropland): its first corner says nothing, so look for kept ground
   * anywhere under its bounding box.
   */
  const nearRing = (n: number): boolean => {
    if (near()) return true;
    let pMin = Infinity;
    let pMax = -Infinity;
    let qMin = Infinity;
    let qMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = gridBuf[i * 2];
      const q = gridBuf[i * 2 + 1];
      if (p < pMin) pMin = p;
      if (p > pMax) pMax = p;
      if (q < qMin) qMin = q;
      if (q > qMax) qMax = q;
    }
    if (pMax - pMin < 400 && qMax - qMin < 400) return false;
    const x0 = Math.max(0, Math.floor((pMin - fog.p0) / fog.cell));
    const x1 = Math.min(fog.cols - 1, Math.ceil((pMax - fog.p0) / fog.cell));
    const y0 = Math.max(0, Math.floor((qMin - fog.q0) / fog.cell));
    const y1 = Math.min(fog.rows - 1, Math.ceil((qMax - fog.q0) / fog.cell));
    for (let y = y0; y <= y1; y += 4)
      for (let x = x0; x <= x1; x += 4) if (fog.d[y * fog.cols + x] < keepLimit) return true;
    return false;
  };
  lap(`fog grid ${fog.cols}×${fog.rows}`);

  // every piece of land (in New York, New Jersey included) on the same grid: bridges rise with their distance from it
  const landMask = new Uint8Array(fog.cols * fog.rows);
  const stampLand = (bytes: Uint8Array, value = 1): void => {
    const geom = readWkb(bytes);
    if (!geom || geom.kind !== GeomKind.Polygon) return;
    for (const rings of geom.parts) {
      const xy: number[] = [];
      const starts = [0];
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i += 2) {
          const [p, q] = proj.toGrid(ring[i], ring[i + 1]);
          xy.push((p - fog.p0) / fog.cell, (q - fog.q0) / fog.cell);
        }
        starts.push(xy.length / 2);
      }
      fillPolygon(xy, starts, 0, rings.length, 0, 0, fog.cols, fog.rows, (y, a, b) =>
        landMask.fill(value, y * fog.cols + a, y * fog.cols + b),
      );
    }
  };

  const ground = new PolySink();
  const groundKind = u8();
  const lines = new LineSink();
  const volumes = new PolySink();
  /** Buildings named among a bridge's other names (`sights.bridges`): their volumes, by lower-case name. */
  const bridgeBuildings = new Map<string, { name: string; vols: number[] }>();
  for (const names of Object.values(CITY.sights?.bridges ?? {}))
    for (const name of names) bridgeBuildings.set(name.toLowerCase(), { name, vols: [] });
  const vol = {
    base: f32(),
    top: f32(),
    roofH: f32(),
    roofShape: u8(),
    wall: u8(),
    roof: u8(),
    glass: u8(),
    pattern: u8(),
    flags: u8(),
    seed: u32(),
    ridge: f32(),
    center: f32(),
    area: f32(),
  };
  const treeXY = f32();
  const treeKind = u8();

  /** Add every polygon of a geometry as ground of one kind. `big` features skip the fog test. */
  const addGround = (bytes: Uint8Array | null, kind: number, always = false): void => {
    if (!bytes || kind < 0) return;
    const geom = readWkb(bytes);
    if (!geom || geom.kind !== GeomKind.Polygon) return;
    for (const rings of geom.parts) {
      let open = false;
      for (let r = 0; r < rings.length; r++) {
        const n = project(proj, rings[r], true);
        if (r === 0) {
          if (n < 3 || (!always && !nearRing(n))) break;
          ground.begin();
          open = true;
        }
        if (n >= 3) ground.ring(mapBuf, n);
      }
      if (open) {
        ground.end();
        groundKind.push(kind);
      }
    }
  };

  const addTree = (lon: number, lat: number, seed: number): void => {
    const [p, q] = proj.toGrid(lon, lat);
    if (fogAt(fog, p, q) >= keepLimit) return;
    treeXY.push2((p + q) * k, ((q - p) * k) / 2);
    treeKind.push(seed & 0xff);
  };

  // ---- land, then everything that sits on it
  await each(
    conn,
    `SELECT subtype, class, ST_AsWKB(geometry), ST_GeometryType(geometry)::VARCHAR FROM '${raw("land.parquet")}'`,
    (row) => {
      const subtype = str(row[0]);
      const cls = str(row[1]);
      const type = str(row[3]);
      const bytes = blob(row[2]);
      if (!bytes) return;
      if (type === "POINT") {
        if (subtype !== "tree") return;
        const g = readWkb(bytes);
        if (g) addTree(g.parts[0][0][0], g.parts[0][0][1], treeKind.length * 2654435761);
        return;
      }
      if (type === "LINESTRING") {
        if (cls !== "tree_row") return;
        const g = readWkb(bytes);
        if (!g) return;
        const n = project(proj, g.parts[0][0], false);
        // a tree every nine metres along the row
        for (let i = 1; i < n; i++) {
          const p0 = gridBuf[i * 2 - 2];
          const q0 = gridBuf[i * 2 - 1];
          const p1 = gridBuf[i * 2];
          const q1 = gridBuf[i * 2 + 1];
          const steps = Math.max(1, Math.round(Math.hypot(p1 - p0, q1 - q0) / 9));
          for (let s = 0; s < steps; s++) {
            const t = s / steps;
            const p = p0 + (p1 - p0) * t;
            const q = q0 + (q1 - q0) * t;
            if (fogAt(fog, p, q) >= keepLimit) continue;
            treeXY.push2((p + q) * k, ((q - p) * k) / 2);
            treeKind.push(mix(treeKind.length, 77) & 0xff);
          }
        }
        return;
      }
      if (subtype === "land") stampLand(bytes);
      addGround(bytes, landKind(subtype, cls), subtype === "land");
    },
  );
  // a river inside the land polygons (the Ohio) is land to them: cut the water out again
  if (CITY.riverBridges)
    await each(
      conn,
      `SELECT ST_AsWKB(geometry) FROM '${raw("water.parquet")}'
       WHERE ST_GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON')
         AND coalesce(class, '') NOT IN ('swimming_pool', 'fountain', 'reflecting_pool')`,
      (row) => {
        const bytes = blob(row[0]);
        if (bytes) stampLand(bytes, 0);
      },
    );
  const shore: FogGrid = {
    ...fog,
    d: distanceTransform(landMask, fog.cols, fog.rows).map((d) => d * fog.cell),
  };
  /** How high a bridge deck stands (metres) at a point: it climbs as it leaves the shore. */
  const deckHeight = (p: number, q: number): number => {
    const d = fogAt(shore, p, q);
    if (d > 1e8 || d <= 10) return 0;
    const t = Math.min(1, (d - 10) / 210);
    // wide water (the Narrows, the Hudson) gets a higher crossing
    return 41 * t * t * (3 - 2 * t) + Math.max(0, Math.min(24, (d - 330) * 0.1));
  };
  lap(`land: ${ground.count} polygons, ${treeKind.length} mapped trees`);

  // land cover comes at several levels of generalisation, one on top of another: take the detailed one
  const coverKind = CITY.ground.landCover ?? {};
  await each(
    conn,
    `SELECT subtype, ST_AsWKB(geometry) FROM '${raw("land_cover.parquet")}' WHERE cartography.min_zoom >= 8`,
    (row) => {
      const subtype = str(row[0]);
      addGround(blob(row[1]), (subtype ? coverKind[subtype] : undefined) ?? landCoverKind(subtype));
    },
  );
  const useKind = CITY.ground.landUse ?? {};
  await each(
    conn,
    `SELECT subtype, class, source_tags['sport'], ST_AsWKB(geometry) FROM '${raw("land_use.parquet")}'
     WHERE ST_GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON') AND subtype <> 'protected'`,
    (row) => {
      const cls = str(row[1]);
      addGround(blob(row[3]), (cls ? useKind[cls] : undefined) ?? landUseKind(str(row[0]), cls, str(row[2])));
    },
  );
  const dryWater = new Set(CITY.ground.dryWater ?? []);
  await each(
    conn,
    `SELECT subtype, class, ST_AsWKB(geometry), names."primary" FROM '${raw("water.parquet")}'
     WHERE ST_GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON')`,
    (row) => {
      const name = str(row[3]);
      if (!(name && dryWater.has(name))) addGround(blob(row[2]), waterKind(str(row[0]), str(row[1])));
    },
  );
  lap(`land cover, land use, water: ${ground.count} polygons`);

  // ---- infrastructure: lots, piers, aprons, tanks, runways
  const tanks: { bytes: Uint8Array; height: number | null; cls: string }[] = [];
  const supports: { bytes: Uint8Array; height: number }[] = [];
  await each(
    conn,
    `SELECT subtype, class, height, ST_AsWKB(geometry), ST_GeometryType(geometry)::VARCHAR FROM '${raw("infrastructure.parquet")}'
     WHERE subtype IN ('transit', 'pier', 'airport', 'utility', 'bridge', 'power')
       AND ST_GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON', 'LINESTRING')`,
    (row) => {
      const cls = str(row[1]);
      const bytes = blob(row[3]);
      if (!bytes) return;
      if (str(row[4]) === "LINESTRING") {
        let kind = -1;
        let width = 0;
        if (cls === "pier") [kind, width] = [G.Pier, 3.2];
        else if (cls === "boardwalk") [kind, width] = [G.Pier, 4];
        else if (cls === "runway") [kind, width] = [G.Runway, 46];
        else if (cls === "taxiway") [kind, width] = [G.Taxiway, 22];
        else if (cls === "taxilane") [kind, width] = [G.Taxiway, 14];
        if (kind < 0) return;
        const g = readWkb(bytes);
        if (!g) return;
        const n = project(proj, g.parts[0][0], false);
        if (n >= 2 && near()) lines.add(mapBuf, n, kind, width, 0);
        return;
      }
      if (cls === "parking") addGround(bytes, G.Parking);
      else if (cls === "pier") addGround(bytes, G.Pier);
      else if (cls === "apron") addGround(bytes, G.Apron);
      else if (cls === "helipad" || cls === "platform") addGround(bytes, G.Plaza);
      else if (cls === "substation") addGround(bytes, G.Industrial);
      else if (cls === "storage_tank" || cls === "water_tower" || cls === "silo")
        tanks.push({ bytes, height: num(row[2]), cls });
      else if (cls === "bridge_support" && (num(row[2]) ?? 0) > 3)
        supports.push({ bytes, height: num(row[2])! });
    },
  );
  lap(`infrastructure: ${ground.count} polygons, ${lines.count} lines, ${tanks.length} tanks`);

  // ---- streams
  await each(
    conn,
    `SELECT subtype, class, ST_AsWKB(geometry) FROM '${raw("water.parquet")}'
     WHERE ST_GeometryType(geometry) = 'LINESTRING' AND subtype IN ('stream', 'river', 'canal')`,
    (row) => {
      const g = readWkb(blob(row[2])!);
      if (!g) return;
      const cls = str(row[1]);
      const width = str(row[0]) === "river" ? 8 : cls === "canal" ? 5 : cls === "stream" ? 3 : 2;
      const n = project(proj, g.parts[0][0], false);
      if (n >= 2 && near()) lines.add(mapBuf, n, G.Lake, width, 0);
    },
  );

  // ---- roads and rails
  const street = CITY.trees.street;
  /**
   * Line a street (the path in gridBuf) with trees along both kerbs, by rule: candidate spots at
   * a regular spacing, each kept by chance, more often in some neighbourhoods than in others.
   * The renderer drops any that land on a building or a road.
   */
  const plantStreet = (n: number, width: number): void => {
    if (!street) return;
    let next = street.spacing / 2;
    for (let i = 1; i < n; i++) {
      const p0 = gridBuf[i * 2 - 2];
      const q0 = gridBuf[i * 2 - 1];
      const len = Math.hypot(gridBuf[i * 2] - p0, gridBuf[i * 2 + 1] - q0);
      if (len < 0.01) continue;
      const up = (gridBuf[i * 2] - p0) / len;
      const uq = (gridBuf[i * 2 + 1] - q0) / len;
      let d = next;
      for (; d < len; d += street.spacing) {
        for (const side of [-1, 1]) {
          const tp = p0 + up * d - uq * side * (width / 2 + 1.8);
          const tq = q0 + uq * d + up * side * (width / 2 + 1.8);
          const seed = mix(Math.round(tp), Math.round(tq) * 7919 + side);
          const leafy = 0.25 + 1.75 * rand(mix(Math.floor(tp / 320), Math.floor(tq / 320) + 911), 5) ** 1.5;
          if (rand(seed, 3) >= street.chance * leafy || fogAt(fog, tp, tq) >= keepLimit) continue;
          treeXY.push2((tp + tq) * k, ((tq - tp) * k) / 2);
          treeKind.push(seed & 0xff);
        }
      }
      next = d - len;
    }
  };
  const TREE_LINED = new Set([
    "residential",
    "living_street",
    "unclassified",
    "tertiary",
    "secondary",
    "primary",
  ]);
  const cut: number[] = [];
  let bridges = 0;
  const bridgePieces: { pts: number[]; kind: number; width: number; name: string }[] = [];
  await each(
    conn,
    `SELECT subtype, class, subclass,
            CAST(to_json(road_flags) AS VARCHAR), CAST(to_json(rail_flags) AS VARCHAR), CAST(to_json(level_rules) AS VARCHAR),
            width_rules[1]."value", ST_AsWKB(geometry), names."primary"
     FROM '${raw("segment.parquet")}' WHERE subtype IN ('road', 'rail')`,
    (row) => {
      const rail = str(row[0]) === "rail";
      const cls = str(row[1]);
      let spec: RoadSpec | null;
      if (rail) spec = cls === "unknown" ? null : { kind: G.Rail, width: 3.4 };
      else if (cls === "track" && CITY.ground.dirtTracks) spec = { kind: G.Earth, width: 3.6 };
      else spec = roadSpec(cls, str(row[2]));
      if (!spec) return;
      const bytes = blob(row[7]);
      if (!bytes) return;

      const flagJson = str(row[rail ? 4 : 3]);
      const levelJson = str(row[5]);
      const flags: Rule[] = flagJson && flagJson !== "null" ? (JSON.parse(flagJson) as Rule[]) : [];
      const levels: Rule[] = levelJson && levelJson !== "null" ? (JSON.parse(levelJson) as Rule[]) : [];
      if (flags.some((f) => !f.between && f.values?.some((v) => v === "is_abandoned" || v === "is_disused")))
        return;

      const g = readWkb(bytes);
      if (!g || g.kind !== GeomKind.Line) return;
      const n = project(proj, g.parts[0][0], false);
      if (n < 2 || !near()) return;
      const mapped = num(row[6]);
      const width = !rail && mapped && mapped > 2 && mapped < 60 ? mapped : spec.width;

      if (flags.length === 0 && levels.length === 0) {
        lines.add(mapBuf, n, spec.kind, width, 0);
        if (!rail && cls && TREE_LINED.has(cls)) plantStreet(n, width);
        return;
      }
      // cut at every point where a flag or level starts or stops, and judge each piece by its middle
      const stops = new Set<number>([0, 1]);
      for (const rule of [...flags, ...levels])
        if (rule.between) stops.add(rule.between[0]).add(rule.between[1]);
      const sorted = [...stops].sort((a, b) => a - b);
      for (let i = 0; i + 1 < sorted.length; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (b - a < 1e-6) continue;
        const mid = (a + b) / 2;
        const underground =
          covers(flags, mid, (r) => !!r.values?.includes("is_tunnel")) ||
          covers(levels, mid, (r) => (r.value ?? 0) < 0);
        if (underground) continue;
        const bridge = covers(flags, mid, (r) => !!r.values?.includes("is_bridge"));
        if (bridge) bridges++;
        const m = slicePath(n, a, b, k, cut);
        if (bridge && m >= 2)
          bridgePieces.push({ pts: cut.slice(0, m * 2), kind: spec.kind, width, name: str(row[8]) ?? "" });
        else lines.add(cut, m, spec.kind, width, 0);
      }
    },
  );
  lap(`roads and rails: ${lines.count} lines, ${bridges} on bridges`);

  // ---- volumes
  const ringMap: (Float64Array | number[])[] = [];
  const ringLen: number[] = [];

  interface VolumeAttrs {
    cls: string | null;
    subtype?: string | null;
    floors?: number | null;
    roofShape?: string | null;
    roofHeight?: number | null;
    facadeColor?: string | null;
    facadeMaterial?: string | null;
    roofColor?: string | null;
    isPart?: boolean;
    name?: string | null;
    /**
     * A part that only borrows its name from the stadium grounds it stands in keeps the height
     * mapped for it: the grounds' height fix is meant for the stands (Dodger Stadium's pavilions).
     */
    keepHeight?: boolean;
    flags?: number;
    /** Skip the guessing: use exactly this look. */
    force?: Partial<Style>;
  }

  /** Write out the volume whose rings are in ringMap / ringLen. Heights in metres. */
  const emitVolume = (
    seed: number,
    height: number | null,
    base: number,
    area: number,
    cx: number,
    cy: number,
    ridgeX: number,
    ridgeY: number,
    attrs: VolumeAttrs,
  ): { h: number; style: Style } | null => {
    const fixed = attrs.name && !attrs.keepHeight ? CITY.heightFixes?.[attrs.name.toLowerCase()] : undefined;
    const mapped = height && height > 0 ? height : null;
    // where the mapped heights are estimates that read tall buildings low, the floors, when taller
    const byFloors =
      CITY.heights.floorsFirst && attrs.floors && attrs.floors > 0
        ? attrs.floors * CITY.heights.storey + 1
        : null;
    const h =
      fixed ??
      (mapped !== null
        ? Math.max(mapped, byFloors ?? 0)
        : fallbackHeight(attrs.cls, attrs.floors ?? null, area, seed));
    if (h - base < 0.4) return null;
    const style = chooseStyle(
      {
        seed,
        height: h,
        base,
        area,
        cls: attrs.cls,
        subtype: attrs.subtype ?? null,
        roofShape: attrs.roofShape ?? null,
        roofHeight: attrs.roofHeight ?? null,
        facadeColor: attrs.facadeColor ?? null,
        facadeMaterial: attrs.facadeMaterial ?? null,
        roofColor: attrs.roofColor ?? null,
        isPart: attrs.isPart ?? false,
      },
      CITY.style,
    );
    const landmark = attrs.name ? CITY.landmarks[attrs.name.toLowerCase()] : undefined;
    if (landmark) {
      // a mapped colour on one part (a copper cap, a gilded crown) still wins
      if (landmark.wall !== undefined && !attrs.facadeColor) style.wall = landmark.wall;
      if (landmark.roof !== undefined && !attrs.roofColor) style.roof = landmark.roof;
      if (landmark.glass !== undefined) style.glass = landmark.glass;
      if (landmark.pattern !== undefined && h - base >= 2.6) style.pattern = landmark.pattern;
      if (landmark.dome !== undefined) {
        style.roofShape = Roof.Dome;
        style.roofH = (h - base) * landmark.dome;
      }
      if (landmark.pyramid !== undefined) {
        style.roofShape = Roof.Pyramid;
        style.roofH = (h - base) * landmark.pyramid;
      }
    }
    if (attrs.force) Object.assign(style, attrs.force);
    // a canopy is a thin slab on nothing
    const floatBase =
      attrs.cls === "roof" || attrs.cls === "canopy" || attrs.cls === "carport"
        ? Math.max(base, h - 0.6)
        : base;
    const wallTop = Math.max(floatBase + 0.3, h - style.roofH);

    volumes.begin();
    for (let r = 0; r < ringMap.length; r++) volumes.ring(ringMap[r], ringLen[r]);
    volumes.end();
    vol.base.push(proj.rise(floatBase));
    vol.top.push(proj.rise(wallTop));
    vol.roofH.push(proj.rise(h - wallTop));
    vol.roofShape.push(style.roofShape);
    vol.wall.push(style.wall);
    vol.roof.push(style.roof);
    vol.glass.push(style.glass);
    vol.pattern.push(style.pattern);
    vol.flags.push(attrs.flags ?? 0);
    vol.seed.push(seed);
    const ridgeLen = Math.hypot(ridgeX, ridgeY) || 1;
    vol.ridge.push2(ridgeX / ridgeLen, ridgeY / ridgeLen);
    vol.center.push2(cx, cy);
    vol.area.push(area);
    // a building that is part of a bridge (the Roebling Bridge's towers) is filed under its name
    const bridgeOwner = attrs.name ? bridgeBuildings.get(attrs.name.toLowerCase()) : undefined;
    if (bridgeOwner) bridgeOwner.vols.push(volumes.count - 1);
    return { h, style };
  };

  /** Is a point (grid metres) inside a ring of n points held in `ring`? */
  const inside = (ring: Float64Array, n: number, p: number, q: number): boolean => {
    let hit = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const qi = ring[i * 2 + 1];
      const qj = ring[j * 2 + 1];
      if (qi > q !== qj > q && p < ((ring[j * 2] - ring[i * 2]) * (q - qi)) / (qj - qi) + ring[i * 2])
        hit = !hit;
    }
    return hit;
  };

  /**
   * What sits on a flat roof: a stair bulkhead, on towers a mechanical floor, and in New York on
   * mid-rises often a wooden water tank. Each is placed only where it fits inside the roof's outline.
   */
  const addClutter = (
    ring: Float64Array,
    n: number,
    cp: number,
    cq: number,
    up: number,
    uq: number,
    area: number,
    h: number,
    seed: number,
    style: Style,
  ): void => {
    const side = Math.sqrt(area);
    /** A box centred `du` along the long wall and `dv` across it from the roof's centre. */
    const box = (
      du: number,
      dv: number,
      hu: number,
      hv: number,
      top: number,
      force: Partial<Style>,
      salt: number,
    ): void => {
      const bp = cp + up * du - uq * dv;
      const bq = cq + uq * du + up * dv;
      const corners: number[] = [];
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        const p = bp + up * hu * su - uq * hv * sv;
        const q = bq + uq * hu * su + up * hv * sv;
        if (!inside(ring, n, p, q)) return;
        corners.push(p, q);
      }
      addShape(corners, mix(seed, salt), top, h, "clutter", 0, force);
    };
    const plain = {
      wall: style.wall,
      roof: style.roof,
      pattern: Pattern.None,
      roofShape: Roof.Flat,
      roofH: 0,
    };
    if (h > 62 && area > 420) {
      box(
        0,
        0,
        side * 0.24,
        side * 0.17,
        h + 4.6,
        { ...plain, wall: style.pattern === Pattern.Curtain ? R.steel : style.wall },
        41,
      );
      return;
    }
    const du = (rand(seed, 42) - 0.5) * side * 0.4;
    const dv = (rand(seed, 43) - 0.5) * side * 0.3;
    box(du, dv, 2.3, 1.7, h + 2.9, plain, 44);
    if (CITY.roofs.waterTanks && h >= 15 && rand(seed, 45) < 0.3) {
      // the tank stands on legs, clear of the roof, under a shallow cone
      const tp = cp + up * (du > 0 ? -3.6 : 3.6) - uq * dv * -0.8;
      const tq = cq + uq * (du > 0 ? -3.6 : 3.6) + up * dv * -0.8;
      if (
        inside(ring, n, tp + 1.9, tq) &&
        inside(ring, n, tp - 1.9, tq) &&
        inside(ring, n, tp, tq + 1.9) &&
        inside(ring, n, tp, tq - 1.9)
      ) {
        addShape(disc(tp, tq, 1.7, 8), mix(seed, 46), h + 6.8, h + 2, "clutter", 0, {
          wall: R.brownstone,
          roof: R.roofBrown,
          pattern: Pattern.None,
          roofShape: Roof.Pyramid,
          roofH: 1.5,
        });
      }
    }
  };

  /** Add one lon/lat polygon (outer ring + holes) as an extruded volume. */
  const addVolume = (
    rings: Float64Array[],
    seed: number,
    height: number | null,
    base: number,
    attrs: VolumeAttrs,
  ): void => {
    let area = 0;
    let cx = 0;
    let cy = 0;
    let ridgeX = 1;
    let ridgeY = 0;
    let outer = gridBuf;
    let outerN = 0;
    let cp = 0;
    let cq = 0;
    let up = 1;
    let uq = 0;
    ringMap.length = 0;
    ringLen.length = 0;
    for (let r = 0; r < rings.length; r++) {
      const n = project(proj, rings[r], true);
      if (r === 0) {
        if (n < 3 || !near()) return;
        area = Math.abs(gridArea(n));
        outer = gridBuf.slice(0, n * 2);
        outerN = n;
        // centre: mean of the outline; ridge: along the longest wall
        let longest = 0;
        for (let i = 0; i < n; i++) {
          cx += mapBuf[i * 2];
          cy += mapBuf[i * 2 + 1];
          cp += gridBuf[i * 2] / n;
          cq += gridBuf[i * 2 + 1] / n;
          const j = (i + 1) % n;
          const dp = gridBuf[j * 2] - gridBuf[i * 2];
          const dq = gridBuf[j * 2 + 1] - gridBuf[i * 2 + 1];
          const len = dp * dp + dq * dq;
          if (len > longest) {
            longest = len;
            ridgeX = mapBuf[j * 2] - mapBuf[i * 2];
            ridgeY = mapBuf[j * 2 + 1] - mapBuf[i * 2 + 1];
            up = dp;
            uq = dq;
          }
        }
        cx /= n;
        cy /= n;
        const ul = Math.hypot(up, uq) || 1;
        up /= ul;
        uq /= ul;
      } else {
        if (n < 3) continue;
        area -= Math.abs(gridArea(n));
      }
      ringMap.push(mapBuf.slice(0, n * 2));
      ringLen.push(n);
    }
    if (area < 4) return;
    const made = emitVolume(seed, height, base, area, cx, cy, ridgeX, ridgeY, attrs);
    if (!made || attrs.isPart || attrs.force || rings.length > 1) return;
    const { h, style } = made;
    if (style.roofShape === Roof.Flat && h >= 11.5 && area >= 130 && style.pattern !== Pattern.None)
      addClutter(outer, outerN, cp, cq, up, uq, area, h, seed, style);
  };

  /** Add a made-up volume from corner points given in grid metres. */
  const addShape = (
    corners: number[],
    seed: number,
    height: number,
    base: number,
    cls: string,
    flags = 0,
    force?: Partial<Style>,
  ): void => {
    const n = corners.length / 2;
    const pts: number[] = [];
    let cx = 0;
    let cy = 0;
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [x, y] = proj.gridToMap(corners[i * 2], corners[i * 2 + 1]);
      pts.push(x, y);
      cx += x / n;
      cy += y / n;
      const j = (i + 1) % n;
      area += corners[i * 2] * corners[j * 2 + 1] - corners[j * 2] * corners[i * 2 + 1];
    }
    ringMap.length = 0;
    ringLen.length = 0;
    ringMap.push(pts);
    ringLen.push(n);
    emitVolume(seed, height, base, Math.max(4.1, Math.abs(area / 2)), cx, cy, 1, 0, { cls, flags, force });
  };

  /** A regular polygon, for columns and the statue. */
  const disc = (p: number, q: number, r: number, sides: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = ((i + 0.5) / sides) * Math.PI * 2;
      out.push(p + Math.cos(a) * r, q + Math.sin(a) * r);
    }
    return out;
  };

  const building = raw("building.parquet");
  const part = raw("building_part.parquet");
  // where nobody mapped heights, a satellite raster stands in
  const sampler = CITY.heights.raster ? loadHeights(DIRS.raw) : null;
  if (CITY.heights.raster && !sampler) throw new Error("no height raster: run fetch first");
  let estimated = 0;
  const caps = (CITY.heightCaps ?? []).map((cap) => ({ ...cap, at: proj.toGrid(cap.lon, cap.lat) }));
  let withParts = 0;
  // a city with no building parts gets an empty file whose geometry column has lost its type
  const partRows = Number((await conn.runAndReadAll(`SELECT count(*) FROM '${part}'`)).getRows()[0][0]);
  // A building with parts is drawn as its parts alone: they tile it. Not so a grandstand or a
  // stadium whose parts cover little of it (Citi Field's bowl, where only the Home Run Apple is a
  // part; Dodger Stadium, where only the outfield pavilions are): there the parts are things
  // standing on the stands, and the stands are drawn too: all but the pieces of their outline
  // that the parts do cover (Dodger Stadium's pavilions are both).
  const stands =
    partRows === 0
      ? []
      : (
          await conn.runAndReadAll(
            `SELECT b.id
             FROM '${building}' b
             JOIN (SELECT building_id, sum(ST_Area(geometry)) a FROM '${part}' GROUP BY 1) c ON c.building_id = b.id
             WHERE b.class IN ('grandstand', 'stadium') AND c.a < 0.5 * ST_Area(b.geometry)`,
          )
        )
          .getRows()
          .map((r) => `'${String(r[0]).replace(/'/g, "''")}'`);
  const keepStands = stands.length > 0 ? `AND id NOT IN (${stands.join(", ")})` : "";
  /** "<building id>:<piece index>" of the stands' outline pieces their parts cover. */
  const coveredPieces = new Set<string>();
  if (stands.length > 0)
    for (const [id, piece] of (
      await conn.runAndReadAll(
        `WITH piece AS (
           SELECT id, unnest(ST_Dump(geometry)) AS d FROM '${building}' WHERE id IN (${stands.join(", ")})
         )
         SELECT piece.id, coalesce(d.path[1], 1) - 1
         FROM piece JOIN '${part}' p ON p.building_id = piece.id
         GROUP BY piece.id, d.path, d.geom
         HAVING sum(ST_Area(ST_Intersection(d.geom, p.geometry))) > 0.5 * ST_Area(d.geom)`,
      )
    ).getRows())
      coveredPieces.add(`${String(id)}:${Number(piece)}`);
  // A stadium's stands often carry no name of their own; the grounds they stand in do. They take
  // that name, so the city's `landmarks` and `heightFixes` can find them (Citi Field, Yankee Stadium).
  const grounds = new Map<string, string>();
  for (const [id, name] of (
    await conn.runAndReadAll(
      `SELECT b.id, any_value(u.names."primary")
       FROM '${building}' b JOIN '${raw("land_use.parquet")}' u
         ON ST_Contains(u.geometry, ST_PointOnSurface(b.geometry))
       WHERE b.names."primary" IS NULL AND b.class IN ('grandstand', 'stadium')
         AND u.class = 'stadium' AND u.names."primary" IS NOT NULL
       GROUP BY b.id`,
    )
  ).getRows())
    grounds.set(String(id), String(name));
  await each(
    conn,
    `SELECT id, height, num_floors, min_height, subtype, class, roof_shape, roof_height, facade_color, facade_material, roof_color,
            ST_AsWKB(geometry), names."primary"
     FROM '${building}' b
     WHERE NOT coalesce(is_underground, false) AND coalesce(class, '') <> 'bridge_structure'
       AND NOT (coalesce(has_parts, false) AND id IN (SELECT building_id FROM '${part}') ${keepStands})`,
    (row) => {
      const bytes = blob(row[11]);
      if (!bytes) return;
      const g = readWkb(bytes);
      if (!g || g.kind !== GeomKind.Polygon) return;
      const seed = hashString(row[0] as string);
      const floors = num(row[2]);
      for (const [piece, rings] of g.parts.entries()) {
        if (coveredPieces.size > 0 && coveredPieces.has(`${row[0] as string}:${piece}`)) continue;
        let height = num(row[1]);
        if (sampler && !(height && height > 0) && !(floors && floors > 0)) {
          // only worth reading for a building that will be drawn
          const [p, q] = proj.toGrid(rings[0][0], rings[0][1]);
          if (fogAt(fog, p, q) >= keepLimit) continue;
          height = sampler.estimate(rings[0]);
          if (height !== null) estimated++;
        }
        if (caps.length > 0 && height !== null && !str(row[12])) {
          const [p, q] = proj.toGrid(rings[0][0], rings[0][1]);
          for (const cap of caps)
            if (height > cap.max && Math.hypot(p - cap.at[0], q - cap.at[1]) < cap.radius) height = cap.max;
        }
        addVolume(rings, seed, height, num(row[3]) ?? 0, {
          cls: str(row[5]),
          subtype: str(row[4]),
          floors,
          roofShape: str(row[6]),
          roofHeight: num(row[7]),
          facadeColor: str(row[8]),
          facadeMaterial: str(row[9]),
          roofColor: str(row[10]),
          name: str(row[12]) ?? grounds.get(row[0] as string),
        });
      }
    },
  );
  const wholeBuildings = volumes.count;
  if (partRows > 0)
    await each(
      conn,
      `SELECT p.building_id, coalesce(p.height, b.height), p.num_floors, coalesce(p.min_height, p.min_floor * 3.4, 0), b.subtype, b.class,
            p.roof_shape, p.roof_height, coalesce(p.facade_color, b.facade_color), coalesce(p.facade_material, b.facade_material),
            coalesce(p.roof_color, b.roof_color), ST_AsWKB(p.geometry), b.names."primary", p.height IS NOT NULL
     FROM '${part}' p LEFT JOIN '${building}' b ON p.building_id = b.id
     WHERE NOT coalesce(p.is_underground, false)`,
      (row) => {
        const bytes = blob(row[11]);
        if (!bytes) return;
        const g = readWkb(bytes);
        if (!g || g.kind !== GeomKind.Polygon) return;
        const seed = hashString((row[0] as string) ?? "part");
        withParts++;
        for (const rings of g.parts) {
          addVolume(rings, seed, num(row[1]), num(row[3]) ?? 0, {
            cls: str(row[5]),
            subtype: str(row[4]),
            floors: num(row[2]),
            roofShape: str(row[6]),
            roofHeight: num(row[7]),
            facadeColor: str(row[8]),
            facadeMaterial: str(row[9]),
            roofColor: str(row[10]),
            isPart: true,
            name: str(row[12]) ?? grounds.get(row[0] as string),
            keepHeight: str(row[12]) === null && grounds.has(row[0] as string) && row[13] === true,
          });
        }
      },
    );
  for (let i = 0; i < tanks.length; i++) {
    const g = readWkb(tanks[i].bytes);
    if (!g || g.kind !== GeomKind.Polygon) continue;
    for (const rings of g.parts) {
      addVolume(rings, mix(i, 4242), tanks[i].height ?? (tanks[i].cls === "water_tower" ? 30 : 11), 0, {
        cls: tanks[i].cls,
      });
    }
  }
  lap(
    `volumes: ${wholeBuildings} buildings, ${withParts} parts, ${volumes.count} in all` +
      (sampler ? `; ${estimated} heights read off the raster` : ""),
  );

  // ---- bridges: towers from the data, decks raised over the water, cables strung between towers
  const DECK = 2.4;
  interface Tower {
    p: number;
    q: number;
    height: number;
    /** Which of `supports` it is, and its footprint in grid metres. */
    support: number;
    ring: number[];
  }
  const towers: Tower[] = [];
  const supportParts: (Float64Array[][] | null)[] = [];
  for (let i = 0; i < supports.length; i++) {
    const g = readWkb(supports[i].bytes);
    supportParts.push(g && g.kind === GeomKind.Polygon ? g.parts : null);
    if (!g || g.kind !== GeomKind.Polygon) continue;
    const ring = g.parts[0][0];
    const grid: number[] = [];
    let p = 0;
    let q = 0;
    for (let j = 0; j < ring.length; j += 2) {
      const [gp, gq] = proj.toGrid(ring[j], ring[j + 1]);
      grid.push(gp, gq);
      p += gp / (ring.length / 2);
      q += gq / (ring.length / 2);
    }
    if (supports[i].height >= 80) towers.push({ p, q, height: supports[i].height, support: i, ring: grid });
  }

  // Two towers of one height carry cables. Three or more of one height standing in a row are a
  // cantilever bridge (the Queensboro): steel between them, a level deck, and no cables.
  interface Cantilever {
    /** Its first tower, and which way the bridge runs from there. */
    p0: number;
    q0: number;
    up: number;
    uq: number;
    /** Where its towers stand along it, metres from the first. */
    stations: number[];
    /** From the middle of the bridge out to each of its two trusses. */
    half: number;
    deck: number;
    truss: Truss;
  }
  /** A cantilever bridge's deck stands this share of the way up its towers. */
  const DECK_SHARE = 0.36;
  const cantilevers: Cantilever[] = [];
  const cantileverOf = new Map<number, Cantilever>();
  const sameHeight = new Map<number, Tower[]>();
  for (const tower of towers) {
    const key = Math.round(tower.height * 2);
    sameHeight.set(key, [...(sameHeight.get(key) ?? []), tower]);
  }
  for (const group of sameHeight.values()) {
    if (group.length < 3) continue;
    // the two furthest apart give the line the others must stand on
    let first = group[0];
    let last = group[1];
    let span = 0;
    for (const s of group)
      for (const t of group) {
        const d = Math.hypot(t.p - s.p, t.q - s.q);
        if (d > span) [first, last, span] = [s, t, d];
      }
    const up = (last.p - first.p) / span;
    const uq = (last.q - first.q) / span;
    const along = (t: Tower): number => (t.p - first.p) * up + (t.q - first.q) * uq;
    const row = [...group].sort((s, t) => along(s) - along(t));
    const stations = row.map(along);
    const inLine = row.every((t) => Math.abs((t.q - first.q) * up - (t.p - first.p) * uq) < 25);
    const spaced = stations.every(
      (s, i) => i === 0 || (s - stations[i - 1] > 80 && s - stations[i - 1] < 800),
    );
    if (!inLine || !spaced) continue;
    // the trusses stand just inside the ends of the towers' footprints
    let across = 0;
    for (const t of row)
      for (let j = 0; j < t.ring.length; j += 2)
        across = Math.max(across, Math.abs((t.ring[j + 1] - t.q) * up - (t.ring[j] - t.p) * uq));
    const deck = Math.round(row[0].height * DECK_SHARE);
    const cantilever: Cantilever = {
      p0: first.p,
      q0: first.q,
      up,
      uq,
      stations,
      half: Math.max(6, across - 2.2),
      deck,
      truss: cantileverTruss({ towers: stations, top: row[0].height, deck }),
    };
    cantilevers.push(cantilever);
    for (const t of row) cantileverOf.set(t.support, cantilever);
  }
  // who owns what: a bridge's decks, piers, towers and steel go under its roads' name, so the
  // index can light the bridge up as one thing (owners.json)
  const owners: Owners = { bridges: [], statues: [] };
  for (const { name, vols } of bridgeBuildings.values())
    if (vols.length > 0) owners.bridges.push({ name, vols });
  const byBridge = new Map<string, number[]>();
  const own = (name: string, from: number): void => {
    if (!name || volumes.count === from) return;
    let vols = byBridge.get(name);
    if (!vols) {
      vols = [];
      byBridge.set(name, vols);
      owners.bridges.push({ name, vols });
    }
    for (let v = from; v < volumes.count; v++) vols.push(v);
  };
  const deckPaths = bridgePieces
    .filter((piece) => piece.name)
    .map((piece) => ({ name: piece.name, xy: piece.pts }));
  /** What stands by a deck belongs to the bridge whose deck passes within 40 m. */
  const ownNear = (x: number, y: number, from: number): void => {
    const name = nearestBridge(x, y, deckPaths, 40 * proj.pxPerMetre);
    if (name) own(name, from);
  };

  for (let i = 0; i < supports.length; i++) {
    const parts = supportParts[i];
    if (!parts) continue;
    // a cantilever's tower is a masonry pier up to the deck: its steel comes with the trusses
    const pier = cantileverOf.get(i);
    const from = volumes.count;
    for (const rings of parts)
      addVolume(rings, mix(i, 777), pier ? pier.deck - DECK : supports[i].height, 0, {
        cls: "bridge_support",
      });
    const ring = parts[0][0];
    let lon = 0;
    let lat = 0;
    for (let j = 0; j < ring.length; j += 2) {
      lon += ring[j] / (ring.length / 2);
      lat += ring[j + 1] / (ring.length / 2);
    }
    const [x, y] = proj.toMap(lon, lat);
    ownNear(x, y, from);
  }

  /** One step of a deck: the stretch [a, z] of the leg that starts at (p0, q0) and runs along (up, uq). */
  interface DeckStep {
    leg: number;
    step: number;
    p0: number;
    q0: number;
    up: number;
    uq: number;
    a: number;
    z: number;
    mp: number;
    mq: number;
    /** How far along the piece its middle is. */
    at: number;
  }
  const pieceLength: number[] = [];
  /** The steps a bridge piece is laid in, seven metres or so each. */
  const stepsOf = (pts: number[]): DeckStep[] => {
    const out: DeckStep[] = [];
    let walked = 0;
    for (let i = 0; i + 1 < pts.length / 2; i++) {
      const [p0, q0] = proj.mapToGrid(pts[i * 2], pts[i * 2 + 1]);
      const [p1, q1] = proj.mapToGrid(pts[i * 2 + 2], pts[i * 2 + 3]);
      const len = Math.hypot(p1 - p0, q1 - q0);
      if (len < 0.05) continue;
      const steps = Math.max(1, Math.ceil(len / 7));
      const up = (p1 - p0) / len;
      const uq = (q1 - q0) / len;
      for (let s = 0; s < steps; s++) {
        // a little overlap hides the seams on a curve
        const a = Math.max(0, (s / steps) * len - 0.4);
        const z = Math.min(len, ((s + 1) / steps) * len + 0.4);
        const mid = (a + z) / 2;
        out.push({
          leg: i,
          step: s,
          p0,
          q0,
          up,
          uq,
          a,
          z,
          mp: p0 + up * mid,
          mq: q0 + uq * mid,
          at: walked + mid,
        });
      }
      walked += len;
    }
    pieceLength.push(walked);
    return out;
  };
  // Pieces that meet end to end are one bridge. The water under each step says how high it would
  // stand; the bridge as a whole says where it may come down (holdDecks): not on an island it
  // only passes over.
  const joints = new Map<string, number>();
  const jointAt = (x: number, y: number): number => {
    const [p, q] = proj.mapToGrid(x, y);
    const key = `${Math.round(p * 10)},${Math.round(q * 10)}`;
    let id = joints.get(key);
    if (id === undefined) {
      id = joints.size;
      joints.set(key, id);
    }
    return id;
  };
  const laid = bridgePieces.map((piece) => stepsOf(piece.pts));
  const runs: DeckRun[] = bridgePieces.map(({ pts }, b) => ({
    a: jointAt(pts[0], pts[1]),
    b: jointAt(pts[pts.length - 2], pts[pts.length - 1]),
    h: laid[b].map((st) => deckHeight(st.mp, st.mq)),
  }));
  // A cantilever bridge carries its deck level through its steel, and comes down by ramps to
  // where the bridge ends: a step outside the steel stands as high as its share of the way there.
  const RAMP_REACH = 900;
  const steelBorne = laid.map((steps) => steps.map(() => false));
  if (cantilevers.length > 0) {
    const paths: DeckPath[] = runs.map((r, b) => ({
      a: r.a,
      b: r.b,
      length: pieceLength[b],
      at: laid[b].map((st) => st.at),
    }));
    const toGround = distanceAlong(paths);
    for (const c of cantilevers) {
      // what runs along the bridge between its trusses is on it; what merely crosses under is not
      const onIt = laid.map((steps) =>
        steps.map((st) => {
          const s = (st.mp - c.p0) * c.up + (st.mq - c.q0) * c.uq;
          const off = (st.mq - c.q0) * c.up - (st.mp - c.p0) * c.uq;
          return (
            s >= c.truss.from &&
            s <= c.truss.to &&
            Math.abs(off) <= c.half + 4 &&
            Math.abs(st.up * c.up + st.uq * c.uq) > 0.9
          );
        }),
      );
      const toSteel = distanceAlong(paths, onIt);
      runs.forEach((r, b) =>
        r.h.forEach((h, n) => {
          if (onIt[b][n]) {
            steelBorne[b][n] = true;
            r.h[n] = Math.max(h, c.deck);
            return;
          }
          const down = toGround[b][n];
          const back = toSteel[b][n];
          if (back <= RAMP_REACH && Number.isFinite(down))
            r.h[n] = Math.max(h, (c.deck * down) / (down + back));
        }),
      );
    }
  }
  const heldUp = holdDecks(runs);
  // what hangs over a deck must know where it was held up
  const lifted: { p: number; q: number; h: number }[] = [];
  runs.forEach((r, b) =>
    r.h.forEach((h, n) => {
      const { mp, mq } = laid[b][n];
      if (h > deckHeight(mp, mq) + 0.01) lifted.push({ p: mp, q: mq, h });
    }),
  );
  /** How high the deck stands at a point: as the water has it, or held up over land. */
  const deckAt = (p: number, q: number): number => {
    let h = deckHeight(p, q);
    for (const s of lifted) if (s.h > h && Math.hypot(s.p - p, s.q - q) < 20) h = s.h;
    return h;
  };

  let decks = 0;
  const flat: number[] = [];
  for (let b = 0; b < bridgePieces.length; b++) {
    const { kind, width } = bridgePieces[b];
    const half = width / 2;
    const roadway = kind === G.Road || kind === G.RoadMajor || kind === G.Highway || kind === G.Rail;
    const cls =
      kind === G.Rail
        ? "deck_rail"
        : kind === G.Path || kind === G.Plaza
          ? "deck_path"
          : kind === G.Highway
            ? "deck_highway"
            : "deck";
    flat.length = 0;
    const flush = (): void => {
      if (flat.length >= 4) lines.add(flat, flat.length / 2, kind, width, L_BRIDGE);
      flat.length = 0;
    };
    let sincePier = 40;
    for (let n = 0; n < laid[b].length; n++) {
      const { leg, step, p0, q0, up, uq, a, z, mp, mq } = laid[b][n];
      const h = runs[b].h[n];
      if (h < 1.6) {
        const [x0, y0] = proj.gridToMap(p0 + up * a, q0 + uq * a);
        const [x1, y1] = proj.gridToMap(p0 + up * z, q0 + uq * z);
        if (flat.length === 0) flat.push(x0, y0);
        flat.push(x1, y1);
        continue;
      }
      flush();
      const np = -uq * half;
      const nq = up * half;
      const from = volumes.count;
      addShape(
        [
          p0 + up * a + np,
          q0 + uq * a + nq,
          p0 + up * z + np,
          q0 + uq * z + nq,
          p0 + up * z - np,
          q0 + uq * z - nq,
          p0 + up * a - np,
          q0 + uq * a - nq,
        ],
        mix(b, leg * 64 + step),
        h,
        Math.max(0, h - DECK),
        cls,
        F_NO_OUTLINE | F_FLOATING,
      );
      decks++;
      // piers hold up the approaches; the main span over deep water hangs free
      sincePier += z - a - 0.8;
      if (roadway && !steelBorne[b][n] && sincePier >= 64 && h > 5 && fogAt(shore, mp, mq) < 150) {
        sincePier = 0;
        addShape(disc(mp, mq, 2, 6), mix(b, leg + 9000), h - DECK, 0, "pier_column", F_NO_OUTLINE);
      }
      own(bridgePieces[b].name, from);
    }
    flush();
  }

  // towers of one height within reach of each other carry a pair of cables
  const cabStart = u32();
  const cabXYZ = f32();
  const cabKind = u8();
  const cabBox = f32();
  let cabPoints = 0;
  const cable = (kind: number, points: number[]): void => {
    cabStart.push(cabPoints);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < points.length; i += 3) {
      const [x, y] = proj.gridToMap(points[i], points[i + 1]);
      const rise = proj.rise(points[i + 2]);
      cabXYZ.push(x);
      cabXYZ.push(y);
      cabXYZ.push(rise);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y - rise);
      maxY = Math.max(maxY, y);
      cabPoints++;
    }
    cabBox.push4(minX, minY, maxX, maxY);
    cabKind.push(kind);
  };
  /** Two tower tops in grid metres, the height the cables leave them at, how far out they are anchored. */
  const strung: { a: { p: number; q: number }; b: { p: number; q: number }; top: number; side?: number }[] =
    [];
  for (let i = 0; i < towers.length; i++) {
    const a = towers[i];
    const pair = towers.filter((t) => Math.abs(t.height - a.height) < 0.5);
    if (pair.length !== 2) continue; // more of one height are a cantilever bridge, above
    const b = pair[0] === a ? pair[1] : pair[0];
    if (towers.indexOf(b) < i) continue;
    strung.push({ a, b, top: a.height - 2 });
  }
  // and the spans whose towers are buildings, which the city names
  for (const s of CITY.suspensions ?? []) {
    const [ap, aq] = proj.toGrid(s.a[0], s.a[1]);
    const [bp, bq] = proj.toGrid(s.b[0], s.b[1]);
    strung.push({ a: { p: ap, q: aq }, b: { p: bp, q: bq }, top: s.top, side: s.side });
  }
  let spans = 0;
  for (const { a, b, top, side: anchored } of strung) {
    const span = Math.hypot(b.p - a.p, b.q - a.q);
    if (span < 250 || span > 1600) continue;
    spans++;
    const up = (b.p - a.p) / span;
    const uq = (b.q - a.q) / span;
    const side = anchored ?? span * 0.42;
    for (const offset of [-9, 9]) {
      const op = -uq * offset;
      const oq = up * offset;
      const at = (along: number): [number, number] => [a.p + up * along + op, a.q + uq * along + oq];
      /** Height of the cable at a distance along the bridge, measured from tower A. */
      const cableAt = (along: number): number => {
        const [p, q] = at(along);
        if (along < 0 || along > span) {
          const s = Math.min(1, (along < 0 ? -along : along - span) / side);
          const end = deckAt(...at(along < 0 ? -side : span + side)) + 1;
          return end + (top - end) * (1 - s) ** 1.5;
        }
        const low = deckAt(...at(span / 2)) + 3;
        const t = (2 * along) / span - 1;
        return Math.max(deckAt(p, q) + 1, low + (top - low) * t * t);
      };
      const main: number[] = [];
      for (let along = -side; along <= span + side + 0.01; along += 5) {
        const [p, q] = at(along);
        main.push(p, q, cableAt(along));
      }
      cable(0, main);
      for (let along = -side + 16; along < span + side; along += 16) {
        const [p, q] = at(along);
        const from = deckAt(p, q);
        const to = cableAt(along);
        if (to - from > 3) cable(1, [p, q, from, p, q, to]);
      }
    }
  }

  // ---- the steel of a cantilever bridge: a truss each side of the roadway, tied across the top,
  // and at every tower a pair of posts on the pier, braced across and pointed on top
  const POST = 2.3;
  for (let c = 0; c < cantilevers.length; c++) {
    const { p0, q0, up, uq, half, deck, truss, stations } = cantilevers[c];
    const top = truss.topAt(stations[0]);
    /** A point of the bridge: `s` along it, `side` (−1 to 1) across it from truss to truss, `z` up. */
    const at = (s: number, side: number, z: number): [number, number, number] => [
      p0 + up * s - uq * half * side,
      q0 + uq * s + up * half * side,
      z,
    ];
    for (const side of [-1, 1]) {
      for (const chord of truss.chords) {
        const path: number[] = [];
        for (let i = 0; i < chord.length; i += 2) path.push(...at(chord[i], side, chord[i + 1]));
        cable(2, path);
      }
      for (const [s0, z0, s1, z1] of truss.members) cable(3, [...at(s0, side, z0), ...at(s1, side, z1)]);
    }
    for (const s of truss.panels)
      if (!stations.includes(s)) cable(3, [...at(s, -1, truss.topAt(s)), ...at(s, 1, truss.topAt(s))]);
    stations.forEach((s, t) => {
      for (const side of [-1, 1]) {
        const [p, q] = at(s, side, 0);
        const from = volumes.count;
        addShape(
          [
            p - up * POST - uq * POST,
            q - uq * POST + up * POST,
            p + up * POST - uq * POST,
            q + uq * POST + up * POST,
            p + up * POST + uq * POST,
            q + uq * POST - up * POST,
            p - up * POST + uq * POST,
            q - uq * POST - up * POST,
          ],
          mix(c, t * 2 + (side + 1) / 2 + 500),
          top,
          deck - DECK,
          "truss_post",
          0,
          { roofShape: Roof.Pyramid, roofH: 9 },
        );
        const [x, y] = proj.gridToMap(p, q);
        ownNear(x, y, from);
      }
      // across the roadway: a portal clear of the traffic, crossed braces, a strut at the top
      const clear = deck + 12;
      const tiers = Math.max(1, Math.round((top - clear) / 14));
      for (let k = 0; k <= tiers; k++) {
        const z = clear + ((top - clear) * k) / tiers;
        cable(k === 0 || k === tiers ? 2 : 3, [...at(s, -1, z), ...at(s, 1, z)]);
        if (k === tiers) break;
        const above = clear + ((top - clear) * (k + 1)) / tiers;
        cable(3, [...at(s, -1, z), ...at(s, 1, above)]);
        cable(3, [...at(s, 1, z), ...at(s, -1, above)]);
      }
    });
  }
  lap(
    `bridges: ${supports.length} supports, ${decks} deck pieces (${heldUp} held up over land), ` +
      `${spans} suspension spans, ${cantilevers.length} cantilever`,
  );

  // ---- statues: what is not a building, so is not in the data
  for (const statue of CITY.statues) {
    const [p, q] = proj.toGrid(statue.lon, statue.lat);
    const from = volumes.count;
    statue.pieces.forEach((piece, i) => {
      const pc = p + piece.dp;
      const qc = q + piece.dq;
      addShape(
        "r" in piece
          ? disc(pc, qc, piece.r, 8)
          : [
              pc - piece.hp,
              qc - piece.hq,
              pc + piece.hp,
              qc - piece.hq,
              pc + piece.hp,
              qc + piece.hq,
              pc - piece.hp,
              qc + piece.hq,
            ],
        mix(i, 1886),
        statue.base + piece.to,
        statue.base + piece.from,
        piece.ramp === "gold" ? "statue_gold" : piece.ramp === "white" ? "statue_white" : "statue",
      );
    });
    const vols: number[] = [];
    for (let v = from; v < volumes.count; v++) vols.push(v);
    owners.statues.push({ lon: statue.lon, lat: statue.lat, vols });
  }

  // ---- street trees from a census, where the city has one
  let streetTrees = 0;
  if (CITY.trees.census) {
    const csv = fs.readFileSync(path.join(DIRS.raw, CITY.trees.census), "utf8");
    let lineStart = csv.indexOf("\n") + 1;
    while (lineStart < csv.length) {
      let lineEnd = csv.indexOf("\n", lineStart);
      if (lineEnd < 0) lineEnd = csv.length;
      const comma = csv.indexOf(",", lineStart);
      if (comma > 0 && comma < lineEnd) {
        const lat = Number(csv.slice(lineStart, comma).replaceAll('"', ""));
        const lon = Number(csv.slice(comma + 1, lineEnd).replaceAll('"', ""));
        if (Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0) {
          addTree(lon, lat, mix(streetTrees, 99));
          streetTrees++;
        }
      }
      lineStart = lineEnd + 1;
    }
  }
  lap(
    `trees: ${treeKind.length}` +
      (CITY.trees.census ? ` (${streetTrees} from the street tree census)` : " (streets lined by rule)"),
  );

  // ---- bounds: everything the fog keeps
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let gy = 0; gy < fog.rows; gy++) {
    for (let gx = 0; gx < fog.cols; gx++) {
      if (fog.d[gy * fog.cols + gx] >= FOG.end) continue;
      const [x, y] = proj.gridToMap(fog.p0 + (gx + 0.5) * fog.cell, fog.q0 + (gy + 0.5) * fog.cell);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const pad = fog.cell * k * 2;
  const bounds = {
    minX: Math.floor(minX - pad),
    minY: Math.floor(minY - pad),
    maxX: Math.ceil(maxX + pad),
    maxY: Math.ceil(maxY + pad),
  };

  writeScene(
    DIRS.scene,
    {
      ...ground.arrays("ground"),
      "ground.kind": groundKind.finish(),
      ...lines.arrays("lines"),
      ...volumes.arrays("vol"),
      "vol.base": vol.base.finish(),
      "vol.top": vol.top.finish(),
      "vol.roofH": vol.roofH.finish(),
      "vol.roofShape": vol.roofShape.finish(),
      "vol.wall": vol.wall.finish(),
      "vol.roof": vol.roof.finish(),
      "vol.glass": vol.glass.finish(),
      "vol.pattern": vol.pattern.finish(),
      "vol.flags": vol.flags.finish(),
      "vol.seed": vol.seed.finish(),
      "vol.ridge": vol.ridge.finish(),
      "vol.center": vol.center.finish(),
      "vol.area": vol.area.finish(),
      "cab.start": (cabStart.push(cabPoints), cabStart.finish()),
      "cab.xyz": cabXYZ.finish(),
      "cab.kind": cabKind.finish(),
      "cab.bbox": cabBox.finish(),
      "trees.xy": treeXY.finish(),
      "trees.kind": treeKind.finish(),
      "fog.d": fog.d,
    },
    {
      geo: GEO,
      bounds,
      flora: CITY.flora,
      fog: {
        p0: fog.p0,
        q0: fog.q0,
        cell: fog.cell,
        cols: fog.cols,
        rows: fog.rows,
        start: FOG.start,
        end: FOG.end,
      },
      counts: { ground: ground.count, lines: lines.count, volumes: volumes.count, trees: treeKind.length },
    },
  );
  fs.writeFileSync(path.join(DIRS.scene, "owners.json"), JSON.stringify(owners));
  conn.closeSync();
  lap(
    `written to ${path.relative(process.cwd(), DIRS.scene)} — map is ${bounds.maxX - bounds.minX} × ${bounds.maxY - bounds.minY} px`,
  );
}
