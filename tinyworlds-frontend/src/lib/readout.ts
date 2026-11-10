import type { Strings } from "@/i18n";

/**
 * The corner readout: where the middle of the view is, and how far in. A place that does not
 * exist has no latitude or longitude worth showing (its map is laid out around an arbitrary
 * point), so there only the zoom is left.
 */
export function viewReadout(
  lat: number,
  lon: number,
  scale: number,
  c: Strings["credit"],
  fictional = false,
): string {
  const fixed = (value: number, digits: number) => value.toFixed(digits).replace(".", c.decimal);
  const zoom = scale >= 1 ? `${fixed(scale, 1)}×` : `${Math.round(scale * 100)}%`;
  if (fictional) return zoom;
  const ns = lat >= 0 ? c.north : c.south;
  const ew = lon >= 0 ? c.east : c.west;
  return `${fixed(Math.abs(lat), 4)}° ${ns}  ${fixed(Math.abs(lon), 4)}° ${ew}  ·  ${zoom}`;
}
