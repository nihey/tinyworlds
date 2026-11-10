import type { Pattern } from "../scene/kinds.js";
import type { StyleProfile } from "../scene/styles.js";
import type { DataSource } from "../sources/types.js";

/**
 * Buildings everyone knows get the material everyone remembers, instead of whatever the style
 * rules would have guessed. Keyed by the building's name in the data, lower case.
 */
export interface LandmarkStyle {
  wall?: number;
  roof?: number;
  glass?: number;
  pattern?: Pattern;
  /** The top is a dome, taking this share (0–1) of the building's height: a sphere, a rotunda. */
  dome?: number;
}

/** Something that is not a building, so it is not in the data: a stack of prisms on a spot. */
export interface Statue {
  lon: number;
  lat: number;
  /** What it stands on, metres above ground. */
  base: number;
  /** Offsets are metres uptown / crosstown from the spot; radii and heights in metres. */
  pieces: readonly { dp: number; dq: number; r: number; from: number; to: number; ramp: "body" | "gold" }[];
}

/**
 * The places people type first. Hand-picked so they rank above everything derived from data and
 * exist under the name people actually use. `s` is the zoom to arrive at (screen px per map px).
 */
export interface Curated {
  n: string;
  t: "landmark" | "park" | "bridge" | "museum" | "station" | "place";
  lon: number;
  lat: number;
  b?: string;
  r: number;
  s?: number;
}

/** A lon/lat polygon set: polygons → rings → [lon, lat] points. */
export type Polygons = number[][][][];

/** The city's own subdivisions, read from its raw files. */
export interface Areas {
  /** The big parts (boroughs, zones): searchable, and the context line of everything inside them. */
  districts: { name: string; polygons: Polygons }[];
  /** The areas whose outlines the viewer can draw. `listed` is how one appears in search, when not as a "hood" under its own name. */
  hoods: {
    name: string;
    district: string;
    polygons: Polygons;
    listed?: { name: string; type: "hood" | "borough" };
  }[];
}

/** Something that flies over the map: [lon, lat, metres above ground] points. */
export interface Flight {
  kind: "helicopter" | "plane";
  path: [number, number, number][];
  /** A closed circuit flown forever, or a run from start to end repeated after a pause. */
  loop: boolean;
  /** Ground metres per second. */
  speed?: number;
  /** Seconds between runs when `loop` is false. */
  pause?: number;
}

/** Everything that makes the pipeline draw one city rather than another. */
export interface City {
  /** Also the manifest name, the data folder and the URL path: "tinynyc". */
  id: string;
  /** What people call the place: the context line of city-wide search results. */
  title: string;
  /** Map px (0, 0). */
  origin: { lon: number; lat: number };
  /** Bearing of the street grid's "uptown" axis, clockwise from true north. Aligning the view to
   *  it puts the grid's streets on exact 2:1 pixel slopes. */
  betaDeg: number;
  /** Map px per metre along either ground axis (one metre uptown moves k px right, k/2 px up). */
  k: number;
  /** Everything fetched and drawn lies inside this box; the fog decides what is actually kept. */
  bbox: { west: number; south: number; east: number; north: number };
  /** Opening view. */
  start: { lon: number; lat: number; scale: number };
  maxScale: number;
  attribution: string[];
  sources: DataSource[];
  /** Brand colour of the city's half of the wordmark. */
  accent: string;
  /** The share card: where the picture is centred, and how many map px are averaged into one. */
  card: { lon: number; lat: number; shrink: number };

  /**
   * What counts as "the city": the fog is measured from it. Either polygons in a raw GeoJSON
   * file, or the built-up part of an Overture division area (for a municipality that is mostly
   * farmland, where the legal limits would make a map of fields) or, with no division named, of
   * the whole bounding box (for a metropolis that ignores its municipal limits).
   */
  limits: { kind: "geojson"; file: string } | { kind: "built-up"; division?: string };
  /** Metres from the city at which the map starts to dissolve, and where it is gone. */
  fog: { start: number; end: number };
  areas(rawDir: string): Areas;

  /** Buildings whose height nobody mapped. */
  heights: {
    /** Metres per storey when only the number of floors is known. */
    storey: number;
    /** Estimate the rest from the satellite height raster (the open-buildings source). */
    raster: boolean;
  };
  style: StyleProfile;
  landmarks: Record<string, LandmarkStyle>;
  /** Heights (metres) for named buildings whose mapped height is plainly a mistake. Keyed like `landmarks`. */
  heightFixes?: Record<string, number>;
  /**
   * Spots where the mapped heights of unnamed buildings are known to be wrong (a survey that
   * measured the landmark overhanging them): within `radius` metres they are no taller than `max`.
   */
  heightCaps?: { lon: number; lat: number; radius: number; max: number }[];
  statues: Statue[];
  /** What stands on a flat roof besides the stair bulkhead. */
  roofs: { waterTanks: boolean };
  trees: {
    /** A raw CSV of "latitude,longitude" rows: a street tree census. */
    census?: string;
    /** No census: line the streets by rule, one candidate spot every `spacing` metres on each side, kept with this chance. */
    street?: { spacing: number; chance: number };
  };
  flora: "temperate" | "tropical" | "subtropical";
  /** Local reading of the data's land classes: Overture subtype/class → ground kind (see scene/kinds.ts). */
  ground: {
    landCover?: Record<string, number>;
    landUse?: Record<string, number>;
    /** Farm tracks are bare earth, not paved paths. */
    dirtTracks?: boolean;
  };

  curated: Curated[];
  flights: Flight[];
  search: {
    /** List only streets and places that lie inside a district (true), or anything on the map. */
    districtOnly: boolean;
    /** A named road on a bridge is filed as a bridge when its name matches. */
    bridge: RegExp;
    /** Appended to rail station names, or null to leave stations out. */
    stationSuffix: string | null;
    /** Rank of the districts themselves in search (default 100: above everything, as boroughs are). */
    districtRank?: number;
  };
}
