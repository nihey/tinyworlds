import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { NEW_YORK } from "../scene/styles.js";
import { nycOpenData } from "../sources/nycOpenData.js";
import { overture } from "../sources/overture.js";
import { LANDMARKS, LIBERTY } from "./tinynyc.landmarks.js";
import { CURATED } from "./tinynyc.places.js";
import type { City } from "./types.js";

/** Tour helicopters fly about this high over the rivers. */
const TOUR_HEIGHT = 61;
const tour = (lonlat: number[]): [number, number, number][] =>
  Array.from({ length: lonlat.length / 2 }, (_, i) => [lonlat[i * 2], lonlat[i * 2 + 1], TOUR_HEIGHT]);

/** New York City: the five boroughs, turned so Manhattan's avenues run along the pixels. */
export const tinynyc: City = {
  id: "tinynyc",
  title: "New York City",
  // the Empire State Building
  origin: { lon: -73.98566, lat: 40.74844 },
  betaDeg: 28.9,
  k: 2,
  bbox: { west: -74.3, south: 40.45, east: -73.66, north: 40.95 },
  // the Empire State Building, top to bottom, with Midtown around it
  start: { lon: -73.9869, lat: 40.7517, scale: 0.75 },
  maxScale: 3,
  attribution: [
    "© OpenStreetMap contributors",
    "Overture Maps Foundation",
    "NYC Open Data (Dept. of City Planning, Parks & Recreation)",
  ],
  sources: [nycOpenData, overture],
  accent: "#f7c21b",
  // all of Central Park, corner to corner
  card: { lon: -73.9654, lat: 40.7829, shrink: 8 },

  // the five boroughs, clipped to the shoreline; the near shore of New Jersey shows, the rest does not
  limits: { kind: "geojson", file: "boroughs.geojson" },
  fog: { start: 1500, end: 2700 },
  areas(rawDir) {
    return {
      districts: readAreas(path.join(rawDir, "boroughs.geojson")).map((f) => ({
        name: f.properties.boroname ?? f.properties.boro_name ?? "",
        polygons: f.polygons,
      })),
      hoods: readAreas(path.join(rawDir, "ntas.geojson"))
        .filter((f) => f.properties.ntaname)
        .map((f) => ({ name: f.properties.ntaname, district: f.properties.boroname, polygons: f.polygons })),
    };
  },

  // nearly every building has a surveyed height; the rest are guessed from floors and footprint
  heights: { storey: 3.3, raster: false },
  style: NEW_YORK,
  landmarks: LANDMARKS,
  statues: [LIBERTY],
  sights: {
    // never blanked out of a question's text ("Guess the building")
    placeWords: ["New York", "New York City", "NYC", "Nueva York", "Nova Iorque", "Nova York"],
    // the short or former names their openings give, which would give them away
    aliases: {
      "metropolitan museum of art": ["the Met"],
      "one world trade center": ["One WTC", "Freedom Tower", "Torre de la Libertad", "Torre da Liberdade"],
      "museum of sex": ["MoSex"],
      "masonic hall": ["Masons"],
      "the bronx museum of the arts": ["BxMA"],
    },
    // the roads that carry a bridge's towers and decks under names of their own
    bridges: {
      "manhattan bridge": [
        "Canal Street (lower level)",
        "Canal Street",
        "Chrystie Street",
        "BMT Brighton Line",
      ],
      "williamsburg bridge": ["BMT Jamaica Line"],
      "george washington bridge": ["North Walk", "Southwalk"],
    },
    // the articles a nearby title match misses: another name, or too far from the sight's point
    wikipedia: {
      "george washington bridge": "George Washington Bridge",
      "guggenheim museum": "Solomon R. Guggenheim Museum",
      "whitney museum": "Whitney Museum of American Art",
      "steinway tower": "111 West 57th Street",
      "the oculus": "World Trade Center station (PATH)",
      "8 spruce street": "8 Spruce",
      "53 west 53": "53W53",
      "520 5th avenue": "520 Fifth Avenue",
      "atlantic terminal": "Atlantic Terminal", // the station, not the mall above it
    },
  },
  roofs: { waterTanks: true },
  trees: { census: "street_trees.csv" },
  flora: "temperate",
  ground: {},

  curated: CURATED,
  // sightseeing loops: up the Hudson and back, and around the harbour past the statue
  flights: [
    {
      kind: "helicopter",
      loop: true,
      speed: 41,
      path: tour([
        -74.0135, 40.7005, -74.022, 40.725, -74.012, 40.76, -73.99, 40.8, -73.962, 40.845, -73.975, 40.85,
        -74.005, 40.8, -74.025, 40.755, -74.03, 40.715,
      ]),
    },
    {
      kind: "helicopter",
      loop: true,
      speed: 41,
      path: tour([
        -74.009, 40.701, -74.04, 40.693, -74.05, 40.686, -74.04, 40.681, -74.015, 40.684, -73.996, 40.699,
        -73.972, 40.71, -73.962, 40.735, -73.975, 40.728, -73.995, 40.705,
      ]),
    },
  ],
  search: { districtOnly: true, bridge: /bridge/i, stationSuffix: " station" },
};
