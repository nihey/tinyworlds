import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { Pattern } from "../scene/kinds.js";
import { TEXAS } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { publishedAreas } from "../sources/publishedAreas.js";
import { sectioned } from "./sections.js";
import { CURATED } from "./tinyaus.places.js";
import type { City } from "./types.js";

const NEIGHBORHOODS = "neighborhoods.geojson";
const SECTIONS = {
  Downtown: ["Downtown"],
  "University of Texas": ["University of Texas", "West University", "North University", "Hancock"],
  "East Austin": [
    "Central East Austin",
    "East Cesar Chavez",
    "Holly",
    "Rosewood",
    "Chestnut",
    "Govalle",
    "Mueller",
  ],
  "South Austin": [
    "Barton Hills",
    "Bouldin Creek",
    "Zilker",
    "South River City",
    "South Lamar",
    "Dawson",
    "Galindo",
  ],
  "North Austin": ["Hyde Park", "North Loop", "Brentwood", "Crestview", "North Burnet", "Wooten", "Highland"],
  "West Austin": ["Old West Austin", "Old Enfield", "Windsor Road", "West Austin", "Westover Hills"],
};
const NEIGHBORHOOD_NAMES: Record<string, string> = {
  UT: "University of Texas",
  RMMA: "Mueller",
  "WEST AUSTIN NG": "West Austin",
  MLK: "MLK",
  "MLK-183": "MLK-183",
  LBJ: "LBJ",
};

