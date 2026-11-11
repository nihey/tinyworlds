import { G } from "../scene/kinds.js";
import { SOCAL } from "../scene/styles.js";
import { laCounty } from "../sources/laCounty.js";
import { overture } from "../sources/overture.js";
import { laAreas } from "./tinylax.areas.js";
import { LANDMARKS, STATUES } from "./tinylax.landmarks.js";
import { CURATED } from "./tinylax.places.js";
import type { City } from "./types.js";

/** From Pacific Palisades to Boyle Heights, from the studios of Burbank to the runways of LAX. */
const BBOX = { west: -118.53, south: 33.92, east: -118.15, north: 34.165 };

// LAX's four runways run a few degrees off east–west: one kilometre along them, westwards
const WEST_KM: [number, number] = [-0.010472, -0.001071];
/** A point `km` west of a runway's east end (negative: out over Inglewood). */
const fromEast = (end: [number, number], km: number, alt: number): [number, number, number] => [
  end[0] + WEST_KM[0] * km,
  end[1] + WEST_KM[1] * km,
  alt,
];
// the runways' east ends, from the map data: the outer pair lands, the inner pair takes off
const RWY_24R: [number, number] = [-118.40197, 33.95211];
const RWY_24L: [number, number] = [-118.39906, 33.95047];
const RWY_25R: [number, number] = [-118.37979, 33.93988];
const RWY_25L: [number, number] = [-118.38272, 33.93737];

/** News and tour helicopters keep about this high over the city. */
const HELI = 95;

/**
 * Los Angeles: the basin from the beaches to Boyle Heights, with downtown, Hollywood and the
 * hills, the Westside and LAX; not the city limits (which wander) but the whole box, built up.
 * (The id is the airport's code.) The view is turned to the basin's street grid, which follows
 * the compass, so north points up and to the right and downtown's own grid runs across it.
 */
export const tinylax: City = {
  id: "tinylax",
  title: "Los Angeles",
  // City Hall, where the city's street numbers start
  origin: { lon: -118.24276, lat: 34.05368 },
  betaDeg: -0.1,
  k: 2,
  bbox: BBOX,
  // downtown's towers, from the Wilshire Grand to the Disney Concert Hall
  start: { lon: -118.2565, lat: 34.0528, scale: 0.5 },
  maxScale: 3,
  attribution: [
    "© OpenStreetMap contributors",
    "Overture Maps Foundation",
    "Los Angeles County Enterprise GIS (Countywide Statistical Areas)",
  ],
  // the county's areas first: nothing else needs them
  sources: [laCounty, overture],
  accent: "#55aaff",
  // the skyline from Bunker Hill to the Arts District, the tops of the towers in the frame
  card: { lon: -118.2587, lat: 34.0529, shrink: 3.5 },

  // Griffith Park is too big to be built up in the middle, and too much the city's to fade out
  limits: { kind: "built-up", parks: ["Griffith Park"] },
  fog: { start: 900, end: 1900 },
  areas: (rawDir) => laAreas(rawDir, "Los Angeles", BBOX),

  // 98.6% of the buildings come with a surveyed height
  heights: { storey: 3.3, raster: false },
  style: SOCAL,
  landmarks: LANDMARKS,
  heightFixes: {
    // the stands are mapped two metres tall
    "dodger stadium": 26,
    // no height in the data: an approximate figure, so it is not drawn as a shed
    "intuit dome": 30,
  },
  statues: STATUES,
  roofs: { waterTanks: false },
  // no street-tree survey: palms and jacarandas along the streets, by rule
  trees: { street: { spacing: 14, chance: 0.3 } },
  flora: "subtropical",
  // the hills: chaparral, and grass that is gold, not green, most of the year
  ground: { landCover: { barren: G.Steppe, shrub: G.Scrub, grass: G.Steppe } },

  curated: CURATED,
  flights: [
    // landing from the east on the outer runways, over Inglewood
    {
      kind: "plane",
      loop: false,
      speed: 70,
      pause: 35,
      path: [
        fromEast(RWY_25L, -8, 420),
        fromEast(RWY_25L, -3, 160),
        fromEast(RWY_25L, 0.4, 0),
        fromEast(RWY_25L, 2.6, 0),
      ],
    },
    {
      kind: "plane",
      loop: false,
      speed: 70,
      pause: 50,
      path: [
        fromEast(RWY_24R, -9, 470),
        fromEast(RWY_24R, -3, 160),
        fromEast(RWY_24R, 0.4, 0),
        fromEast(RWY_24R, 2.3, 0),
      ],
    },
    // taking off to the west from the inner ones, out over the sea
    {
      kind: "plane",
      loop: false,
      speed: 74,
      pause: 45,
      path: [
        fromEast(RWY_25R, 0.1, 0),
        fromEast(RWY_25R, 2.1, 0),
        fromEast(RWY_25R, 5.2, 230),
        fromEast(RWY_25R, 11, 720),
      ],
    },
    {
      kind: "plane",
      loop: false,
      speed: 74,
      pause: 70,
      path: [
        fromEast(RWY_24L, 0.1, 0),
        fromEast(RWY_24L, 1.9, 0),
        fromEast(RWY_24L, 4.6, 230),
        fromEast(RWY_24L, 10, 720),
      ],
    },
    // a sightseeing loop: down Hollywood Boulevard, up past the sign, the observatory, downtown
    {
      kind: "helicopter",
      loop: true,
      speed: 42,
      path: [
        [-118.345, 34.1015, HELI],
        [-118.3317, 34.1255, HELI],
        [-118.3217, 34.1315, HELI],
        [-118.3005, 34.1165, HELI],
        [-118.2785, 34.0805, HELI],
        [-118.2535, 34.0545, HELI],
        [-118.2655, 34.0465, HELI],
        [-118.3085, 34.0615, HELI],
        [-118.3395, 34.0835, HELI],
      ],
    },
  ],
  search: { districtOnly: false, bridge: /bridge/i, stationSuffix: " station", districtRank: 80 },
};
