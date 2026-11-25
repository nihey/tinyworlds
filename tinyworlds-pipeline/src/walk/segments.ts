/**
 * The walk's streets, sidewalks and rails as Overture describes them: one read of
 * segment.parquet, the geometry in world metres, the rules (flags, levels, access) as mapped.
 */
import { DuckDBBlobValue, DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import { GeomKind, readWkb } from "../geom/wkb.js";
import { lonLatToEN, type Geo } from "./grid.js";

/** A flag or a level that holds along a stretch of a segment (fractions of its length), or all of it. */
export interface Rule {
  between?: [number, number] | null;
  value?: number | null;
  values?: string[] | null;
}

export interface AccessRule {
  access_type: string;
  between?: [number, number] | null;
  when?: { heading?: string; mode?: unknown; using?: unknown; during?: unknown; vehicle?: unknown } | null;
}

export interface Segment {
  id: string;
  subtype: "road" | "rail";
  cls: string;
  subclass: string | null;
  name: string;
  /** Metres, only where Overture maps one that is believable (2 to 60). */
  width: number | null;
  /** road_flags, or rail_flags for a rail. */
  flags: Rule[];
  levels: Rule[];
  access: AccessRule[];
  connectors: { id: string; at: number }[];
  /** Flat e, n in metres. */
  pts: number[];
}

export const CAR_CLASSES = [
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "unclassified",
];
/** m/s; links go at 0.7 of it, applied by the viewer. */
export const CAR_SPEED = [22, 18, 12, 12, 10, 8.5, 8];
/** Metres where Overture maps none; links are 0.6 of it. */
export const CAR_WIDTH = [14, 13, 17, 14, 12, 10, 10];
export const WALK_CLASSES = ["footway", "pedestrian", "living_street", "path"];

/**
 * One-way direction from the access rules: 1 only a to b, -1 only b to a, 0 two-way, null closed
 * (denied to everyone, all along). The rule for a one-way street is "denied" along the whole
 * segment, for a heading, for every kind of traveller: Overture marks the way against traffic.
 */
export function oneWayOf(access: AccessRule[]): 0 | 1 | -1 | null {
  if (access.some((a) => a.access_type === "denied" && !a.between && !a.when)) return null;
  let ow: 0 | 1 | -1 = 0;
  for (const a of access) {
    const w = a.when;
    if (
      a.access_type === "denied" &&
      !a.between &&
      w?.heading &&
      !w.mode &&
      !w.using &&
      !w.during &&
      !w.vehicle
    )
      ow = w.heading === "backward" ? 1 : -1;
  }
  return ow;
}

const str = (v: DuckDBValue): string | null => (typeof v === "string" ? v : null);
const num = (v: DuckDBValue): number | null =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : null;

function json<T>(v: DuckDBValue): T[] {
  const s = str(v);
  return s && s !== "null" ? (JSON.parse(s) as T[]) : [];
}

/**
 * Every road of the walk's classes and every rail in the file. The whole file is read: filtering
 * the local Parquet on its bbox struct crashes this DuckDB build.
 */
export async function readSegments(file: string, geo: Geo, walkCycleways: string[] = []): Promise<Segment[]> {
  const db = await DuckDBInstance.create(":memory:");
  const conn = await db.connect();
  try {
    await conn.run("INSTALL spatial; LOAD spatial;");
    const classes = [...CAR_CLASSES, ...WALK_CLASSES].map((c) => `'${c}'`).join(",");
    const sharedPaths = walkCycleways.map((name) => `'${name.replaceAll("'", "''")}'`).join(",");
    const walks = sharedPaths ? ` OR class = 'cycleway' AND names."primary" IN (${sharedPaths})` : "";
    const result = await conn.stream(
      `SELECT id, subtype, class, subclass, names."primary", width_rules[1]."value",
              CAST(to_json(road_flags) AS VARCHAR), CAST(to_json(rail_flags) AS VARCHAR),
              CAST(to_json(level_rules) AS VARCHAR), CAST(to_json(access_restrictions) AS VARCHAR),
              CAST(to_json(connectors) AS VARCHAR), ST_AsWKB(geometry)
       FROM '${file.replaceAll("'", "''")}'
       WHERE (subtype = 'road' AND (class IN (${classes})${walks})) OR (subtype = 'rail' AND class <> 'unknown')`,
    );
    const out: Segment[] = [];
    for (;;) {
      const chunk = await result.fetchChunk();
      if (!chunk || chunk.rowCount === 0) break;
      for (const row of chunk.getRows()) {
        const bytes = row[11] instanceof DuckDBBlobValue ? row[11].bytes : null;
        const g = bytes ? readWkb(bytes) : null;
        if (!g || g.kind !== GeomKind.Line) continue;
        const ll = g.parts[0][0];
        const pts: number[] = [];
        for (let i = 0; i + 1 < ll.length; i += 2) pts.push(...lonLatToEN(geo, ll[i], ll[i + 1]));
        if (pts.length < 4) continue;
        const rail = str(row[1]) === "rail";
        const cls = str(row[2]) ?? "";
        const width = num(row[5]);
        out.push({
          id: str(row[0]) ?? "",
          subtype: rail ? "rail" : "road",
          cls: !rail && cls === "cycleway" ? "footway" : cls,
          subclass: str(row[3]),
          name: str(row[4]) ?? "",
          width: !rail && width !== null && width >= 2 && width <= 60 ? width : null,
          flags: json<Rule>(row[rail ? 7 : 6]),
          levels: json<Rule>(row[8]),
          access: json<AccessRule>(row[9]),
          connectors: json<{ connector_id: string; at: number }>(row[10]).map((c) => ({
            id: c.connector_id,
            at: c.at,
          })),
          pts,
        });
      }
    }
    return out;
  } finally {
    conn.closeSync();
    db.closeSync();
  }
}
