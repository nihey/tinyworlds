import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { G, Pattern } from "../scene/kinds.js";
import { TEXAS } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { CURATED } from "./tinycos.places.js";
import { aroundPoints } from "./sections.js";
import type { Areas, City } from "./types.js";

/**
 * The parts of town the map data knows by a point alone (Overture's macrohoods, the Broadmoor,
 * and Cragmor round the university), at its coordinates.
 */
export const PARTS = [
  { name: "Downtown", lon: -104.8228, lat: 38.8345 },
  { name: "Historic Uptown", lon: -104.8218, lat: 38.8432 },
  { name: "Old North End", lon: -104.8248, lat: 38.8547 },
  { name: "Roswell", lon: -104.8275, lat: 38.8717 },
  { name: "Patty Jewett", lon: -104.8127, lat: 38.8585 },
  { name: "Middle Shooks Run", lon: -104.8108, lat: 38.8425 },
  { name: "Divine Redeemer", lon: -104.7989, lat: 38.8438 },
  { name: "Knob Hill", lon: -104.7851, lat: 38.8412 },
  { name: "Hillside", lon: -104.8095, lat: 38.8256 },
  { name: "Spring Creek", lon: -104.7866, lat: 38.8077 },
  { name: "Ivywild", lon: -104.8332, lat: 38.8098 },
  { name: "Westside", lon: -104.8442, lat: 38.8376 },
  { name: "Old Colorado City", lon: -104.8632, lat: 38.8476 },
  { name: "Broadmoor", lon: -104.8414, lat: 38.7955 },
  { name: "Cragmor", lon: -104.8068, lat: 38.8892 },
] as const;

/**
 * The city, the towns round it and the Air Force Academy as districts, with the parts of town
 * over the city (each as far as 1.6 km round its point); Overture's few neighbourhoods as
 * outlines.
 */
export function areas(rawDir: string): Areas {
  const features = readAreas(path.join(rawDir, "areas.geojson"));
  const localities = features
    .filter((f) => f.properties.kind === "locality")
    // the city first: what is listed after it wins where they overlap
    .sort(
      (a, b) =>
        Number(b.properties.name === "Colorado Springs") - Number(a.properties.name === "Colorado Springs"),
    )
    .map((f) => ({ name: String(f.properties.name), polygons: f.polygons }));
  return {
    districts: [...localities, ...aroundPoints(PARTS, 1600)],
    hoods: features
      .filter((f) => f.properties.kind === "hood")
      .map((f) => ({
        name: f.properties.name,
        district: f.properties.district ?? "Colorado Springs",
        polygons: f.polygons,
      })),
  };
}

/**
 * Colorado Springs, Colorado: downtown under Pikes Peak, Old Colorado City, Manitou Springs and
 * the Garden of the Gods, the Broadmoor, and the Air Force Academy to the north. (The id is the
 * airport's code.)
 */
