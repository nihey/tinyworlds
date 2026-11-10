import type { Geo } from "./manifest";

const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

export interface MapPoint {
  x: number;
  y: number;
}

export interface GeoPoint {
  lon: number;
  lat: number;
}

export interface Projection {
  /** lon/lat on the ground (h = 0) → map px at native resolution */
  toMap(lon: number, lat: number): MapPoint;
  /** map px → lon/lat, assuming the point is on the ground */
  toGeo(x: number, y: number): GeoPoint;
}

/**
 * The pipeline's projection, at ground level:
 *
 *   east  = (lon − lon0)·π/180·R·cos(lat0)       north = (lat − lat0)·π/180·R
 *   p = east·sin β + north·cos β                  metres uptown, along the avenues
 *   q = east·cos β − north·sin β                  metres crosstown, eastward
 *   X = (p + q)·k                                  Y = (q − p)·k/2
 *
 * The (east, north) → (p, q) matrix is a reflection, so it is its own inverse.
 */
export function createProjection(geo: Geo): Projection {
  const sin = Math.sin(geo.betaDeg * RAD);
  const cos = Math.cos(geo.betaDeg * RAD);
  const mPerLon = RAD * EARTH_RADIUS * Math.cos(geo.lat0 * RAD);
  const mPerLat = RAD * EARTH_RADIUS;
  const { k, lon0, lat0 } = geo;

  return {
    toMap(lon, lat) {
      const east = (lon - lon0) * mPerLon;
      const north = (lat - lat0) * mPerLat;
      const p = east * sin + north * cos;
      const q = east * cos - north * sin;
      return { x: (p + q) * k, y: ((q - p) * k) / 2 };
    },
    toGeo(x, y) {
      const sum = x / k; // p + q
      const diff = (2 * y) / k; // q − p
      const p = (sum - diff) / 2;
      const q = (sum + diff) / 2;
      const east = p * sin + q * cos;
      const north = p * cos - q * sin;
      return { lon: lon0 + east / mPerLon, lat: lat0 + north / mPerLat };
    },
  };
}
