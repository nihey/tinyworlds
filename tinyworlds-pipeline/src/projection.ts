/**
 * Lon/lat → metres on a local tangent plane → a 2:1 dimetric ("isometric") map.
 *
 *   east  = (lon − lon0) · π/180 · R · cos(lat0)
 *   north = (lat − lat0) · π/180 · R
 *   p = east·sin β + north·cos β      metres uptown
 *   q = east·cos β − north·sin β      metres crosstown, eastward
 *   X = (p + q) · k
 *   Y = (q − p) · k/2 − h · kz
 *
 * The camera looks along a diagonal of the street grid from 30° above the horizon, so a ground
 * square becomes a 2:1 rhombus and heights scale by cos 30° relative to the true pixel scale
 * (k·√2): kz = k·√1.5.
 */
export const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

export interface Geo {
  lon0: number;
  lat0: number;
  betaDeg: number;
  k: number;
  kz: number;
}

export interface Projection {
  geo: Geo;
  /** Ground position in map px. */
  toMap(lon: number, lat: number): [number, number];
  toLonLat(x: number, y: number): [number, number];
  /** Metres uptown / crosstown-east for a lon/lat. */
  toGrid(lon: number, lat: number): [number, number];
  gridToMap(p: number, q: number): [number, number];
  mapToGrid(x: number, y: number): [number, number];
  /** Height in metres → px the point rises on screen. */
  rise(h: number): number;
  /** Ground metres → map px along a screen row (a line of constant Y). */
  pxPerMetre: number;
  /** Clockwise angle from screen-up to true north, degrees. */
  northDeg: number;
}

export function makeGeo(lon0: number, lat0: number, betaDeg: number, k: number): Geo {
  return { lon0, lat0, betaDeg, k, kz: k * Math.sqrt(1.5) };
}

export function makeProjection(geo: Geo): Projection {
  const { lon0, lat0, betaDeg, k, kz } = geo;
  const mPerLon = RAD * EARTH_RADIUS * Math.cos(lat0 * RAD);
  const mPerLat = RAD * EARTH_RADIUS;
  const sinB = Math.sin(betaDeg * RAD);
  const cosB = Math.cos(betaDeg * RAD);

  const toGrid = (lon: number, lat: number): [number, number] => {
    const east = (lon - lon0) * mPerLon;
    const north = (lat - lat0) * mPerLat;
    return [east * sinB + north * cosB, east * cosB - north * sinB];
  };
  const gridToMap = (p: number, q: number): [number, number] => [(p + q) * k, ((q - p) * k) / 2];
  const mapToGrid = (x: number, y: number): [number, number] => {
    const sum = x / k; // p + q
    const diff = (2 * y) / k; // q − p
    return [(sum - diff) / 2, (sum + diff) / 2];
  };
  const toMap = (lon: number, lat: number): [number, number] => {
    const [p, q] = toGrid(lon, lat);
    return gridToMap(p, q);
  };
  const toLonLat = (x: number, y: number): [number, number] => {
    const [p, q] = mapToGrid(x, y);
    const east = p * sinB + q * cosB;
    const north = p * cosB - q * sinB;
    return [lon0 + east / mPerLon, lat0 + north / mPerLat];
  };
  // north on screen: (p, q) = (cos β, −sin β)
  const nx = cosB - sinB;
  const ny = (-sinB - cosB) / 2;
  const northDeg = (Math.atan2(nx, -ny) * 180) / Math.PI;

  return {
    geo,
    toMap,
    toLonLat,
    toGrid,
    gridToMap,
    mapToGrid,
    rise: (h) => h * kz,
    pxPerMetre: k * Math.SQRT2,
    northDeg,
  };
}
