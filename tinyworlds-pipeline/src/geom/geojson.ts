import fs from "node:fs";
import type { Polygons } from "../cities/types.js";

export interface AreaFeature {
  properties: Record<string, string>;
  polygons: Polygons;
}

interface RawFeature {
  properties: Record<string, string> | null;
  geometry: { type: string; coordinates: unknown } | null;
}

/** The polygon features of a GeoJSON file, with Polygon and MultiPolygon made alike. */
export function readAreas(file: string): AreaFeature[] {
  const collection = JSON.parse(fs.readFileSync(file, "utf8")) as { features: RawFeature[] };
  const out: AreaFeature[] = [];
  for (const feature of collection.features) {
    const g = feature.geometry;
    if (!g) continue;
    const polygons =
      g.type === "Polygon"
        ? [g.coordinates as number[][][]]
        : g.type === "MultiPolygon"
          ? (g.coordinates as Polygons)
          : null;
    if (polygons) out.push({ properties: feature.properties ?? {}, polygons });
  }
  return out;
}
