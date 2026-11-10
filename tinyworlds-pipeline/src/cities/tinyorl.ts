import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { G, Pattern } from "../scene/kinds.js";
import { FLORIDA } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { CURATED } from "./tinyorl.places.js";
import type { Areas, City } from "./types.js";

/** Municipalities and census places as districts; the neighbourhoods inside them as outlines. */
function areas(rawDir: string): Areas {
  const features = readAreas(path.join(rawDir, "areas.geojson"));
  return {
    districts: features
      .filter((f) => f.properties.kind === "locality")
      .map((f) => ({ name: f.properties.name, polygons: f.polygons })),
    hoods: features
      .filter((f) => f.properties.kind === "hood")
      .map((f) => ({
        name: f.properties.name,
        district: f.properties.district ?? "Orlando",
        polygons: f.polygons,
      })),
  };
}

// one kilometre north along a runway, in degrees of latitude (the airport's runways run north–south)
const KM = 1 / 111.19;

/**
 * Orlando, Florida: not the city limits (which are a patchwork) but everything built up between
 * Walt Disney World in the south-west and Winter Park in the north-east. The street grid follows
 * the compass, so north points up and to the right.
 */
export const tinyorl: City = {
  id: "tinyorl",
  title: "Orlando",
  // the fountain of Lake Eola
  origin: { lon: -81.3725, lat: 28.54388 },
  betaDeg: -0.5,
  k: 2,
  bbox: { west: -81.63, south: 28.33, east: -81.26, north: 28.62 },
  // Lake Eola with the downtown towers behind it
  start: { lon: -81.3762, lat: 28.5428, scale: 1 },
  maxScale: 3,
  attribution: ["© OpenStreetMap contributors", "Overture Maps Foundation"],
  // order matters: the areas are cut from Overture's divisions
  sources: [overture, overtureAreas({ rename: { "Хантерс-Крик": "Hunter's Creek" } })],
  accent: "#3ccfc0",
  card: { lon: -81.3762, lat: 28.5428, shrink: 2 },

  limits: { kind: "built-up" },
  fog: { start: 900, end: 1900 },
  areas,

  // 96% of the buildings come with a height
  heights: { storey: 3.3, raster: false },
  style: FLORIDA,
  landmarks: {
    "spaceship earth": { wall: R.roofSilver, roof: R.roofSilver, pattern: Pattern.None, dome: 0.8 },
    "cinderella castle": { wall: R.limestone, roof: R.roofSlate, pattern: Pattern.Tall },
    "hogwarts castle": { wall: R.tan, roof: R.roofSlate, pattern: Pattern.Tall },
    "tree of life": { wall: R.brownstone, roof: R.forest, pattern: Pattern.None, dome: 0.55 },
    "the twilight zone tower of terror": { wall: R.salmon, roof: R.roofTerracotta, pattern: Pattern.Punched },
    "suntrust center": { wall: R.rose, roof: R.roofCopper, pattern: Pattern.Punched },
    "orange county courthouse": { wall: R.cream, roof: R.roofSlate, pattern: Pattern.Punched },
    "orlando city hall": { wall: R.limestone, roof: R.roofCopper, pattern: Pattern.Ribbon, dome: 0.2 },
    "amway center": { wall: R.glassSilver, pattern: Pattern.Curtain },
  },
  // a warehouse mapped as a hundred metres tall
  heightFixes: { "dzee textiles": 9 },
  // the pavilions under Spaceship Earth were measured through the sphere above them
  heightCaps: [{ lon: -81.5494, lat: 28.3753, radius: 190, max: 9 }],
  statues: [],
  roofs: { waterTanks: false },
  // no street-tree survey: the streets are lined by rule, generously (it is a leafy city)
  trees: { street: { spacing: 14, chance: 0.28 } },
  flora: "subtropical",
  ground: { landCover: { barren: G.Sand } },

  curated: CURATED,
  flights: [
    // Orlando International: landing from the south on the west runway, the rollout north
    {
      kind: "plane",
      loop: false,
      speed: 68,
      pause: 45,
      path: [
        [-81.32196, 28.41532 - 8 * KM, 420],
        [-81.32196, 28.41532 - 3 * KM, 160],
        [-81.322, 28.41532 + 0.4 * KM, 0],
        [-81.3222, 28.41532 + 2.4 * KM, 0],
      ],
    },
    // taking off to the north from the east side
    {
      kind: "plane",
      loop: false,
      speed: 72,
      pause: 60,
      path: [
        [-81.2956, 28.40811 + 0.1 * KM, 0],
        [-81.29575, 28.40811 + 1.7 * KM, 0],
        [-81.2958, 28.40811 + 4.5 * KM, 210],
        [-81.2958, 28.40811 + 10 * KM, 700],
      ],
    },
  ],
  // sixteen small municipalities: listed, but below the places people come for
  search: { districtOnly: false, bridge: /bridge/i, stationSuffix: " station", districtRank: 72 },
};
