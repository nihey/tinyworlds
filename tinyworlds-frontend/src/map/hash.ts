/** The shared view, kept in the URL as `#lat,lon,scale`. */
export interface HashView {
  lat: number;
  lon: number;
  /** absent when the link only names a spot */
  scale?: number;
}

export function parseHash(hash: string): HashView | null {
  const raw = hash.replace(/^#/, "").trim();
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => (p.trim() === "" ? NaN : Number(p)));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [lat, lon, scale] = nums;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (scale === undefined) return { lat, lon };
  if (scale <= 0) return null;
  return { lat, lon, scale };
}

export function formatHash(view: { lat: number; lon: number; scale: number }): string {
  return `#${view.lat.toFixed(5)},${view.lon.toFixed(5)},${view.scale.toFixed(2)}`;
}

/**
 * Change the address bar without it counting as navigation. Analytics scripts wrap
 * `history.replaceState` to notice route changes in single-page apps; going through the
 * prototype's method, which they leave alone, keeps them from logging a page view.
 */
export function replaceUrl(url: string): void {
  History.prototype.replaceState.call(window.history, null, "", url);
}

/**
 * Put the view into the address bar. The map's hash changes every time a pan settles, and one
 * visit must not be logged as hundreds of page views: see `replaceUrl`.
 */
export function writeHash(hash: string): void {
  replaceUrl(hash);
}
