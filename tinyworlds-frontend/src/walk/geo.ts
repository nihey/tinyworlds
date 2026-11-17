import { WalkDataError } from "./format";

/** A square's side, metres. */
export const CELL = 200;

const R = 6371008.8;
const RAD = Math.PI / 180;

export interface WalkGeo {
  lon0: number;
  lat0: number;
  betaDeg: number;
  k: number;
  kz: number;
}

/** Metres east and north of the projection origin. */
export function lonLatToEN(geo: WalkGeo, lon: number, lat: number): [number, number] {
  return [(lon - geo.lon0) * RAD * R * Math.cos(geo.lat0 * RAD), (lat - geo.lat0) * RAD * R];
}

export function enToLonLat(geo: WalkGeo, e: number, n: number): [number, number] {
  return [geo.lon0 + e / (RAD * R * Math.cos(geo.lat0 * RAD)), geo.lat0 + n / (RAD * R)];
}

/** The square (i, j) a point lies in: e in [200i, 200i + 200), n in [200j, 200j + 200). */
export function cellOf(e: number, n: number): [number, number] {
  if (!Number.isFinite(e) || !Number.isFinite(n)) throw new WalkDataError("cellOf: not a position");
  return [Math.floor(e / CELL), Math.floor(n / CELL)];
}
