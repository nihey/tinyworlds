import type { Hood } from "./manifest";
import type { Projection } from "./projection";

/** A neighbourhood projected into map px, ready to draw and hit-test. */
export interface HoodShape {
  name: string;
  borough: string;
  /** label anchor */
  cx: number;
  cy: number;
  /** flat [x0, y0, x1, y1, ...] per ring */
  rings: Float64Array[];
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Largest first, so big hoods claim their labels before small ones. */
export function buildHoodShapes(hoods: Hood[], projection: Projection): HoodShape[] {
  const shapes: HoodShape[] = [];
  for (const hood of hoods) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const rings: Float64Array[] = [];
    for (const ring of hood.rings) {
      const n = ring.length >> 1;
      if (n < 3) continue;
      const out = new Float64Array(n * 2);
      for (let i = 0; i < n; i++) {
        const p = projection.toMap(ring[i * 2], ring[i * 2 + 1]);
        out[i * 2] = p.x;
        out[i * 2 + 1] = p.y;
        if (p.x < left) left = p.x;
        if (p.x > right) right = p.x;
        if (p.y < top) top = p.y;
        if (p.y > bottom) bottom = p.y;
      }
      rings.push(out);
    }
    if (rings.length === 0) continue;
    const c = projection.toMap(hood.lon, hood.lat);
    shapes.push({
      name: hood.name,
      borough: hood.borough,
      cx: c.x,
      cy: c.y,
      rings,
      left,
      top,
      right,
      bottom,
    });
  }
  const area = (s: HoodShape) => (s.right - s.left) * (s.bottom - s.top);
  return shapes.sort((a, b) => area(b) - area(a));
}

/** Even-odd test over all rings, so holes and multi-part hoods both work. */
export function pointInRings(rings: Float64Array[], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length >> 1;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i * 2];
      const yi = ring[i * 2 + 1];
      const xj = ring[j * 2];
      const yj = ring[j * 2 + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Index of the hood under a map-px point, or -1. Where hoods overlap, the smallest wins. */
export function hoodAt(shapes: HoodShape[], x: number, y: number): number {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (x < s.left || x > s.right || y < s.top || y > s.bottom) continue;
    if (pointInRings(s.rings, x, y)) return i;
  }
  return -1;
}
