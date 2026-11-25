import type { Bounds } from "./manifest";

/**
 * How far out the view may go. A world can set `minZoom`: a share of the scale at which the
 * map's bounds fill the view edge to edge (1 keeps the map filling the screen, above 1 stops
 * closer in, below 1 lets some paper show). Without it, the whole map fits with room to spare.
 */

/** Without a minZoom: the whole map fits, at this share of the fitting scale. */
export const FIT_SHARE = 0.6;

/** The furthest-out scale for a view of width × height CSS px. */
export function minScaleFor(
  width: number,
  height: number,
  bounds: Bounds,
  maxScale: number,
  minZoom?: number,
): number {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  if (minZoom === undefined || !Number.isFinite(minZoom) || minZoom <= 0) {
    return Math.min(Math.min(width / w, height / h) * FIT_SHARE, maxScale, 1);
  }
  return Math.min(Math.max(width / w, height / h) * minZoom, maxScale);
}

/**
 * A view centre along one axis, kept so the view (half of it `half` map px) stays inside lo–hi;
 * a view wider than that range is centred on it.
 */
export function clampCentre(centre: number, half: number, lo: number, hi: number): number {
  if (half * 2 >= hi - lo) return (lo + hi) / 2;
  return Math.min(hi - half, Math.max(lo + half, centre));
}
