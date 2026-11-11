import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import type { Areas, Polygons } from "./types.js";

/** Spellings in the County's table that are not the ones people use. */
const RENAME: Record<string, string> = {
  Silverlake: "Silver Lake",
  "Mid-city": "Mid-City",
  "Mt. Washington": "Mount Washington",
  "Playa Del Rey": "Playa del Rey",
  "St Elmo Village": "St. Elmo Village",
  // the community along Central Avenue south of downtown, which its own council calls this
  Central: "Historic South-Central",
  // the unincorporated "West LA" is the veterans' campus, not the neighbourhood of that name
  "West LA": "West LA VA",
  "View Park/Windsor Hills": "View Park-Windsor Hills",
};
const named = (name: string): string => RENAME[name] ?? name;

/** The middle of an area's bounding box: good enough to tell whether it is on the map. */
function middle(polygons: Polygons): [number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const rings of polygons)
    for (const [lon, lat] of rings[0]) {
      w = Math.min(w, lon);
      e = Math.max(e, lon);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  return [(w + e) / 2, (s + n) / 2];
}

/**
 * Los Angeles County's statistical areas, read as New York reads its boroughs and
 * neighbourhoods. The districts (the context line of everything inside them) are the cities: the
 * City of Los Angeles as one, Santa Monica, Beverly Hills, Culver City… and each unincorporated
 * community on its own (Marina del Rey, East Los Angeles). The outlines are the City of Los
 * Angeles' communities (Hollywood, Venice, Westwood), and the other cities and unincorporated
 * communities whole, listed in search as the districts they are.
 */
export function laAreas(
  rawDir: string,
  city: string,
  bbox: { west: number; south: number; east: number; north: number },
): Areas {
  const features = readAreas(path.join(rawDir, "csa.geojson"));
  const onMap = (polygons: Polygons): boolean => {
    const [lon, lat] = middle(polygons);
    return lon > bbox.west && lon < bbox.east && lat > bbox.south && lat < bbox.north;
  };

  // the City of Los Angeles' communities, other whole cities, unincorporated communities
  const communities = new Map<string, Polygons>();
  const cities = new Map<string, Polygons>();
  const unincorporated = new Map<string, Polygons>();
  const into = (map: Map<string, Polygons>, name: string, polygons: Polygons): void => {
    map.set(name, [...(map.get(name) ?? []), ...polygons]);
  };
  for (const { properties, polygons } of features) {
    const community = (properties.COMMUNITY ?? "").trim();
    if (properties.CITY_TYPE === "City" && community) into(communities, named(community), polygons);
    else if (properties.CITY_TYPE === "City") into(cities, named(properties.LCITY), polygons);
    else if (community) into(unincorporated, named(community), polygons);
  }
  // a county pocket sharing its name with a community or a city around it is part of it
  for (const [name, polygons] of [...unincorporated]) {
    const host = communities.has(name) ? communities : cities.has(name) ? cities : null;
    if (!host) continue;
    into(host, name, polygons);
    unincorporated.delete(name);
  }

  const districts: Areas["districts"] = [
    { name: city, polygons: [...communities.values()].flat() },
    ...[...cities, ...unincorporated].map(([name, polygons]) => ({ name, polygons })),
  ];
  const hoods: Areas["hoods"] = [
    ...[...communities].map(([name, polygons]) => ({ name, district: city, polygons })),
    // filed under the map's own name, so search lists each of these once, as the district it is
    ...[...cities, ...unincorporated].map(([name, polygons]) => ({
      name,
      district: city,
      polygons,
      listed: { name, type: "borough" as const },
    })),
  ].filter((hood) => onMap(hood.polygons));
  return { districts, hoods };
}
