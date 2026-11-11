import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { TEXAS } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { huntHillArch, LANDMARKS, REUNION_BALL } from "./tinydal.landmarks.js";
import { CURATED } from "./tinydal.places.js";
import type { Areas, City } from "./types.js";

/**
 * The outlined areas, by their name in the data. Dallas has few neighbourhoods mapped as areas,
 * but its improvement districts are drawn round the ones people mean (Downtown, Uptown, Deep
 * Ellum); `null` leaves out what is not a neighbourhood at all (the zoo's exhibits) or is there twice.
 */
const HOODS: Record<string, string | null> = {
  "Downtown PID": "Downtown",
  "Uptown PID": "Uptown",
  "Deep Ellum PID": "Deep Ellum",
  "Klyde Warren Park-Arts District PID": "Arts District",
  "Knox Street PID": "Knox Street",
  "Oak Lawn-Hi Line PID": "Oak Lawn–Hi Line",
  "South Dallas-Fair Park PID": "South Dallas–Fair Park",
  "South Side PID": "South Side",
  "University Crossing PID": "University Crossing",
  "Vickery Meadows PID": "Vickery Meadow",
  "Roseland Neighborhood": "Roseland",
  "Lake Highlands PID": null,
  "Roseland Commmunity": null,
  "Briggs-Freeman Plaza": null,
  "Zoo North": null,
  "Lacerte Family Children's Zoo": null,
  "Wilds of Africa": null,
  "Giants of the Savana": null,
};

/** The towns of the map as districts (Dallas, the Park Cities, Irving); the areas above as outlines. */
function areas(rawDir: string): Areas {
  const features = readAreas(path.join(rawDir, "areas.geojson"));
  return {
    districts: features
      .filter((f) => f.properties.kind === "locality")
      .map((f) => ({ name: f.properties.name, polygons: f.polygons })),
    hoods: features
      .filter((f) => f.properties.kind === "hood" && HOODS[f.properties.name] !== null)
      .map((f) => ({
        name: HOODS[f.properties.name] ?? f.properties.name,
        district: f.properties.district ?? "Dallas",
        polygons: f.polygons,
      })),
  };
}

/** The bearing of the grid the view is turned to (see `betaDeg`). */
const BETA = 0.2;

// Love Field's runways run north-west from their south-east ends, from the map data: one kilometre along them
const NW_KM: [number, number] = [-0.00746, 0.006443];
const fromSE = (end: [number, number], km: number, alt: number): [number, number, number] => [
  end[0] + NW_KM[0] * km,
  end[1] + NW_KM[1] * km,
  alt,
];
const RWY_31L: [number, number] = [-96.84344, 32.83405];
const RWY_31R: [number, number] = [-96.83916, 32.84205];

/**
 * Dallas, Texas: downtown and its towers by the Trinity, from Love Field and the Park Cities in
 * the north to Oak Cliff and the zoo in the south, and from the river's west bank to White Rock
 * Lake. (The id is Love Field's code.) Most of the city's streets follow the compass, and so
 * does the view; downtown's and Uptown's grids run across it.
 */
