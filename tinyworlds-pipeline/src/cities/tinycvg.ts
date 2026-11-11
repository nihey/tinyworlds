import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { Pattern } from "../scene/kinds.js";
import { OHIO_RIVER } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { CURATED } from "./tinycvg.places.js";
import type { Areas, City, Statue } from "./types.js";

/** Umbrella areas drawn over the neighbourhoods they are made of. */
const UMBRELLAS = new Set(["The Heights", "Clifton Heights–University Heights–Fairview"]);

/** The towns on both banks as districts; Cincinnati's neighbourhoods as outlines. */
function areas(rawDir: string): Areas {
  const features = readAreas(path.join(rawDir, "areas.geojson"));
  return {
    districts: features
      .filter((f) => f.properties.kind === "locality")
      .map((f) => ({ name: f.properties.name, polygons: f.polygons })),
    hoods: features
      .filter((f) => f.properties.kind === "hood" && !UMBRELLAS.has(f.properties.name))
      .map((f) => ({
        name: f.properties.name,
        district: f.properties.district ?? "Cincinnati",
        polygons: f.polygons,
      })),
  };
}

// Lunken Airport's two runways, from the map data: their ends, and one kilometre along each
const RWY_21_NE: [number, number] = [-84.41179, 39.10837];
const RWY_21_KM: [number, number] = [-0.004139, -0.0084]; // north-east to south-west
const RWY_25_E: [number, number] = [-84.41197, 39.10918];
const RWY_25_KM: [number, number] = [-0.010238, -0.004229]; // east to west
const along = (
  end: [number, number],
  km: [number, number],
  d: number,
  alt: number,
): [number, number, number] => [end[0] + km[0] * d, end[1] + km[1] * d, alt];

/** The Genius of Water over the Tyler Davidson Fountain: a bronze figure, arms out, on a granite column. */
const GENIUS_OF_WATER: Statue = {
  lon: -84.51246,
  lat: 39.10162,
  base: 0,
  pieces: [
    { dp: 0, dq: 0, from: 0, to: 0.9, r: 6.5, ramp: "white" },
    { dp: 0, dq: 0, from: 0.9, to: 5.6, r: 2.4, ramp: "white" },
    { dp: 0, dq: 0, from: 5.6, to: 9.2, r: 1.5, ramp: "body" },
    { dp: 0, dq: 0, from: 9.2, to: 12.2, r: 0.8, ramp: "body" },
    { dp: 0, dq: 0, from: 11.2, to: 11.7, hp: 0.35, hq: 2, ramp: "body" },
    { dp: 0, dq: 0, from: 12.2, to: 13, r: 0.45, ramp: "body" },
  ],
};

/**
 * Cincinnati, Ohio: downtown and Over-the-Rhine in the basin, the hills round them from Clifton
 * and the zoo to Mount Adams and Eden Park, and Covington and Newport across the Ohio in
 * Kentucky. (The id is the airport's code.) The view is turned to downtown's grid, which leans
 * eleven degrees off the compass, and looks north across the river at the skyline.
 */
