/**
 * The walk's world space: metres east (e) and north (n) of the projection origin, heights in
 * metres above the land. The land is cut into squares of CELL metres: square (i, j) covers
 * e in [200i, 200i + 200), n in [200j, 200j + 200).
 */
import { EARTH_RADIUS } from "../projection.js";
import type { Geo } from "../projection.js";

export type { Geo };

export const CELL = 200;

const RAD = Math.PI / 180;

export function lonLatToEN(geo: Geo, lon: number, lat: number): [number, number] {
  return [
    (lon - geo.lon0) * RAD * EARTH_RADIUS * Math.cos(geo.lat0 * RAD),
    (lat - geo.lat0) * RAD * EARTH_RADIUS,
  ];
}

/** Map px at ground level (the projection's inverse): p + q = X/k, q - p = 2Y/k. */
export function mapToEN(geo: Geo, X: number, Y: number): [number, number] {
  const sum = X / geo.k;
  const diff = (2 * Y) / geo.k;
  const p = (sum - diff) / 2;
  const q = (sum + diff) / 2;
  const b = geo.betaDeg * RAD;
  return [p * Math.sin(b) + q * Math.cos(b), p * Math.cos(b) - q * Math.sin(b)];
}

export function cellOf(e: number, n: number): [number, number] {
  return [Math.floor(e / CELL), Math.floor(n / CELL)];
}

export function cellKey(i: number, j: number): string {
  return `${i}_${j}`;
}