export const tinydal: City = {
  id: "tinydal",
  title: "Dallas",
  // Dealey Plaza, where the city began
  origin: { lon: -96.80857, lat: 32.77852 },
  betaDeg: BETA,
  k: 2,
  bbox: { west: -96.9, south: 32.72, east: -96.7, north: 32.875 },
  // the skyline, Reunion Tower in front of it
  start: { lon: -96.8035, lat: 32.7795, scale: 1 },
  maxScale: 3,
  attribution: ["© OpenStreetMap contributors", "Overture Maps Foundation"],
  // order matters: the areas are cut from Overture's divisions
  sources: [overture, overtureAreas({ hoods: ["neighborhood", "macrohood", "microhood"], maxArea: 0.12 })],
  accent: "#6ee05a",
  card: { lon: -96.806, lat: 32.7795, shrink: 3.6 },

  // the Trinity's floodway runs through the middle of the map between its levees, wide and unbuilt
  limits: {
    kind: "built-up",
    parks: ["Trinity River Floodway", "White Rock Lake Park", "Texas State Fair Grounds"],
  },
  fog: { start: 900, end: 1900 },
  areas,

  // most buildings come with a surveyed height
  heights: { storey: 3.3, raster: false },
  style: TEXAS,
  landmarks: LANDMARKS,
  heightFixes: {
    // mapped as two storeys of a seven-storey hall
    "dallas city hall": 37,
    // no height in the data: approximate figures, so they are not drawn as sheds
    "winspear opera house": 28,
    "american airlines center": 34,
  },
  statues: [REUNION_BALL, huntHillArch(BETA)],
  sights: {
    placeWords: ["Dallas", "Texas", "Big D", "DFW", "North Texas"],
    // the context lines say "Downtown" or "Arts District": a question's area is its town
    areaByDistrict: true,
    // the other names their openings give, which would give them away
    aliases: {
      "texas school book depository": [
        "The Sixth Floor Museum",
        "Sixth Floor Museum",
        "Dallas County Administration Building",
      ],
      "chase tower": ["Dallas Arts Tower"],
      "davis building": ["The Drakestone", "Drakestone"],
      "santander tower": ["Thanksgiving Tower"],
      "1600 pacific tower": ["LTV Tower"],
      "ross tower": ["Lincoln Plaza"],
      "renaissance tower": ["Torre Renacimiento"],
      "cotton bowl": ["Fair Park Stadium"],
    },
    // the articles a nearby title match misses: another name, or too far from the sight's point
    wikipedia: {
      "comerica bank tower": "Comerica Bank Tower",
      "magnolia building": "Magnolia Hotel (Dallas)",
      "winspear opera house": "Winspear Opera House",
      "union station": "Union Station (Dallas)",
      "wyly theatre": "Dee and Charles Wyly Theatre",
      "the merc": "Mercantile National Bank Building",
      "the mansion on turtle creek": "Rosewood Mansion on Turtle Creek",
      "el centro college": "El Centro College",
      "dallas heritage village": "Dallas Heritage Village",
    },
  },
  roofs: { waterTanks: false },
  // no street-tree survey: live oaks and elms along the streets, by rule
  trees: { street: { spacing: 13, chance: 0.3 } },
  flora: "temperate",
  // the floodway is mapped as a reservoir: it is grass between the levees, with the river in it
  ground: { dryWater: ["Trinity River Floodway"] },

  curated: CURATED,
  flights: [
    // landing on the long runway from the south-east, down over Uptown and Oak Lawn
    {
      kind: "plane",
      loop: false,
      speed: 68,
      pause: 40,
      path: [
        fromSE(RWY_31L, -8, 420),
        fromSE(RWY_31L, -3, 160),
        fromSE(RWY_31L, 0.4, 0),
        fromSE(RWY_31L, 2.4, 0),
      ],
    },
    // taking off to the north-west from the other one
    {
      kind: "plane",
      loop: false,
      speed: 72,
      pause: 55,
      path: [
        fromSE(RWY_31R, 0.1, 0),
        fromSE(RWY_31R, 1.9, 0),
        fromSE(RWY_31R, 4.5, 230),
        fromSE(RWY_31R, 10, 720),
      ],
    },
  ],
  search: {
    districtOnly: false,
    bridge: /bridge/i,
    stationSuffix: " station",
    districtRank: 80,
    // towers from twenty storeys, and the churches, halls and campuses people look for
    namedBuildings: {
      minHeight: 60,
      classes: ["church", "civic", "public", "government", "university", "college", "library"],
    },
    skip: /\bPID$|Zoo\b|Savana|Wilds of Africa|Briggs-Freeman|Commmunity|Fort Worth/,
  },
};
