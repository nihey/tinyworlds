import type { City } from "./types.js";

/**
 * The view's bearing that puts true north straight up: the grid's diagonal then runs north, so
 * east is to the right and north up the screen (`manifest.northDeg` 0).
 */
export const NORTH_UP_DEG = 45;

/** The bearing the map is turned to (the projection's β): north up unless the city asks for its grid. */
export function viewDeg(city: Pick<City, "gridDeg" | "view">): number {
  return city.view === "grid" ? city.gridDeg : NORTH_UP_DEG;
}
