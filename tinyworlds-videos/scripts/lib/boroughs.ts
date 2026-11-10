import fs from "node:fs";
import path from "node:path";
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import { DATA } from "./world.js";

/** A district as the viewer takes them (`MapEngine.setHoods`): its name and its outline in lon/lat. */
export interface District {
  name: string;
  borough: string;
  lon: number;
  lat: number;
  /** flat [lon0, lat0, lon1, lat1, …] per ring */
  rings: number[][];
}

const area = (ring: [number, number][]): number => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum) / 2;
};

/**
 * A world's large divisions as districts of their own: every neighbourhood of a borough merged
 * into one outline. The viewer outlines neighbourhoods; when the film says "all five boroughs"
 * it hands the viewer these instead, so the viewer's own district lines draw the five.
 * The data is the viewer's (hoods.json for the outlines, places.json for where each name sits);
 * `order` is the order they are named in.
 */
export function boroughs(world: string, order: string[]): District[] {
  const dir = path.join(DATA, world);
  const { hoods } = JSON.parse(fs.readFileSync(path.join(dir, "hoods.json"), "utf8")) as {
    hoods: District[];
  };
  const { places } = JSON.parse(fs.readFileSync(path.join(dir, "places.json"), "utf8")) as {
    places: { n: string; t: string; lon: number; lat: number }[];
  };
  return order.map((name) => {
    const parts: Polygon[] = hoods
      .filter((hood) => hood.borough === name)
      .flatMap((hood) =>
        hood.rings.map((ring): Polygon => {
          const points: [number, number][] = [];
          for (let i = 0; i < ring.length; i += 2) points.push([ring[i], ring[i + 1]]);
          return [points];
        }),
      );
    if (parts.length === 0) throw new Error(`${world} has no neighbourhoods in "${name}"`);
    const merged: MultiPolygon = polygonClipping.union(parts[0], ...parts.slice(1));
    // the outer ring of each piece: the gaps simplification leaves between neighbours are holes,
    // and go; so do specks of land too small to read at the size of a city
    const outers = merged.map((polygon) => polygon[0]);
    const largest = Math.max(...outers.map(area));
    const rings = outers.filter((ring) => area(ring) > largest * 0.004).map((ring) => ring.flat());
    const place = places.find((p) => p.t === "borough" && p.n === name);
    if (!place) throw new Error(`${world}'s places have no borough called "${name}"`);
    return { name, borough: name, lon: place.lon, lat: place.lat, rings };
  });
}
