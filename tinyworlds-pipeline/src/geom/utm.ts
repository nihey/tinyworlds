/** Lon/lat → UTM metres (WGS 84), the projection the height rasters are stored in. */
const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const RAD = Math.PI / 180;

export const utmZone = (lon: number): number => Math.floor((lon + 180) / 6) + 1;

/** EPSG code of a UTM zone: 326xx north of the equator, 327xx south. */
export const utmEpsg = (zone: number, south: boolean): number => (south ? 32700 : 32600) + zone;

export function toUtm(lon: number, lat: number, zone: number, south: boolean): [number, number] {
  const phi = lat * RAD;
  const lam = lon * RAD;
  const lam0 = ((zone - 1) * 6 - 180 + 3) * RAD;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const n = A / Math.sqrt(1 - E2 * sin * sin);
  const t = tan * tan;
  const c = EP2 * cos * cos;
  const a = (lam - lam0) * cos;
  const m =
    A *
    ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi));
  const x =
    K0 * n * (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120) +
    500000;
  const y =
    K0 *
    (m +
      n *
        tan *
        ((a * a) / 2 +
          ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720));
  return [x, south ? y + 10000000 : y];
}
