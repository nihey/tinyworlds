import path from "node:path";
import { readAreas } from "../geom/geojson.js";
import { R } from "../render/palette.js";
import { G, Pattern } from "../scene/kinds.js";
import { PAULISTA } from "../scene/styles.js";
import { ibgeBairros } from "../sources/ibge.js";
import { openBuildings } from "../sources/openBuildings.js";
import { overture } from "../sources/overture.js";
import { CURATED } from "./tinyrao.places.js";
import type { Areas, City, Polygons } from "./types.js";

/**
 * The city's own planning units, as IBGE has them: a central sector and numbered sub-sectors of
 * the four zones. "Subsetor Leste - 4 (L-4)" becomes "Leste 4" in "Zona Leste".
 */
function areas(rawDir: string): Areas {
  const zones = new Map<string, Polygons>();
  const hoods: Areas["hoods"] = [];
  for (const feature of readAreas(path.join(rawDir, "bairros.geojson"))) {
    const sub = /^Subsetor (\S+) - (\d+)/.exec(feature.properties.name ?? "");
    const name = sub ? `${sub[1]} ${sub[2]}` : "Centro";
    const district = sub ? `Zona ${sub[1]}` : "Centro";
    // in search a sub-sector is a region, under its full name
    const listed = { name: sub ? `Subsetor ${name}` : "Setor Central", type: "borough" as const };
    hoods.push({ name, district, polygons: feature.polygons, listed });
    zones.set(district, [...(zones.get(district) ?? []), ...feature.polygons]);
  }
  return { districts: [...zones].map(([name, polygons]) => ({ name, polygons })), hoods };
}

// the runway of Leite Lopes, south end to north end, and its direction per kilometre
const RUNWAY_SOUTH: [number, number] = [-47.77121, -21.14318];
const PER_KM: [number, number] = [-0.002765, 0.008627];
const along = (km: number, alt: number): [number, number, number] => [
  RUNWAY_SOUTH[0] + PER_KM[0] * km,
  RUNWAY_SOUTH[1] + PER_KM[1] * km,
  alt,
];

/** Ribeirão Preto, São Paulo: the built-up city, turned so the downtown grid runs along the pixels. */
export const tinyrao: City = {
  id: "tinyrao",
  title: "Ribeirão Preto",
  // Praça XV de Novembro
  origin: { lon: -47.80872, lat: -21.17516 },
  // the "quadrilátero central" runs 39° east of north; north ends up 12° right of screen-up
  betaDeg: 38.97,
  k: 2,
  bbox: { west: -47.99, south: -21.37, east: -47.64, north: -21.05 },
  // the Theatro Pedro II and the square in front of it
  start: { lon: -47.8093, lat: -21.1749, scale: 1 },
  maxScale: 3,
  // shown as they are in every interface language
  attribution: [
    "© OpenStreetMap contributors",
    "Overture Maps Foundation",
    "Google Open Buildings 2.5D Temporal (CC BY 4.0)",
    "IBGE, Censo 2022",
  ],
  // order matters: the height raster picks its tiles from Overture's buildings
  sources: [overture, ibgeBairros({ uf: "SP", municipality: "3543402" }), openBuildings],
  accent: "#ff7a3d",
  // the centre: Praça XV, the theatre and the cathedral
  card: { lon: -47.8098, lat: -21.1766, shrink: 2 },

  // the municipality is two thirds cane fields: keep the built-up part of it and its fringe
  limits: { kind: "built-up", division: "Ribeirão Preto" },
  fog: { start: 900, end: 1900 },
  areas,

  // 459 of 360,000 buildings have a mapped height: the rest come from floors or the satellite raster
  heights: { storey: 3, raster: true },
  style: PAULISTA,
  landmarks: {
    "theatro pedro ii": { wall: R.cream, roof: R.roofSlate, pattern: Pattern.Tall },
    "catedral metropolitana de são sebastião": { wall: R.cream, roof: R.roofSlate, pattern: Pattern.Tall },
    "edifício diederichsen": { wall: R.limestone, pattern: Pattern.Punched },
    "centro cultural palace": { wall: R.cream, roof: R.roofClay, pattern: Pattern.Punched },
    "biblioteca sinhá junqueira": { wall: R.sidingYellow, roof: R.roofClay, pattern: Pattern.Tall },
    "mercadão municipal": { wall: R.cream, roof: R.roofSilver, pattern: Pattern.Sparse },
    "prefeitura municipal": { wall: R.sidingYellow, roof: R.roofClay, pattern: Pattern.Tall },
    "basílica de santo antônio de pádua": { wall: R.salmon, roof: R.roofTerracotta, pattern: Pattern.Tall },
    "antiga cervejaria paulista": { wall: R.brickRed, roof: R.roofGravel, pattern: Pattern.Punched },
    "estádio palma travassos": { wall: R.whiteBrick, roof: R.concrete, pattern: Pattern.None },
  },
  statues: [],
  roofs: { waterTanks: false },
  // nobody has surveyed the street trees: they are planted by rule, thinly
  trees: { street: { spacing: 13, chance: 0.2 } },
  flora: "tropical",
  ground: {
    landCover: { crop: G.Crop, barren: G.Earth },
    landUse: {
      farmland: G.Crop,
      farmyard: G.Earth,
      orchard: G.Park,
      quarry: G.Earth,
      construction: G.Earth,
      brownfield: G.Earth,
      greenfield: G.Earth,
    },
    dirtTracks: true,
  },

  curated: CURATED,
  flights: [
    // landing from the south: down a three-degree slope to the numbers, then the rollout
    {
      kind: "plane",
      loop: false,
      speed: 62,
      pause: 70,
      path: [along(-7, 380), along(-3, 160), along(0.3, 0), along(1.7, 0)],
    },
    // taking off to the north
    {
      kind: "plane",
      loop: false,
      speed: 66,
      pause: 95,
      path: [along(0.1, 0), along(1.2, 0), along(4, 190), along(9, 620)],
    },
    // a helicopter keeping an eye on the centre
    {
      kind: "helicopter",
      loop: true,
      speed: 34,
      path: [
        [-47.8087, -21.165, 110],
        [-47.7965, -21.173, 110],
        [-47.7935, -21.196, 110],
        [-47.8045, -21.215, 110],
        [-47.817, -21.212, 110],
        [-47.82, -21.178, 110],
      ],
    },
  ],
  search: { districtOnly: false, bridge: /^(ponte|viaduto|pontilhão)\b/i, stationSuffix: null },
};
