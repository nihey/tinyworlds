import type { Pattern } from "../scene/kinds.js";
import type { StyleProfile } from "../scene/styles.js";
import type { SyntheticBuilder } from "../scene/synthetic.js";
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
  /** The top tapers to a point over this share (0–1) of the height: a pyramid, a spire. */
  pyramid?: number;
}

/**
 * Something that is not a building, so it is not in the data: pieces stacked on a spot. A piece
 * is a prism round a point (`r`: the Statue of Liberty) or a box (`hp`, `hq`: half its size
 * uptown and crosstown: the letters of the Hollywood Sign). `body` is a statue's patina.
 */
export interface Statue {
  lon: number;
  lat: number;
  /** What it stands on, metres above ground. */
  base: number;
  /** Offsets are metres uptown / crosstown from the spot; radii, sizes and heights in metres. */
  pieces: readonly StatuePiece[];
}

export type StatuePiece = {
  dp: number;
  dq: number;
  from: number;
  to: number;
  ramp: "body" | "gold" | "white";
} & ({ r: number } | { hp: number; hq: number });

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
  /** It is one structure on the map (a building, stadium, statue or bridge), not an area: it lights up. */
  sight?: boolean;
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
   * the whole bounding box (for a metropolis that ignores its municipal limits). `parks` are
   * land use areas, by name, that count as built up: a park too big to have a building near its
   * middle (Griffith Park) would otherwise dissolve into a hole in the map.
   */
  limits: { kind: "geojson"; file: string } | { kind: "built-up"; division?: string; parks?: string[] };
  /** Metres from the city at which the map starts to dissolve, and where it is gone. */
  fog: { start: number; end: number };
  areas(rawDir: string): Areas;

  /** Buildings whose height nobody mapped. */
  heights: {
    /** Metres per storey when only the number of floors is known. */
    storey: number;
    /** Estimate the rest from the satellite height raster (the open-buildings source). */
    raster: boolean;
    /**
     * The mapped heights are a model's estimates that read tall buildings low (Colorado Springs':
     * twelve floors at 22 m): where the floors are mapped too and say taller, they decide.
     */
    floorsFirst?: boolean;
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
  /**
   * Suspension spans whose towers the data draws as buildings rather than bridge supports, so no
   * cables would be strung between them (Cincinnati's Roebling Bridge): the two tower tops, the
   * height the cables leave them at and how far beyond each they are anchored (default 0.42 of
   * the span), metres. Strung like the data's spans.
   */
  suspensions?: { a: [number, number]; b: [number, number]; top: number; side?: number }[];
  /**
   * Its bridges cross a river that runs inside the land polygons (the Ohio): count the water
   * polygons as water when decks rise from the shore, not only the sea.
   */
  riverBridges?: boolean;
  /** Boats on routes the data does not have (a sightseeing riverboat): sailed there and back, like ferries. */
  boats?: { name: string; path: [number, number][] }[];
  /**
   * The structures found in the search light up in the viewer (sights.json, and their Wikipedia
   * articles: the `wiki` step). `wikipedia` forces a match by lower-case sight name: an English
   * article title, or null for none.
   */
  sights?: {
    wikipedia?: Record<string, string | null>;
    /**
     * A bridge (lower-case name) → the other names some of its pieces are filed under: other roads'
     * (its towers, its lower deck, its subway), or a building's (the Roebling Bridge's towers,
     * mapped as one): those pieces within the bridge's extent light up too. A bridge with no piece
     * under its own name (Pittsburgh's Smithfield Street Bridge, filed under "Smithfield Street")
     * is made of those pieces within 220 m of its entry's point.
     */
    bridges?: Record<string, string[]>;
    /**
     * The city's own name in the three languages and its other place words, which "Guess the
     * building" (the `quiz` step) never blanks out of a text: "New York" in "New York Life
     * Building" says nothing about which building it is. The sights' context lines (boroughs)
     * count without being listed.
     */
    placeWords?: string[];
    /**
     * Other names a sight's articles call it by that would give it away in Guess the building
     * ("the Met", "One WTC"), by lower-case sight name: blanked like its name.
     */
    aliases?: Record<string, string[]>;
    /**
     * The sights' context lines are neighbourhoods ("Downtown", "Over-the-Rhine"), not the city's
     * districts: Guess the building takes a question's area (the borough a player may choose)
     * from the district it stands in instead, when its context line is not one.
     */
    areaByDistrict?: boolean;
  };
  /** What stands on a flat roof besides the stair bulkhead. */
  roofs: { waterTanks: boolean };
  trees: {
    /** A raw CSV of "latitude,longitude" rows: a street tree census. */
    census?: string;
    /** No census: line the streets by rule, one candidate spot every `spacing` metres on each side, kept with this chance. */
    street?: { spacing: number; chance: number };
  };
  flora: "temperate" | "tropical" | "subtropical" | "boreal" | "montane";
  /** Local reading of the data's land classes: Overture subtype/class → ground kind (see scene/kinds.ts). */
  ground: {
    landCover?: Record<string, number>;
    landUse?: Record<string, number>;
    /** Land classes of the rock polygons, read locally: Colorado Springs' bare rock is red sandstone. */
    land?: Record<string, number>;
    /** Farm tracks are bare earth, not paved paths. */
    dirtTracks?: boolean;
    /** Water areas, by name, that are dry land most of the time (the Trinity's floodway, between its levees): left out. */
    dryWater?: string[];
  };

  /**
   * For a place that exists on no map: lays the whole city out by code instead of reading it
   * from data (see scene/synthetic.ts for the builder it draws with). When set, nothing is
   * fetched, and `limits`, `areas`, `heights`, `style`, `landmarks`, `trees`, `ground`, `curated`
   * and `search` are not consulted: the generator says where the map ends, what stands on it and
   * what can be searched for. It must be deterministic.
   */
  synthetic?: (builder: SyntheticBuilder) => void;
  /**
   * For a generated world whose limits are a rectangle on screen: cut the map off cleanly at the
   * limits' bounding rectangle instead of letting it dissolve (the fog grid would notch a straight
   * screen edge into a row of teeth).
   */
  framed?: boolean;

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
    /**
     * Which named buildings are listed (and, in a city with sights, light up): those at least
     * `minHeight` metres tall (default 110, New York's towers), and those of these classes besides
     * the stadiums, museums, stations and cathedrals that always are. A smaller city lists more.
     */
    namedBuildings?: {
      minHeight?: number;
      classes?: string[];
      /** Names that say nothing of the building ("Building 4", "Chapel"): not listed, never lit. */
      skip?: RegExp;
    };
    /**
     * Names of neighbourhoods and points of interest in the data that are not what they say:
     * improvement districts and a zoo's exhibits filed as neighbourhoods, a Fort Worth museum
     * placed in Dallas. Left out of the search, and so never light up.
     */
    skip?: RegExp;
  };
}