export const tinycvg: City = {
  id: "tinycvg",
  title: "Cincinnati",
  // the Genius of Water in Fountain Square
  origin: { lon: -84.51246, lat: 39.10162 },
  betaDeg: -11.1,
  k: 2,
  bbox: { west: -84.585, south: 39.065, east: -84.41, north: 39.165 },
  // the skyline over the river, the Roebling Bridge in front
  start: { lon: -84.5108, lat: 39.0985, scale: 1 },
  maxScale: 3,
  attribution: ["© OpenStreetMap contributors", "Overture Maps Foundation"],
  // order matters: the areas are cut from Overture's divisions
  sources: [overture, overtureAreas()],
  accent: "#a56bff",
  card: { lon: -84.5106, lat: 39.0972, shrink: 3.2 },

  limits: { kind: "built-up", parks: ["Eden Park", "Burnet Woods", "Devou Park"] },
  fog: { start: 900, end: 1900 },
  areas,

  // two buildings in three come with a height, most of the rest with their floors: Over-the-Rhine's
  // walk-ups have tall ones
  heights: { storey: 3.6, raster: false },
  style: OHIO_RIVER,
  landmarks: {
    "carew tower": { wall: R.tan, roof: R.roofGravel, pattern: Pattern.Punched },
    "hilton cincinnati netherland plaza": { wall: R.tan, roof: R.roofGravel, pattern: Pattern.Punched },
    "great american tower at queen city square": { wall: R.glassBlue, pattern: Pattern.Curtain },
    "scripps center at 312 walnut": {
      wall: R.rose,
      roof: R.roofSlate,
      pattern: Pattern.Punched,
      pyramid: 0.08,
    },
    "john a. roebling bridge": { wall: R.tan, roof: R.tan, pattern: Pattern.None },
    "cincinnati union terminal": { wall: R.limestone, pattern: Pattern.Tall },
    "music hall": { wall: R.brickRed, roof: R.roofSlate, pattern: Pattern.Tall },
    "cincinnati city hall": { wall: R.brickRed, roof: R.roofSlate, pattern: Pattern.Tall },
    "cathedral basilica of saint peter in chains": { wall: R.limestone, roof: R.roofSlate },
    "cathedral basilica of the assumption": { wall: R.greyStone, roof: R.roofSlate },
    "cincinnati art museum": { wall: R.greyStone, roof: R.roofSlate },
    "krohn conservatory": { wall: R.glassSilver, roof: R.glassSilver, pattern: Pattern.Curtain },
    // the stands: the Reds' red seats, the Bengals' orange
    "great american ball park": { wall: R.concrete, roof: R.roofRed },
    "paycor stadium": { wall: R.concrete, roof: R.roofClay },
    // FC Cincinnati's: its white roof, mapped as one canopy over the pitch too
    "west end stadium": { wall: R.roofSilver, roof: R.roofWhite },
  },
  // its parts have no heights: the hall stands about this tall to its eaves
  heightFixes: { "music hall": 26 },
  statues: [GENIUS_OF_WATER],
  // the Roebling Bridge's towers are mapped as buildings: its cables leave them near the top
  suspensions: [{ a: [-84.509503, 39.091472], b: [-84.510227, 39.094316], top: 58, side: 105 }],
  riverBridges: true,
  // a sightseeing riverboat from the Newport levee down past the Roebling to the Brent Spence,
  // along the middle of the river (measured off the water polygons)
  boats: [
    {
      name: "Ohio River cruise",
      path: [
        [-84.4952, 39.0989],
        [-84.499, 39.0972],
        [-84.503, 39.0957],
        [-84.507, 39.0941],
        [-84.511, 39.0927],
        [-84.515, 39.0917],
        [-84.519, 39.0911],
        [-84.523, 39.0909],
        [-84.527, 39.0915],
      ],
    },
  ],
  sights: {
    placeWords: ["Cincinnati", "Ohio", "Kentucky", "Queen City"],
    // the context lines say "Downtown" or "Over-the-Rhine": a question's area is its town
    areaByDistrict: true,
    // the other names their openings give, which would give them away
    aliases: {
      "paycor stadium": ["Paul Brown Stadium"],
      "tyler davidson fountain": ["The Genius of Water", "Genius of Water"],
      "heritage bank center": ["Riverfront Coliseum"],
      "hard rock casino cincinnati": ["Horseshoe Cincinnati"],
      "fourth & walnut center": ["First National Bank Building"],
    },
    // the Roebling Bridge's towers are mapped as a building; the Purple People Bridge's walkway
    // keeps the railroad's name
    bridges: {
      "roebling suspension bridge": ["John A. Roebling Bridge"],
      "purple people bridge": ["Louisville and Nashville Railroad Bridge"],
    },
    // the articles a nearby title match misses: another name, or too far from the sight's point;
    // Scripps Center is mapped twice, a plain tower over a detailed one, and both are the one article
    wikipedia: {
      "roebling suspension bridge": "John A. Roebling Suspension Bridge",
      "great american tower": "Great American Tower at Queen City Square",
      "purple people bridge": "Purple People Bridge",
      "scripps center": "Scripps Center",
      "scripps center at 312 walnut": "Scripps Center",
      "hilton netherland plaza": "Hilton Cincinnati Netherland Plaza",
      "aronoff center for the arts": "Aronoff Center",
      "kroger building": "Kroger Building",
      "potter stewart u.s. courthouse": "Potter Stewart United States Courthouse",
      "american sign museum": "American Sign Museum",
    },
  },
  roofs: { waterTanks: false },
  // no street-tree survey: the streets are lined by rule
  trees: { street: { spacing: 13, chance: 0.3 } },
  flora: "temperate",
  ground: {},

  curated: CURATED,
  flights: [
    // Lunken Airport: a light plane landing from the north-east
    {
      kind: "plane",
      loop: false,
      speed: 45,
      pause: 40,
      path: [
        along(RWY_21_NE, RWY_21_KM, -6, 380),
        along(RWY_21_NE, RWY_21_KM, -2.5, 150),
        along(RWY_21_NE, RWY_21_KM, 0.3, 0),
        along(RWY_21_NE, RWY_21_KM, 1.3, 0),
      ],
    },
    // and one taking off to the west, up the river towards downtown
    {
      kind: "plane",
      loop: false,
      speed: 48,
      pause: 60,
      path: [
        along(RWY_25_E, RWY_25_KM, 0.1, 0),
        along(RWY_25_E, RWY_25_KM, 1.0, 0),
        along(RWY_25_E, RWY_25_KM, 3, 200),
        along(RWY_25_E, RWY_25_KM, 8, 600),
      ],
    },
  ],
  search: {
    districtOnly: false,
    bridge: /bridge/i,
    stationSuffix: " station",
    districtRank: 80,
    // a city of ten-storey landmarks, churches and campuses: they are what people look for
    namedBuildings: {
      minHeight: 40,
      classes: ["church", "civic", "public", "government", "university", "college", "library"],
    },
  },
};
