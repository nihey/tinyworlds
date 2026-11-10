import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { G, Pattern } from "../scene/kinds.js";
import { MOJAVE } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { CURATED } from "./tinylas.places.js";
import type { Areas, City } from "./types.js";

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
        district: f.properties.district ?? "Las Vegas",
        polygons: f.polygons,
      })),
  };
}

// one kilometre along the east–west runways, in degrees of longitude at this latitude
const KM = 1 / 89.7;
const glass = (wall: number) => ({ wall, pattern: Pattern.Curtain });

/**
 * Las Vegas: the middle of the valley, from downtown and the Strip to the airport, in the desert.
 * (The id is the airport's code, LAS.) The valley's grid follows the compass, so north points up
 * and to the right and the Strip climbs that way too.
 */
export const tinylas: City = {
  id: "tinylas",
  title: "Las Vegas",
  // the fountains of the Bellagio
  origin: { lon: -115.17661, lat: 36.11311 },
  betaDeg: 0,
  k: 2,
  bbox: { west: -115.26, south: 36.05, east: -115.06, north: 36.24 },
  // the middle of the Strip
  start: { lon: -115.1728, lat: 36.1135, scale: 1 },
  maxScale: 3,
  attribution: ["© OpenStreetMap contributors", "Overture Maps Foundation"],
  // order matters: the areas are cut from Overture's divisions
  sources: [overture, overtureAreas({ hoods: ["macrohood", "neighborhood"] })],
  accent: "#ff4fa3",
  // the Strip from the Bellagio to the Venetian
  card: { lon: -115.1722, lat: 36.1165, shrink: 3 },

  limits: { kind: "built-up" },
  fog: { start: 900, end: 1900 },
  areas,

  // nine buildings in ten come with a height
  heights: { storey: 3.3, raster: false },
  style: MOJAVE,
  landmarks: {
    "stratosphere tower": { wall: R.concrete, roof: R.roofWhite, pattern: Pattern.None },
    sphere: { wall: R.glassBlack, roof: R.glassDark, pattern: Pattern.None, dome: 0.85 },
    "luxor las vegas": { wall: R.glassBlack, roof: R.glassBlack, pattern: Pattern.None, pyramid: 0.97 },
    "eiffel tower": { wall: R.brownstone, roof: R.brownstone, pattern: Pattern.None, pyramid: 0.92 },
    "allegiant stadium": { wall: R.glassBlack, roof: R.roofSilver, pattern: Pattern.None, dome: 0.15 },
    "bellagio las vegas": { wall: R.cream, roof: R.roofTerracotta, pattern: Pattern.Punched },
    "wynn las vegas": glass(R.glassBronze),
    "encore las vegas": glass(R.glassBronze),
    "mandalay bay resort & casino": glass(R.gold),
    "palazzo tower": { wall: R.cream, pattern: Pattern.Punched },
    "venetian tower": { wall: R.cream, pattern: Pattern.Punched },
    "circa resort & casino": glass(R.glassDark),
    "t-mobile arena": { wall: R.glassBronze, roof: R.roofSilver, pattern: Pattern.None, dome: 0.12 },
  },
  statues: [],
  roofs: { waterTanks: false },
  // palms and desert trees along some streets, by rule; few are mapped
  trees: { street: { spacing: 16, chance: 0.14 } },
  flora: "subtropical",
  // the desert: bare ground and scrub as dry, tussocky steppe
  ground: { landCover: { barren: G.Steppe, shrub: G.Steppe } },

  curated: CURATED,
  flights: [
    // landing from the east on the long runway
    {
      kind: "plane",
      loop: false,
      speed: 70,
      pause: 40,
      path: [
        [-115.12112 + 8 * KM, 36.07642, 420],
        [-115.12112 + 3 * KM, 36.07642, 160],
        [-115.12112 - 0.4 * KM, 36.07642, 0],
        [-115.12112 - 2.6 * KM, 36.0764, 0],
      ],
    },
    // taking off to the west, over the Strip
    {
      kind: "plane",
      loop: false,
      speed: 74,
      pause: 55,
      path: [
        [-115.12584 - 0.1 * KM, 36.07365, 0],
        [-115.12584 - 1.9 * KM, 36.07364, 0],
        [-115.12584 - 4.8 * KM, 36.07363, 230],
        [-115.12584 - 10.5 * KM, 36.07363, 720],
      ],
    },
  ],
  search: { districtOnly: false, bridge: /bridge/i, stationSuffix: " station", districtRank: 80 },
};
