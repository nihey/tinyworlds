import type { AreaFeature } from "../geom/geojson.js";
import type { Areas, City, Polygons } from "./types.js";

/** Does any polygon of an area reach into the map's box? */
export const touches = (polygons: Polygons, b: City["bbox"]): boolean =>
  polygons.some((poly) =>
    poly[0].some(([lon, lat]) => lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north),
  );

/**
 * A city's published neighbourhoods as outlines, and the parts of town they make up (Downtown,
 * North Side, Oakland…) as its districts: the context line of everything in them and a
 * question's area. `sections` lists each part's neighbourhoods by their published name; one in
 * none of them stays in a part named `fallback` (the city), so nothing is lost. The neighbours'
 * towns (`towns`, Overture's localities other than the city) are districts of their own.
 */
export function sectioned(opts: {
  neighbourhoods: AreaFeature[];
  nameOf: (f: AreaFeature) => string;
  sections: Record<string, readonly string[]>;
  fallback: string;
  towns: AreaFeature[];
  bbox: City["bbox"];
}): Areas {
  const sectionOf = new Map<string, string>();
  for (const [section, names] of Object.entries(opts.sections))
    for (const name of names) sectionOf.set(name, section);
  const hoods = opts.neighbourhoods
    .filter((f) => touches(f.polygons, opts.bbox))
    .map((f) => {
      const name = opts.nameOf(f);
      return { name, district: sectionOf.get(name) ?? opts.fallback, polygons: f.polygons };
    });
  const parts = new Map<string, Polygons>();
  for (const hood of hoods) parts.set(hood.district, [...(parts.get(hood.district) ?? []), ...hood.polygons]);
  return {
    districts: [
      ...[...parts].map(([name, polygons]) => ({ name, polygons })),
      ...opts.towns.map((f) => ({ name: String(f.properties.name), polygons: f.polygons })),
    ],
    hoods,
  };
}

/**
 * Parts of town the data knows only as named points (Overture's macrohoods: Downtown, the Old
 * North End, the Westside), as districts: each is the ground nearer its point than any other
 * point's, out to `radius` metres from it. What lies farther from all of them keeps the district
 * under it (the city), so list these after it: the last district listed wins where they overlap.
 */
export function aroundPoints(
  points: readonly { name: string; lon: number; lat: number }[],
  radius: number,
  sides = 48,
): Areas["districts"] {
  if (points.length === 0) return [];
  const lat0 = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const mx = 111195 * Math.cos((lat0 * Math.PI) / 180);
  const my = 111195;
  const xy = points.map((p) => [p.lon * mx, p.lat * my]);
  const districts: Areas["districts"] = [];
  points.forEach((point, i) => {
    const [cx, cy] = xy[i];
    let ring: number[][] = [];
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides;
      ring.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
    }
    for (let j = 0; j < points.length && ring.length >= 3; j++) {
      const [ox, oy] = xy[j];
      if (j === i || (ox === cx && oy === cy)) continue;
      // keep the side of the two points' bisector that holds this one
      const [bx, by] = [(cx + ox) / 2, (cy + oy) / 2];
      ring = keepBelow(ring, (x, y) => (x - bx) * (ox - cx) + (y - by) * (oy - cy));
    }
    if (ring.length < 3) return;
    const lonLat = ring.map(([x, y]) => [Math.round((x / mx) * 1e6) / 1e6, Math.round((y / my) * 1e6) / 1e6]);
    districts.push({ name: point.name, polygons: [[[...lonLat, lonLat[0]]]] });
  });
  return districts;
}

/** The part of a convex ring where `f` is not positive (Sutherland–Hodgman against one line). */
function keepBelow(ring: number[][], f: (x: number, y: number) => number): number[][] {
  const out: number[][] = [];
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    const fa = f(a[0], a[1]);
    const fb = f(b[0], b[1]);
    if (fa <= 0) out.push(a);
    if (fa <= 0 !== fb <= 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
