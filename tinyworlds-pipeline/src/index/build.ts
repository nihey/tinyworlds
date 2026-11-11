import fs from "node:fs";
import path from "node:path";
import { DuckDBBlobValue, DuckDBInstance, type DuckDBConnection, type DuckDBValue } from "@duckdb/node-api";
import type { Areas, Polygons } from "../cities/types.js";
import { CITY, DIRS } from "../config.js";
import { GeomKind, readWkb } from "../geom/wkb.js";
import { makeProjection, type Projection } from "../projection.js";
import { fillPolygon } from "../render/raster.js";
import { cityFog, GEO } from "../scene/build.js";
import { FOG, fogAt } from "../scene/fog.js";
import { hashString } from "../scene/hash.js";
import { buildSyntheticIndex } from "../scene/synthetic.js";
import { stampIndexes } from "./stamp.js";
import { writeSights } from "./write-sights.js";
import type { Source } from "./sights.js";

/**
 * The viewer's indexes: what can be searched for (places.json), the outlines of the city's
 * areas (hoods.json), and what moves over the map: ferry routes and flights (life.json). All in
 * lon/lat; the viewer projects.
 */

export type PlaceType =
  "borough" | "hood" | "landmark" | "park" | "bridge" | "museum" | "station" | "street" | "place";

export interface Place {
  n: string;
  t: PlaceType;
  lon: number;
  lat: number;
  b?: string;
  r: number;
  s?: number;
  // the index's own notes, not written to places.json: where the entry came from (for sights)
  src?: Source;
  /** a building entry's building: hashString of its id */
  seed?: number;
  /** a curated entry that is one structure */
  sight?: boolean;
}

/** Overture place categories that are areas, never one structure: their entries never light up. */
const AREA_CATEGORIES = new Set(["college_university", "airport", "zoo", "amusement_park"]);

const round5 = (v: number): number => Math.round(v * 1e5) / 1e5;

/**
 * The index's order: best-ranked first, then by name, and to the end (context, position) so the
 * same data always comes out the same way, whatever order the queries returned it in.
 */
export function comparePlaces(a: Place, b: Place): number {
  return (
    b.r - a.r ||
    a.n.localeCompare(b.n) ||
    (a.b ?? "").localeCompare(b.b ?? "") ||
    a.lon - b.lon ||
    a.lat - b.lat ||
    a.t.localeCompare(b.t)
  );
}

/** Area-weighted centroid and area of a lon/lat ring (planar; fine at city scale). */
function ringCentroid(ring: number[][]): { lon: number; lat: number; area: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += cross;
    cx += (ring[j][0] + ring[i][0]) * cross;
    cy += (ring[j][1] + ring[i][1]) * cross;
  }
  if (Math.abs(a) < 1e-14) return { lon: ring[0][0], lat: ring[0][1], area: 0 };
  return { lon: cx / (3 * a), lat: cy / (3 * a), area: Math.abs(a / 2) };
}

/** Where a district's label goes: the middle of its largest piece. */
function centreOf(polygons: Polygons): { lon: number; lat: number } {
  let best = { lon: 0, lat: 0, area: 0 };
  for (const rings of polygons) {
    const c = ringCentroid(rings[0]);
    if (c.area > best.area) best = c;
  }
  return { lon: best.lon, lat: best.lat };
}

/** Douglas–Peucker on a lon/lat path; `tolerance` in degrees. */
export function simplify(points: number[][], tolerance: number): number[][] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = points[a];
    const dx = points[b][0] - ax;
    const dy = points[b][1] - ay;
    const len2 = dx * dx + dy * dy;
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const px = points[i][0] - ax;
      const py = points[i][1] - ay;
      const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const d = Math.hypot(px - dx * t, py - dy * t);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolerance && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Which district (borough, zone) a point is in, from a coarse raster of their outlines. */
