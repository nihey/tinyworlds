import { createRequire } from "node:module";
import type { Pair, Polygon } from "polygon-clipping";

const clipping = createRequire(import.meta.url)("polygon-clipping") as typeof import("polygon-clipping");

const SPRING = 50;
const CENTRE_HALF = 2.2;
const OUTER_JAMB = 16;
const ARCH_BANDS = 12;

/** The prism layers of one Brooklyn Bridge tower, in grid metres. The original footprint
 * gives each layer its buttresses and depth. The cutouts line up with the bridge axis. */
export function brooklynArchVolumes(
  ring: number[],
  [up, uq]: readonly [number, number],
  height: number,
  foot: number,
): { ring: number[]; base: number; top: number }[] {
  const local: Pair[] = [];
  let low = Infinity;
  let high = -Infinity;
  let near = Infinity;
  let far = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    const p = ring[i];
    const q = ring[i + 1];
    const across = q * up - p * uq;
    const along = p * up + q * uq;
    local.push([across, along]);
    low = Math.min(low, across);
    high = Math.max(high, across);
    near = Math.min(near, along);
    far = Math.max(far, along);
  }

  const centre = (low + high) / 2;
  const middleDepth = (near + far) / 2;
  /** The entrances flare past the inner throat of the opening where the buttresses project. */
  const aperture = (side: number, inner: number, outer: number): Polygon => {
    const narrow = Math.max(0.6, inner - 1.8);
    const wide = outer + 4.6;
    const throatNear = middleDepth - 1.8;
    const throatFar = middleDepth + 1.8;
    const profile = [
      [narrow, near - 1],
      [wide, near - 1],
      [outer, throatNear],
      [outer, throatFar],
      [wide, far + 1],
      [narrow, far + 1],
      [inner, throatFar],
      [inner, throatNear],
    ];
    return [profile.map(([cross, depth]) => [centre + side * cross, depth])];
  };

  const pieces = foot > 0 ? [{ ring, base: 0, top: foot }] : [];
  const band = (base: number, top: number, inner: number, outer: number) => {
    for (const [outline] of clipping.difference(
      [local],
      aperture(-1, inner, outer),
      aperture(1, inner, outer),
    )) {
      const grid: number[] = [];
      for (const [across, along] of outline.slice(0, -1)) {
        grid.push(along * up - across * uq, along * uq + across * up);
      }
      pieces.push({ ring: grid, base, top });
    }
  };

  band(foot, SPRING, CENTRE_HALF, OUTER_JAMB);
  const width = OUTER_JAMB - CENTRE_HALF;
  const middle = (OUTER_JAMB + CENTRE_HALF) / 2;
  const rise = (width * Math.sqrt(3)) / 2;
  const step = rise / ARCH_BANDS;
  for (let i = 0; i < ARCH_BANDS; i++) {
    // Two circular arcs centred at the opposite jambs meet at the crown.
    const half = Math.sqrt(width ** 2 - ((i + 0.5) * step) ** 2) - width / 2;
    band(SPRING + i * step, SPRING + (i + 1) * step, middle - half, middle + half);
  }
  pieces.push({ ring, base: SPRING + rise, top: height });
  return pieces;
}
