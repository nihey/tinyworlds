import { EARTH_RADIUS } from "../projection.js";
import { NEW_YORK } from "../scene/styles.js";
import type { SyntheticBuilder } from "../scene/synthetic.js";
import type { City } from "./types.js";

/**
 * A city that exists on no map (see `City.synthetic`). Its coordinates mean nothing, so it sits
 * at longitude 0, latitude 0 with its grid along the compass: one metre of `p` is a metre north,
 * one of `q` a metre east, and everything the pipeline needs in lon/lat is derived from that.
 */
const RAD = Math.PI / 180;

/**
 * Lon/lat of a point given in the generator's metres. `betaDeg` is the bearing of the grid's `p`
 * axis: 0 for a place laid out along the compass, 45 for a world drawn with north up (see
 * `scene/worldkit.ts`).
 */
export function lonLatOf(p: number, q: number, betaDeg = 0): { lon: number; lat: number } {
  const sin = Math.sin(betaDeg * RAD);
  const cos = Math.cos(betaDeg * RAD);
  return { lon: (p * sin + q * cos) / (RAD * EARTH_RADIUS), lat: (p * cos - q * sin) / (RAD * EARTH_RADIUS) };
}

export interface GeneratedCity {
  id: string;
  title: string;
  accent: string;
  /** Opening view and share card, in the generator's metres. */
  start: { p: number; q: number; scale: number };
  card: { p: number; q: number; shrink: number };
  /** Metres from the generator's limits at which the map starts to dissolve, and where it is gone. */
  fog: { start: number; end: number };
  flora: City["flora"];
  attribution: string[];
  /** Bearing of the grid's `p` axis (default 0: `p` is north). 45 puts compass north straight up. */
  betaDeg?: number;
  /** End the map at the bounding rectangle of its limits, with a clean edge and no dissolve. */
  framed?: boolean;
  generate: (builder: SyntheticBuilder) => void;
}

/** Fill in everything a `City` must have that a generated one never uses. */
export function generatedCity(spec: GeneratedCity): City {
  const betaDeg = spec.betaDeg ?? 0;
  return {
    id: spec.id,
    title: spec.title,
    origin: { lon: 0, lat: 0 },
    betaDeg,
    k: 2,
    bbox: { west: -0.1, south: -0.1, east: 0.1, north: 0.1 },
    start: { ...lonLatOf(spec.start.p, spec.start.q, betaDeg), scale: spec.start.scale },
    maxScale: 3,
    attribution: spec.attribution,
    sources: [],
    accent: spec.accent,
    card: { ...lonLatOf(spec.card.p, spec.card.q, betaDeg), shrink: spec.card.shrink },
    synthetic: spec.generate,
    framed: spec.framed,
    fog: spec.fog,
    flora: spec.flora,
    flights: [],
    // never consulted for a generated city
    limits: { kind: "built-up" },
    areas: () => ({ districts: [], hoods: [] }),
    heights: { storey: 3, raster: false },
    style: NEW_YORK,
    landmarks: {},
    statues: [],
    roofs: { waterTanks: false },
    trees: {},
    ground: {},
    curated: [],
    search: { districtOnly: false, bridge: /bridge/i, stationSuffix: null },
  };
}