export function districtLookup(
  proj: Projection,
  districts: Areas["districts"],
): (lon: number, lat: number) => string {
  const cell = 60;
  let pMin = Infinity;
  let qMin = Infinity;
  let pMax = -Infinity;
  let qMax = -Infinity;
  const shapes = districts.map((district) =>
    district.polygons.map((rings) =>
      rings.map((ring) =>
        ring.map(([lon, lat]) => {
          const [p, q] = proj.toGrid(lon, lat);
          pMin = Math.min(pMin, p);
          pMax = Math.max(pMax, p);
          qMin = Math.min(qMin, q);
          qMax = Math.max(qMax, q);
          return [p, q];
        }),
      ),
    ),
  );
  const cols = Math.ceil((pMax - pMin) / cell) + 2;
  const rows = Math.ceil((qMax - qMin) / cell) + 2;
  const grid = new Uint8Array(cols * rows);
  shapes.forEach((polygons, index) => {
    for (const rings of polygons) {
      const xy: number[] = [];
      const starts = [0];
      for (const ring of rings) {
        for (const [p, q] of ring) xy.push((p - pMin) / cell + 1, (q - qMin) / cell + 1);
        starts.push(xy.length / 2);
      }
      fillPolygon(xy, starts, 0, rings.length, 0, 0, cols, rows, (y, a, b) =>
        grid.fill(index + 1, y * cols + a, y * cols + b),
      );
    }
  });
  const names = districts.map((district) => district.name);
  return (lon, lat) => {
    const [p, q] = proj.toGrid(lon, lat);
    const x = Math.floor((p - pMin) / cell + 1);
    const y = Math.floor((q - qMin) / cell + 1);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return "";
    const id = grid[y * cols + x];
    return id ? names[id - 1] : "";
  };
}

async function rows(conn: DuckDBConnection, sql: string): Promise<DuckDBValue[][]> {
  const reader = await conn.runAndReadAll(sql);
  return reader.getRows();
}

const text = (v: DuckDBValue): string => (typeof v === "string" ? v : "");
const numberOf = (v: DuckDBValue): number =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : 0;

/** Middle vertex-ish point and length (metres) of a WKB line. */
function lineInfo(
  proj: Projection,
  v: DuckDBValue,
): { lon: number; lat: number; length: number; path: Float64Array } | null {
  if (!(v instanceof DuckDBBlobValue)) return null;
  const g = readWkb(v.bytes);
  if (!g || g.kind !== GeomKind.Line) return null;
  const path = g.parts[0][0];
  const n = path.length / 2;
  let length = 0;
  const cumulative = [0];
  for (let i = 1; i < n; i++) {
    const [p0, q0] = proj.toGrid(path[i * 2 - 2], path[i * 2 - 1]);
    const [p1, q1] = proj.toGrid(path[i * 2], path[i * 2 + 1]);
    length += Math.hypot(p1 - p0, q1 - q0);
    cumulative.push(length);
  }
  let mid = 1;
  while (mid < n - 1 && cumulative[mid] < length / 2) mid++;
  const t =
    cumulative[mid] > cumulative[mid - 1]
      ? (length / 2 - cumulative[mid - 1]) / (cumulative[mid] - cumulative[mid - 1])
      : 0;
  return {
    lon: path[mid * 2 - 2] + (path[mid * 2] - path[mid * 2 - 2]) * t,
    lat: path[mid * 2 - 1] + (path[mid * 2 + 1] - path[mid * 2 - 1]) * t,
    length,
    path,
  };
}

/** "Sand Lake Road" → "Sand Lake Road station", but "Church Street Station" stays as it is. */
const withSuffix = (name: string, suffix: string): string =>
  name.toLowerCase().endsWith(suffix.trim().toLowerCase()) ? name : `${name}${suffix}`;

/** Overture's coarse place category → what the search calls it. Everything else is left out. */
const PLACE_CATEGORIES: Record<string, PlaceType> = {
  museum: "museum",
  aquarium: "museum",
  zoo: "park",
  stadium_arena: "landmark",
  monument: "landmark",
  amusement_park: "landmark",
  college_university: "place",
  library: "place",
  theatre_venue: "place",
  airport: "place",
  train_station: "station",
};