/** Austin's urban area from Lake Austin to the airport, with the downtown grid along Congress. */
export const tinyaus: City = {
  id: "tinyaus",
  title: "Austin",
  origin: { lon: -97.740349, lat: 30.274663 },
  // Congress Avenue from Cesar Chavez to 11th Street, measured on the local tangent plane.
  gridDeg: 17.9,
  k: 2,
  bbox: { west: -97.96, south: 30.12, east: -97.59, north: 30.48 },
  start: { lon: -97.7445, lat: 30.2668, scale: 0.78 },
  maxScale: 3,
  attribution: ["© OpenStreetMap contributors", "Overture Maps Foundation", "City of Austin Open Data"],
  sources: [
    overture,
    overtureAreas({ maxArea: 0.25 }),
    publishedAreas({
      name: "austin-neighborhoods",
      url: "https://data.austintexas.gov/resource/a7ap-j2yt.geojson?$limit=200",
      file: NEIGHBORHOODS,
    }),
  ],
  accent: "#ef8a48",
  card: { lon: -97.7466, lat: 30.2646, shrink: 3.5 },

  limits: {
    kind: "built-up",
    parks: [
      "Barton Creek Greenbelt",
      "Barton Creek Wilderness Park",
      "Emma Long Metropolitan Park",
      "Mary Moore Searight Metropolitan Park",
      "McKinney Falls State Park",
      "Zilker Metropolitan Park",
    ],
  },
  fog: { start: 900, end: 1850 },
  areas(rawDir) {
    return sectioned({
      neighbourhoods: readAreas(path.join(rawDir, NEIGHBORHOODS)),
      nameOf: ({ properties }) => {
        const name = String(properties.neighname);
        return NEIGHBORHOOD_NAMES[name] ?? name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
      },
      sections: SECTIONS,
      fallback: "Austin",
      towns: readAreas(path.join(rawDir, "areas.geojson")).filter(
        ({ properties }) => properties.kind === "locality" && properties.name !== "Austin",
      ),
      bbox: tinyaus.bbox,
    });
  },

  heights: { storey: 3.4, raster: false, floorsFirst: true },
  style: TEXAS,
  landmarks: {
    "texas state capitol": { wall: R.rose, roof: R.roofSlate, pattern: Pattern.Tall },
    "frost bank tower": { wall: R.glassBlue, roof: R.roofSilver, pattern: Pattern.Curtain },
    "the independent": { wall: R.glassBlue, pattern: Pattern.Curtain },
    "the austonian": { wall: R.glassSilver, pattern: Pattern.Curtain },
    waterline: { wall: R.glassBlue, pattern: Pattern.Curtain },
    "the driskill": { wall: R.brickRed, roof: R.roofSlate, pattern: Pattern.Tall },
    "paramount theatre": { wall: R.tan, pattern: Pattern.Punched },
    "austin central library": { wall: R.limestone, pattern: Pattern.Ribbon },
    "austin city hall": { wall: R.tan, roof: R.roofClay },
    "blanton museum of art": { wall: R.limestone, roof: R.roofClay },
  },
  statues: [
    {
      // Stevie Ray Vaughan on the south shore of Lady Bird Lake.
      lon: -97.750687,
      lat: 30.263095,
      base: 0,
      pieces: [
        { dp: 0, dq: 0, from: 0, to: 0.35, hp: 1.2, hq: 1, ramp: "white" },
        { dp: 0, dq: 0, from: 0.35, to: 1.45, hp: 0.26, hq: 0.35, ramp: "body" },
        { dp: 0, dq: 0, from: 1.45, to: 2.7, hp: 0.32, hq: 0.46, ramp: "body" },
        { dp: 0, dq: 0, from: 2.7, to: 3.05, r: 0.22, ramp: "body" },
        { dp: 0, dq: 0, from: 3.05, to: 3.2, r: 0.37, ramp: "body" },
      ],
    },
  ],
  riverBridges: true,
  boats: [
    {
      name: "Lady Bird Lake cruise",
      path: [
        [-97.7655, 30.269435],
        [-97.7625, 30.268466],
        [-97.7595, 30.267029],
        [-97.7565, 30.265654],
        [-97.7535, 30.264755],
        [-97.7505, 30.26364],
        [-97.7475, 30.262487],
        [-97.7445, 30.261339],
        [-97.743, 30.259395],
        [-97.7415, 30.256015],
        [-97.74, 30.253591],
      ],
    },
  ],
  walk: true,
  sights: {
    placeWords: ["Austin", "Texas", "ATX"],
    areaByDistrict: true,
    aliases: {
      "congress avenue bridge": ["Ann W. Richards Congress Avenue Bridge", "Congress Avenue Bat Bridge"],
      "ut tower": ["Main Building", "University of Texas Tower"],
      "texas memorial stadium": ["Darrell K Royal–Texas Memorial Stadium", "DKR"],
      "pennybacker bridge": ["360 Bridge"],
      "the driskill": ["Driskill Hotel"],
    },
    bridges: {
      "congress avenue bridge": ["Congress Avenue", "South Congress Avenue"],
      "pennybacker bridge": ["North Capital of Texas Highway"],
    },
    wikipedia: {
      "congress avenue bridge": "Ann W. Richards Congress Avenue Bridge",
      "ut tower": "Main Building (University of Texas at Austin)",
      "texas memorial stadium": "Darrell K Royal Memorial Stadium",
      waterline: "Waterline (Austin, Texas)",
      "the driskill": "Driskill Hotel",
      "paramount theatre": "Paramount Theatre (Austin, Texas)",
      "bullock texas state history museum": "Bullock Texas State History Museum",
      "q2 stadium": "Q2 Stadium",
      "stevie ray vaughan statue": "Statue of Stevie Ray Vaughan",
    },
  },
  roofs: { waterTanks: false },
  trees: { street: { spacing: 14, chance: 0.33 } },
  flora: "subtropical",
  ground: {},
  curated: CURATED,
  flights: [
    {
      kind: "helicopter",
      loop: true,
      speed: 39,
      path: [
        [-97.771, 30.2695, 76],
        [-97.757, 30.2648, 76],
        [-97.745, 30.2616, 76],
        [-97.7308, 30.2528, 76],
        [-97.726, 30.255, 76],
        [-97.739, 30.258, 76],
        [-97.758, 30.263, 76],
        [-97.772, 30.265, 76],
      ],
    },
  ],
  search: {
    districtOnly: false,
    bridge: /bridge/i,
    stationSuffix: " station",
    districtRank: 80,
    namedBuildings: {
      minHeight: 48,
      classes: ["church", "civic", "public", "government", "university", "college", "library"],
    },
  },
};
