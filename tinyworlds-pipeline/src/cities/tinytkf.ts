import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { SIERRA } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { CURATED } from "./tinytkf.places.js";
import type { Areas, City, Statue } from "./types.js";

/** The town as a district; Overture has no neighbourhood outlines here. */
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
        district: f.properties.district ?? "Truckee",
        polygons: f.polygons,
      })),
  };
}

// runway 11/29, from the map data: its north-western end, and one kilometre along it to the south-east
const RWY_11_NW: [number, number] = [-120.153212, 39.3250465];
const RWY_11_KM: [number, number] = [0.010058, -0.004511];
const along = (d: number, alt: number): [number, number, number] => [
  RWY_11_NW[0] + RWY_11_KM[0] * d,
  RWY_11_NW[1] + RWY_11_KM[1] * d,
  alt,
];
// runway 29's threshold is the far end, 2.2 km along
const RWY_LENGTH = 2.22;

/**
 * The Pioneer Monument (1918), at OpenStreetMap's node for it: a base of 20 by 21 feet, a
 * cobblestone pedestal 22 feet high (the depth of the snow in the winter of 1846–47) and a
 * bronze pioneer family 17.5 feet tall on top, as Wikipedia's article on the park gives them.
 */
const PIONEER_MONUMENT: Statue = {
  lon: -120.23104,
  lat: 39.32383,
  base: 0,
  pieces: [
    { dp: 0, dq: 0, from: 0, to: 1, hp: 3.1, hq: 3.2, ramp: "white" },
    { dp: 0, dq: 0, from: 1, to: 5.8, hp: 1.9, hq: 1.9, ramp: "white" },
    { dp: 0, dq: 0, from: 5.8, to: 6.7, hp: 2.2, hq: 2.2, ramp: "white" },
    { dp: 0, dq: 0, from: 6.7, to: 9.6, r: 1.2, ramp: "body" },
    { dp: 0, dq: 0, from: 9.6, to: 11.1, r: 0.7, ramp: "body" },
    { dp: 0, dq: 0, from: 11.1, to: 12, r: 0.4, ramp: "body" },
  ],
};

/**
 * Truckee, California: the old railroad and lumber town on the Truckee River, its Commercial Row
 * facing the depot across the tracks; Donner Lake and the state park to the west; Tahoe Donner
 * in the hills to the north-west, Glenshire to the east, and the airport out in Martis Valley.
 * (The id is the airport's code, TKF.) The view is turned to downtown's grid, which follows the
 * railroad, and looks north across the river at Commercial Row.
 */
export const tinytkf: City = {
  id: "tinytkf",
  title: "Truckee",
  // the town's point in Overture's divisions: Commercial Row
  origin: { lon: -120.18358, lat: 39.32795 },
  betaDeg: 71.1,
  k: 2,
  bbox: { west: -120.32, south: 39.295, east: -120.07, north: 39.39 },
  start: { lon: -120.1855, lat: 39.3275, scale: 1 },
  maxScale: 3,
  attribution: ["© OpenStreetMap contributors", "Overture Maps Foundation", "Microsoft ML Buildings"],
  // order matters: the areas are cut from Overture's divisions
  sources: [overture, overtureAreas()],
  accent: "#45d993",
  card: { lon: -120.1843, lat: 39.3281, shrink: 2.2 },

  limits: { kind: "built-up" },
  fog: { start: 900, end: 1900 },
  areas,

  // nearly nine footprints in ten come with a height, every one of them estimated from imagery
  // (Microsoft's machine-learned buildings): none is surveyed
  heights: { storey: 3.3, raster: false },
  style: SIERRA,
  landmarks: {},
  statues: [PIONEER_MONUMENT],
  roofs: { waterTanks: false },
  // pines along some streets, by rule; the forest round the houses is the land cover's
  trees: { street: { spacing: 14, chance: 0.25 } },
  flora: "montane",
  ground: {},

  sights: {
    placeWords: ["Truckee", "California", "Nevada County", "Sierra Nevada", "Lake Tahoe", "Tahoe"],
    // the articles a title match misses: the data's names are not the articles' titles
    wikipedia: {
      "truckee veterans memorial building": "Truckee Veterans Memorial Building and Rocking Stone Tower",
      "rocking stone tower": "Truckee Veterans Memorial Building and Rocking Stone Tower",
      "veterans hall": "Truckee Veterans Memorial Building and Rocking Stone Tower",
      "kruger house": "Kruger House (Truckee, California)",
      "truckee train depot": "Truckee station",
      "pioneer monument": "Donner Memorial State Park",
      "donner memorial state park visitor center": "Donner Memorial State Park",
    },
  },

  curated: CURATED,
  flights: [
    // a light plane landing on runway 29, in from Martis Valley
    {
      kind: "plane",
      loop: false,
      speed: 45,
      pause: 45,
      path: [
        along(RWY_LENGTH + 6, 380),
        along(RWY_LENGTH + 2.5, 150),
        along(RWY_LENGTH - 0.3, 0),
        along(RWY_LENGTH - 1.3, 0),
      ],
    },
    // and one taking off from it towards town
    {
      kind: "plane",
      loop: false,
      speed: 48,
      pause: 70,
      path: [along(RWY_LENGTH - 0.1, 0), along(RWY_LENGTH - 1.2, 0), along(-0.6, 160), along(-5, 600)],
    },
    // an air ambulance from the airport's apron to the hospital's heliport
    {
      kind: "helicopter",
      loop: false,
      speed: 45,
      pause: 90,
      path: [
        [-120.143, 39.3192, 0],
        [-120.1475, 39.3215, 120],
        [-120.195, 39.3243, 150],
        [-120.20027, 39.32414, 0],
      ],
    },
  ],
  search: {
    districtOnly: false,
    bridge: /bridge/i,
    stationSuffix: " station",
    districtRank: 80,
    // a town of one- and two-storey buildings, with estimated heights: from 5 m (Jax on the Tracks,
    // the recreation center, the clubhouses), and the civic classes; the old jail (4.5 m), the
    // Rex Hotel and the Kruger House are curated. From 4 m it would add a gas station, two auto
    // shops, a tow yard and the hospital's administration block
    namedBuildings: {
      minHeight: 5,
      classes: [
        "church",
        "civic",
        "public",
        "government",
        "school",
        "college",
        "university",
        "library",
        "hospital",
        "post_office",
      ],
    },
  },
};
