import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { G, Pattern } from "../scene/kinds.js";
import { MEDITERRANEAN } from "../scene/styles.js";
import { overture } from "../sources/overture.js";
import { overtureAreas } from "../sources/overtureAreas.js";
import { CURATED } from "./tinyvlc.places.js";
import type { Areas, City } from "./types.js";

/** The city's nineteen districts and the towns around it; its barrios as outlines. */
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
        district: f.properties.district ?? "València",
        polygons: f.polygons,
      })),
  };
}

// the airport's runway, south-east end to north-west end, and its direction per kilometre
const RUNWAY_SE: [number, number] = [-0.4697, 39.48477];
const PER_KM: [number, number] = [-0.009343, 0.003562];
const along = (km: number, alt: number): [number, number, number] => [
  RUNWAY_SE[0] + PER_KM[0] * km,
  RUNWAY_SE[1] + PER_KM[1] * km,
  alt,
];

/**
 * Valencia, Spain: the city and the towns grown into it, from the airport at Manises to the port
 * and the beaches, turned so the Eixample's grid runs along the pixels (the sea ends up on the
 * right).
 */
export const tinyvlc: City = {
  id: "tinyvlc",
  title: "València",
  // Plaça de l'Ajuntament
  origin: { lon: -0.37643, lat: 39.47019 },
  betaDeg: 61.58,
  k: 2,
  bbox: { west: -0.515, south: 39.4, east: -0.29, north: 39.53 },
  start: { lon: -0.3762, lat: 39.4722, scale: 1 },
  maxScale: 3,
  attribution: ["© OpenStreetMap contributors", "Overture Maps Foundation"],
  // order matters: the areas are cut from Overture's divisions
  sources: [
    overture,
    overtureAreas({
      // the city's districts are "macrohoods" in the data; the city itself and the comarques are left out
      districts: ["macrohood", "locality"],
      hoods: ["neighborhood"],
      skip: /^(València|Comarca de València|l'Horta (Nord|Sud)|el Camp de Túria|la Ribera Alta)$/,
    }),
  ],
  accent: "#ffa62b",
  // the City of Arts and Sciences in the old riverbed
  card: { lon: -0.3532, lat: 39.4562, shrink: 2 },

  limits: { kind: "built-up" },
  fog: { start: 900, end: 1900 },
  areas,

  // seven buildings in ten have their number of floors on record; few have a height
  heights: { storey: 3.1, raster: false },
  style: MEDITERRANEAN,
  landmarks: {
    "palau de les arts reina sofia": {
      wall: R.whiteBrick,
      roof: R.whiteBrick,
      pattern: Pattern.None,
      dome: 0.45,
    },
    "l'hemisfèric": { wall: R.whiteBrick, roof: R.glassSilver, pattern: Pattern.None, dome: 0.8 },
    "museu de les ciències «príncep felip»": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Tall },
    ágora: { wall: R.glassBlue, roof: R.glassBlue, pattern: Pattern.None, dome: 0.6 },
    "l'umbracle": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.None },
    "mercat central": { wall: R.cream, roof: R.roofSilver, pattern: Pattern.Tall, dome: 0.25 },
    "catedral de valència": { wall: R.tan, roof: R.roofTerracotta, pattern: Pattern.Tall },
    "llotja de la seda": { wall: R.tan, roof: R.roofTerracotta, pattern: Pattern.Tall },
    "estació del nord": { wall: R.cream, roof: R.roofSilver, pattern: Pattern.Tall },
    "mercat de colón": { wall: R.brickRed, roof: R.roofSilver, pattern: Pattern.Tall },
    "torres de quart": { wall: R.tan, roof: R.tan, pattern: Pattern.None },
    "veles e vents": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Ribbon },
    "roig arena": { wall: R.glassSilver, roof: R.roofWhite, pattern: Pattern.None, dome: 0.2 },
  },
  // landmarks the data gives neither a height nor floors for: approximate published figures, so
  // they are not drawn as ten-metre sheds
  heightFixes: {
    "palau de les arts reina sofia": 75,
    "museu de les ciències «príncep felip»": 40,
    "l'hemisfèric": 26,
    "l'umbracle": 18,
    "mercat central": 22,
    "nou mestalla": 45,
    "roig arena": 30,
    "veles e vents": 25,
    "palau de congressos": 18,
    "palau de la música": 20,
    "mercat de colón": 16,
    "llotja de la seda": 17,
    "valencia - terminal 1": 14,
  },
  statues: [],
  roofs: { waterTanks: false },
  // the city's street trees are in the map data, one by one
  trees: {},
  flora: "subtropical",
  // l'Horta: market gardens right up to the city's edge
  ground: { landCover: { crop: G.Crop }, landUse: { farmland: G.Crop, orchard: G.Park } },

  curated: CURATED,
  flights: [
    // landing from over the city onto the runway at Manises
    {
      kind: "plane",
      loop: false,
      speed: 68,
      pause: 55,
      path: [along(-8, 420), along(-3, 160), along(0.3, 0), along(2.2, 0)],
    },
    // taking off towards the sea
    {
      kind: "plane",
      loop: false,
      speed: 72,
      pause: 80,
      path: [along(3.15, 0), along(1.6, 0), along(-1.3, 220), along(-6.8, 700)],
    },
  ],
  search: { districtOnly: false, bridge: /^(pont|puente)\b/i, stationSuffix: "", districtRank: 80 },
};
