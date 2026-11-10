import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { G } from "../scene/kinds.js";
import { PATAGONIA } from "../scene/styles.js";
import { openBuildings } from "../sources/openBuildings.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { CURATED } from "./tinyfte.places.js";
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
        district: f.properties.district ?? "El Calafate",
        polygons: f.polygons,
      })),
  };
}

/**
 * El Calafate, Santa Cruz, Argentina: the town on the south shore of Lago Argentino, with the
 * steppe around it. (The id is its airport's code, FTE.) The glaciers are 80 km to the west and
 * not on the map.
 */
export const tinyfte: City = {
  id: "tinyfte",
  title: "El Calafate",
  // the middle of Avenida del Libertador
  origin: { lon: -72.2648, lat: -50.3379 },
  // the town's loose grid; north ends up to the upper right, the lake with it
  betaDeg: -6.74,
  k: 2,
  bbox: { west: -72.37, south: -50.375, east: -72.17, north: -50.29 },
  start: { lon: -72.2655, lat: -50.3368, scale: 1 },
  maxScale: 3,
  attribution: [
    "© OpenStreetMap contributors",
    "Overture Maps Foundation",
    "Google Open Buildings 2.5D Temporal (CC BY 4.0)",
  ],
  // order matters: the areas and the height raster's tiles are chosen from Overture's data
  sources: [overture, overtureAreas({ hoods: ["neighborhood", "microhood"] }), openBuildings],
  accent: "#b9a2ff",
  // the town between the bay and Laguna Nimez
  card: { lon: -72.2665, lat: -50.3335, shrink: 3 },

  limits: { kind: "built-up" },
  fog: { start: 800, end: 1700 },
  areas,

  // three buildings have a mapped height: the rest come from floors or the satellite raster
  heights: { storey: 3, raster: true },
  style: PATAGONIA,
  landmarks: {},
  statues: [],
  roofs: { waterTanks: false },
  // a windy steppe town: few street trees, mostly poplars by the houses
  trees: { street: { spacing: 16, chance: 0.07 } },
  flora: "temperate",
  // the steppe: shrubland as dry tussock grass, the bare plateau as dirt
  ground: { landCover: { shrub: G.Steppe, barren: G.Construction, crop: G.Steppe } },

  curated: CURATED,
  flights: [],
  search: { districtOnly: false, bridge: /^puente\b/i, stationSuffix: null, districtRank: 80 },
};