export const tinycos: City = {
  id: "tinycos",
  title: "Colorado Springs",
  origin: { lon: -104.8214, lat: 38.8339 },
  betaDeg: 2.3,
  k: 2,
  bbox: { west: -104.93, south: 38.765, east: -104.74, north: 39.025 },
  start: { lon: -104.8238, lat: 38.8335, scale: 1 },
  maxScale: 3,
  attribution: ["© OpenStreetMap contributors", "Overture Maps Foundation"],
  // order matters: the areas are cut from Overture's divisions
  sources: [
    overture,
    overtureAreas({
      maxArea: 0.12,
      // a town of its own in all but name
      landUse: ["United States Air Force Academy"],
      rename: { "United States Air Force Academy": "Air Force Academy" },
    }),
  ],
  accent: "#ff6b57",
  card: { lon: -104.8262, lat: 38.8352, shrink: 3 },

  // the parks and grounds too big to have a building near their middle, with the sights in them
  limits: {
    kind: "built-up",
    parks: [
      "Garden of the Gods Park",
      "Red Rock Canyon Open Space",
      "Glen Eyrie",
      "Palmer Park",
      "Ute Valley Park",
      "Seven Falls Park",
      "Cheyenne Mountain Zoo",
      "U.S. Air Force Academy",
      "Falcon Stadium",
    ],
  },
  fog: { start: 900, end: 1900 },
  areas,

  // nine buildings in ten come with a height, estimated: the floors, where mapped, say better
  heights: { storey: 3.6, raster: false, floorsFirst: true },
  style: TEXAS,
  landmarks: {
    // the Cadet Chapel: aluminium and glass, its seventeen spires in a row
    "air force academy cadet chapel": {
      wall: R.roofSilver,
      roof: R.roofSilver,
      glass: R.glassBlue,
      pattern: Pattern.Tall,
      pyramid: 0.7,
    },
    // the Academy's cadet area: white modernism, glass in bands
    "fairchild hall": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Ribbon },
    "vandenberg hall main": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Ribbon },
    "vandenberg hall tower": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Ribbon },
    "sijan hall main": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Ribbon },
    "sijan hall tower": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Ribbon },
    "mitchell hall": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Curtain },
    "harmon hall": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Ribbon },
    "mcdermott library": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Ribbon },
    "gregory hall": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Ribbon },
    "barry goldwater air force academy visitor center": {
      wall: R.whiteBrick,
      roof: R.roofWhite,
      pattern: Pattern.Curtain,
    },
    // the Broadmoor: pink stucco under red tile, round its lake
    "broadmoor main": { wall: R.salmon, roof: R.roofTerracotta, pattern: Pattern.Punched },
    "broadmoor south": { wall: R.salmon, roof: R.roofTerracotta, pattern: Pattern.Punched },
    "broadmoor west": { wall: R.salmon, roof: R.roofTerracotta, pattern: Pattern.Punched },
    "broadmoor west tower": { wall: R.salmon, roof: R.roofTerracotta, pattern: Pattern.Punched },
    "broadmoor hall": { wall: R.salmon, roof: R.roofTerracotta, pattern: Pattern.Punched },
    "broadmoor spa, tennis and golf complex": {
      wall: R.salmon,
      roof: R.roofTerracotta,
      pattern: Pattern.Punched,
    },
    // the Olympic & Paralympic Museum: white and aluminium
    "u.s. olympic and paralympic museum": { wall: R.whiteBrick, roof: R.roofSilver, pattern: Pattern.Sparse },
    // the Falcons' blue seats
    "falcon stadium": { wall: R.concrete, roof: R.sidingBlue },
  },
  // the mapped heights read these far too low (Fairchild Hall's six storeys at 3 m)
  heightFixes: {
    "fairchild hall": 24,
    "vandenberg hall tower": 22,
    "mitchell hall": 12,
    "harmon hall": 18,
    "mcdermott library": 16,
    "gregory hall": 12,
    "broadmoor main": 30,
    "broadmoor west": 24,
    "broadmoor west tower": 30,
    "broadmoor south": 22,
    "u.s. olympic and paralympic museum": 18,
  },
  statues: [],
  sights: {
    placeWords: [
      "Colorado Springs",
      "Colorado",
      "El Paso County",
      "Pikes Peak",
      "Pikes Peak region",
      "Front Range",
    ],
    // the context lines say "Downtown" or "Old North End": a question's area is its part of town
    areaByDistrict: true,
    // the articles a nearby title match misses: their titles are longer
    wikipedia: {
      "cadet chapel": "United States Air Force Academy Cadet Chapel",
      "pikes peak center": "Pikes Peak Center for the Performing Arts",
      "u.s. olympic & paralympic museum": "United States Olympic & Paralympic Museum",
      "the antlers": "Antlers Hotel (Colorado Springs, Colorado)",
      "wells fargo tower": "Wells Fargo Tower (Colorado Springs)",
      "cossitt hall": "Frederick H. Cossitt Memorial Hall",
      "saint mary's cathedral": "St. Mary's Cathedral (Colorado Springs, Colorado)",
      "st. george's anglican church": "St. George's Anglican Church (Colorado Springs, Colorado)",
      "first congregational church": "First Congregational Church (Colorado Springs, Colorado)",
      "penrose library": "Colorado Springs Public Library–Carnegie Building",
      "old colorado city library": "Old Colorado City Branch Carnegie Library",
      "manitou springs post office": "United States Post Office-Manitou Springs Main",
      "pauline chapel": "Pauline Chapel (Colorado Springs, Colorado)",
      "emmanuel presbyterian church": "Emmanuel Presbyterian Church (Colorado Springs, Colorado)",
      "burgess house": "Burgess House (Colorado Springs, Colorado)",
      "redstone castle": "Redstone Castle (Manitou Springs, Colorado)",
      "carlton house": "Carlton House (United States Air Force Academy)",
      "montgomery hall": "Montgomery Hall, Colorado College",
    },
    // the other names their openings give, which would give them away
    aliases: {
      "judson moss bemis house": ["Hearthstone Inn"],
      "stockbridge house": ["Amarillo Motel"],
      "pikes peak bible seminary": ["Burton College"],
      "redstone castle": ["Crawford House"],
      "people's methodist episcopal church": ["Independent Missionary Baptist Church"],
    },
  },
  roofs: { waterTanks: false },
  trees: { street: { spacing: 13, chance: 0.3 } },
  flora: "temperate",
  // the fins of the Garden of the Gods and Red Rock Canyon are red sandstone
  ground: { land: { bare_rock: G.RedRock, rock: G.RedRock } },

  curated: CURATED,
  flights: [],
  search: {
    districtOnly: false,
    bridge: /bridge/i,
    stationSuffix: " station",
    districtRank: 80,
    namedBuildings: {
      minHeight: 20,
      classes: [
        "church",
        "cathedral",
        "chapel",
        "civic",
        "public",
        "government",
        "university",
        "college",
        "library",
      ],
      // an apartment complex's "Building 4", a park's "Chapel"
      skip: /^(Building \d+|Chapel)$/,
    },
  },
};
