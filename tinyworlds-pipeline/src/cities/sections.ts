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