export async function buildIndex(opts: { out?: string; log?: (m: string) => void } = {}): Promise<void> {
  // a generated city names its own places
  if (CITY.synthetic) return buildSyntheticIndex(opts);
  const log = opts.log ?? ((m: string) => console.log(m));
  const out = path.resolve(opts.out ?? DIRS.out);
  fs.mkdirSync(out, { recursive: true });
  const proj = makeProjection(GEO);
  const raw = (name: string): string => path.join(DIRS.raw, name).replaceAll("'", "''");

  const db = await DuckDBInstance.create(":memory:");
  const conn = await db.connect();
  await conn.run("INSTALL spatial; LOAD spatial;");

  const fog = await cityFog(conn, proj);
  /** Only things on the visible map are worth finding. */
  const onMap = (lon: number, lat: number): boolean => {
    const [p, q] = proj.toGrid(lon, lat);
    return fogAt(fog, p, q) < FOG.start;
  };

  const areas = CITY.areas(DIRS.raw);
  const districtAt = districtLookup(proj, areas.districts);
  /** The context line of something that is listed wherever it stands: its district, or (where the city is not all districts) the city. */
  const contextOf = (lon: number, lat: number): string =>
    districtAt(lon, lat) || (CITY.search.districtOnly ? "" : CITY.title);
  /** May this spot be listed, and under which context line? Null when it may not. */
  const contextAt = (lon: number, lat: number): string | null => {
    const district = districtAt(lon, lat);
    if (district) return district;
    return !CITY.search.districtOnly && onMap(lon, lat) ? CITY.title : null;
  };

  const places: Place[] = [];
  const seen = new Map<string, Place>();
  const add = (place: Place): void => {
    const key = `${place.n.toLowerCase()}|${place.b ?? ""}`;
    if (!place.n) return;
    const prior = seen.get(key);
    if (prior) {
      // the building data knows which building a hand-picked name means (its point may miss it)
      if (place.seed !== undefined && prior.seed === undefined) prior.seed = place.seed;
      return;
    }
    const kept = { ...place, lon: round5(place.lon), lat: round5(place.lat) };
    seen.set(key, kept);
    places.push(kept);
  };

  // ---- hand-picked: the places people will type first
  for (const c of CITY.curated) {
    // a pin in the fog helps nobody
    if (!onMap(c.lon, c.lat)) {
      log(`index: "${c.n}" is off the map, left out`);
      continue;
    }
    add({ ...c, b: c.b ?? contextOf(c.lon, c.lat), src: "curated" });
  }

  // ---- districts: boroughs, zones
  for (const district of areas.districts) {
    // a district that only reaches into the map from outside is context, not a destination
    const centre = centreOf(district.polygons);
    if (!onMap(centre.lon, centre.lat)) continue;
    add({
      n: district.name,
      t: "borough",
      ...centreOf(district.polygons),
      b: CITY.title,
      r: CITY.search.districtRank ?? 100,
    });
  }

  // ---- the areas the viewer outlines: lines for the map, names for the search
  const hoods: { name: string; borough: string; lon: number; lat: number; rings: number[][] }[] = [];
  for (const hood of areas.hoods) {
    const rings: number[][] = [];
    let best = { lon: 0, lat: 0, area: 0 };
    for (const polygon of hood.polygons) {
      const c = ringCentroid(polygon[0]);
      if (c.area < 2e-7) continue; // slivers and rocks
      if (c.area > best.area) best = c;
      rings.push(simplify(polygon[0], 0.00012).flatMap(([lon, lat]) => [round5(lon), round5(lat)]));
    }
    if (rings.length === 0) continue;
    hoods.push({
      name: hood.name,
      borough: hood.district,
      lon: round5(best.lon),
      lat: round5(best.lat),
      rings,
    });
    const listed = hood.listed ?? { name: hood.name, type: "hood" as const };
    add({ n: listed.name, t: listed.type, lon: best.lon, lat: best.lat, b: hood.district, r: 60 });
    // "Chelsea-Hudson Yards" is two names people search for
    const parts = listed.name
      .replace(/\s*\(.*?\)\s*/g, "")
      .split("-")
      .map((part) => part.trim())
      .filter((part) => part.length > 2);
    if (parts.length > 1)
      for (const part of parts)
        add({ n: part, t: listed.type, lon: best.lon, lat: best.lat, b: hood.district, r: 52 });
  }

  // ---- the names locals use: SoHo, Tribeca; Jardim Paulista, Campos Elíseos
  for (const row of await rows(
    conn,
    `SELECT names."primary", subtype, ST_X(geometry), ST_Y(geometry) FROM '${raw("division.parquet")}'
     WHERE subtype IN ('neighborhood', 'microhood', 'macrohood') AND names."primary" IS NOT NULL`,
  )) {
    const lon = numberOf(row[2]);
    const lat = numberOf(row[3]);
    const context = contextAt(lon, lat);
    if (context !== null && !CITY.search.skip?.test(text(row[0])))
      add({ n: text(row[0]), t: "hood", lon, lat, b: context, r: text(row[1]) === "macrohood" ? 58 : 54 });
  }

  // ---- parks, by size
  for (const row of await rows(
    conn,
    `SELECT names."primary", ST_X(ST_Centroid(geometry)), ST_Y(ST_Centroid(geometry)), ST_Area(geometry)
     FROM '${raw("land_use.parquet")}'
     WHERE class = 'park' AND names."primary" IS NOT NULL AND ST_GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON')
       AND ST_Area(geometry) > 1.5e-6
     ORDER BY 4 DESC`,
  )) {
    const lon = numberOf(row[1]);
    const lat = numberOf(row[2]);
    if (!onMap(lon, lat)) continue;
    // degrees² → a rank between 30 and 75
    const rank = Math.max(30, Math.min(75, 46 + Math.log10(numberOf(row[3]) / 1e-5) * 12));
    add({ n: text(row[0]), t: "park", lon, lat, b: contextOf(lon, lat), r: Math.round(rank) });
  }

  // ---- buildings with a name: the tall ones and the civic ones (how tall, and which others, is the city's)
  const named = CITY.search.namedBuildings ?? {};
  const minHeight = named.minHeight ?? 110;
  const namedClasses = [
    "stadium",
    "museum",
    "train_station",
    "cathedral",
    "grandstand",
    ...(named.classes ?? []),
  ]
    .map((c) => `'${c}'`)
    .join(", ");
  for (const row of await rows(
    conn,
    `SELECT names."primary", ST_X(ST_Centroid(geometry)), ST_Y(ST_Centroid(geometry)),
            coalesce(height, num_floors * ${CITY.heights.storey}, 0), class, id
     FROM '${raw("building.parquet")}'
     WHERE names."primary" IS NOT NULL
       AND (height >= ${minHeight} OR (height IS NULL AND num_floors >= ${Math.round(minHeight / 4.6)})
            OR class IN (${namedClasses}))
     ORDER BY 4 DESC, id`,
  )) {
    const lon = numberOf(row[1]);
    const lat = numberOf(row[2]);
    if (!onMap(lon, lat) || named.skip?.test(text(row[0]))) continue;
    const height = numberOf(row[3]);
    const cls = text(row[4]);
    add({
      n: text(row[0]),
      t: cls === "museum" ? "museum" : cls === "train_station" ? "station" : "landmark",
      lon,
      lat,
      b: contextOf(lon, lat),
      r: Math.round(Math.max(40, Math.min(78, 36 + height / 9))),
      src: "building",
      seed: hashString(text(row[5])),
    });
  }

  // ---- points of interest worth a visit
  const categories = Object.keys(PLACE_CATEGORIES)
    .map((c) => `'${c}'`)
    .join(", ");
  for (const row of await rows(
    conn,
    `SELECT names."primary", basic_category, ST_X(geometry), ST_Y(geometry), confidence
     FROM '${raw("place.parquet")}'
     WHERE confidence >= 0.92 AND names."primary" IS NOT NULL AND basic_category IN (${categories})
     ORDER BY confidence DESC`,
  )) {
    const lon = numberOf(row[2]);
    const lat = numberOf(row[3]);
    const context = onMap(lon, lat) ? contextAt(lon, lat) : null;
    if (context === null || CITY.search.skip?.test(text(row[0]))) continue;
    const category = text(row[1]);
    add({
      n: text(row[0]),
      t: PLACE_CATEGORIES[category],
      lon,
      lat,
      b: context,
      r: 34,
      ...(AREA_CATEGORIES.has(category) ? {} : { src: "poi" as const }),
    });
  }

  // ---- rail and subway stations
  const stationSuffix = CITY.search.stationSuffix;
  if (stationSuffix !== null) {
    for (const row of await rows(
      conn,
      `SELECT names."primary", ST_X(geometry), ST_Y(geometry) FROM '${raw("infrastructure.parquet")}'
       WHERE class IN ('subway_station', 'railway_station') AND names."primary" IS NOT NULL AND ST_GeometryType(geometry) = 'POINT'`,
    )) {
      const lon = numberOf(row[1]);
      const lat = numberOf(row[2]);
      const context = contextAt(lon, lat);
      if (context !== null)
        add({
          n: withSuffix(text(row[0]), stationSuffix),
          t: "station",
          lon,
          lat,
          b: context,
          r: 30,
          src: "station",
        });
    }
  }

  // ---- streets and bridges: one entry per name per district, placed on the street near its middle
  interface Street {
    name: string;
    borough: string;
    length: number;
    sumLon: number;
    sumLat: number;
    mids: [number, number][];
    bridge: boolean;
    major: boolean;
  }
  const streets = new Map<string, Street>();
  const result = await conn.stream(
    `SELECT names."primary", class, CAST(to_json(road_flags) AS VARCHAR), ST_AsWKB(geometry)
     FROM '${raw("segment.parquet")}'
     WHERE subtype = 'road' AND names."primary" IS NOT NULL
       AND class IN ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'pedestrian', 'living_street')`,
  );
  for (;;) {
    const chunk = await result.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    for (const row of chunk.getRows()) {
      const info = lineInfo(proj, row[3]);
      if (!info) continue;
      const borough = contextAt(info.lon, info.lat);
      if (borough === null) continue;
      const name = text(row[0]);
      const cls = text(row[1]);
      const flags = text(row[2]);
      const bridge = flags.includes("is_bridge") && CITY.search.bridge.test(name);
      const key = `${name}|${borough}`;
      let street = streets.get(key);
      if (!street)
        streets.set(
          key,
          (street = {
            name,
            borough,
            length: 0,
            sumLon: 0,
            sumLat: 0,
            mids: [],
            bridge: false,
            major: false,
          }),
        );
      street.length += info.length;
      street.sumLon += info.lon * info.length;
      street.sumLat += info.lat * info.length;
      street.mids.push([info.lon, info.lat]);
      street.bridge ||= bridge;
      street.major ||= cls === "primary" || cls === "secondary" || cls === "trunk";
    }
  }
  for (const street of streets.values()) {
    if (street.length < 250) continue;
    const cLon = street.sumLon / street.length;
    const cLat = street.sumLat / street.length;
    let best = street.mids[0];
    let bestD = Infinity;
    for (const mid of street.mids) {
      const d = (mid[0] - cLon) ** 2 + (mid[1] - cLat) ** 2;
      if (d < bestD) {
        bestD = d;
        best = mid;
      }
    }
    const rank = Math.round(Math.min(48, 14 + Math.log10(street.length / 250) * 14 + (street.major ? 6 : 0)));
    add({
      n: street.name,
      t: street.bridge ? "bridge" : "street",
      lon: best[0],
      lat: best[1],
      b: street.borough,
      r: street.bridge ? rank + 12 : rank,
    });
  }

  // ---- ferry routes
  const ferries: { name: string; path: number[] }[] = [];
  for (const row of await rows(
    conn,
    `SELECT coalesce(names."primary", ''), ST_AsWKB(geometry) FROM '${raw("segment.parquet")}' WHERE subtype = 'water'`,
  )) {
    const info = lineInfo(proj, row[1]);
    if (!info || info.length < 600) continue;
    const points: number[][] = [];
    for (let i = 0; i < info.path.length; i += 2) points.push([info.path[i], info.path[i + 1]]);
    // keep routes that stay on the map from end to end
    if (!points.every(([lon, lat]) => onMap(lon, lat))) continue;
    ferries.push({
      name: text(row[0]),
      path: simplify(points, 0.00008).flatMap(([lon, lat]) => [round5(lon), round5(lat)]),
    });
  }
  // boats the data has no route for
  for (const boat of CITY.boats ?? [])
    ferries.push({ name: boat.name, path: boat.path.flatMap(([lon, lat]) => [round5(lon), round5(lat)]) });
  conn.closeSync();

  places.sort(comparePlaces);
  if (CITY.sights) await writeSights({ places, proj, out, log });
  fs.writeFileSync(
    path.join(out, "places.json"),
    JSON.stringify({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      places: places.map(({ src, seed, sight, ...place }) => place),
    }),
  );
  fs.writeFileSync(path.join(out, "hoods.json"), JSON.stringify({ hoods }));
  // ---- flights: [lon, lat, metres up] triples, flattened
  const flights = CITY.flights.map((flight) => ({
    kind: flight.kind,
    loop: flight.loop,
    ...(flight.speed !== undefined ? { speed: flight.speed } : {}),
    ...(flight.pause !== undefined ? { pause: flight.pause } : {}),
    path: flight.path.flatMap(([lon, lat, alt]) => [round5(lon), round5(lat), alt]),
  }));
  fs.writeFileSync(path.join(out, "life.json"), JSON.stringify({ ferries, flights }));

  const byType: Record<string, number> = {};
  for (const p of places) byType[p.t] = (byType[p.t] ?? 0) + 1;
  log(
    `index: ${places.length} places ${JSON.stringify(byType)}, ${hoods.length} outlined areas, ` +
      `${ferries.length} ferry routes, ${flights.length} flights`,
  );
  stampIndexes(out, log);
}
