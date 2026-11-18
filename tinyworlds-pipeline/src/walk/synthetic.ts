import { G, isWater, PAINT_RANK } from "../scene/kinds.js";
import { insideRing, ribbon } from "../scene/medieval.js";
import type { Arr } from "../scene/store.js";
import { nearestOnPath } from "../scene/worldkit.js";
import type { Box } from "./clip.js";
import { mapToEN, type Geo } from "./grid.js";
import type { DeckAt } from "./heights.js";
import type { Segment } from "./segments.js";

type Point = [e: number, n: number];
type Surface = "land" | "deck" | "water" | "blocked";

const CLASS: Partial<Record<G, string>> = {
  [G.Highway]: "primary",
  [G.RoadMajor]: "secondary",
  [G.Road]: "residential",
  [G.Service]: "unclassified",
  [G.DirtRoad]: "unclassified",
  [G.Cobble]: "pedestrian",
  [G.Path]: "footway",
  [G.Pier]: "footway",
  [G.Rail]: "rail",
};
const EPS = 1e-6;
const MIN_LENGTH = 0.5; // the smallest piece accepted by the walk network
const SAMPLE_STEP = 2; // the resolution of the walk's land mask
const MAX_ABUTMENT = 15; // close small gaps left by the roughened shore at a drawn bridge
const BUILDING_CLEARANCE = 1; // leave room for the walker at the clipped end of a sidewalk

/** These are the only polygons that can change the shore of a generated map. */
export const definesSyntheticShore = (kind: number): boolean =>
  kind === G.Land || kind === G.Pier || isWater(kind);

interface Span {
  a: Point;
  de: number;
  dn: number;
  length: number;
  width: number;
  cls: string;
  cuts: number[];
}

interface Section {
  span: Span;
  start: number;
  end: number;
  surface: Surface;
}

const at = (s: Span, t: number): Point => [s.a[0] + s.de * t, s.a[1] + s.dn * t];
const cross = (ae: number, an: number, be: number, bn: number): number => ae * bn - an * be;

/** Record junctions on both streets, including endpoints of overlapping centerlines. */
function intersect(a: Span, b: Span): void {
  const de = b.a[0] - a.a[0];
  const dn = b.a[1] - a.a[1];
  const det = cross(a.de, a.dn, b.de, b.dn);
  const inSpan = (t: number): boolean => t >= -EPS && t <= 1 + EPS;
  const cut = (s: Span, t: number): void => {
    if (t > EPS && t < 1 - EPS) s.cuts.push(t);
  };
  if (Math.abs(det) > EPS * a.length * b.length) {
    const t = cross(de, dn, b.de, b.dn) / det;
    const u = cross(de, dn, a.de, a.dn) / det;
    if (inSpan(t) && inSpan(u)) {
      cut(a, t);
      cut(b, u);
    }
    return;
  }
  if (Math.abs(cross(de, dn, a.de, a.dn)) > EPS * a.length) return;
  const project = (e: number, n: number, s: Span) => (e * s.de + n * s.dn) / s.length ** 2;
  cut(a, project(de, dn, a));
  cut(a, project(de + b.de, dn + b.dn, a));
  cut(b, project(-de, -dn, b));
  cut(b, project(a.de - de, a.dn - dn, b));
}

/** Bisect changes of surface so a ramp meets its deck and a waterfront road ends at the shore. */
function cutSurfaces(s: Span, surface: (point: Point) => Surface): void {
  const samples = Math.ceil(s.length / SAMPLE_STEP);
  let previous = surface(s.a);
  for (let i = 1; i <= samples; i++) {
    const next = surface(at(s, i / samples));
    if (previous !== next) {
      let lo = (i - 1) / samples;
      let hi = i / samples;
      for (let j = 0; j < 8; j++) {
        const mid = (lo + hi) / 2;
        if (surface(at(s, mid)) === previous) lo = mid;
        else hi = mid;
      }
      s.cuts.push((lo + hi) / 2);
    }
    previous = next;
  }
}

function sectionsOf(spans: Span[], surface: (point: Point) => Surface): Section[] {
  const sections: Section[] = [];
  for (const span of spans) {
    span.cuts.sort((a, b) => a - b);
    let from = 0;
    for (const end of span.cuts) {
      if ((end - from) * span.length < MIN_LENGTH) continue;
      sections.push({ span, start: from, end, surface: surface(at(span, (from + end) / 2)) });
      from = end;
    }
  }

  for (let i = 0; i < sections.length; i++) {
    if (sections[i].surface !== "water") continue;
    let end = i;
    let length = 0;
    while (sections[end]?.surface === "water") {
      const part = sections[end++];
      length += (part.end - part.start) * part.span.length;
    }
    const before = sections[i - 1]?.surface;
    const after = sections[end]?.surface;
    if (
      (before === "deck" || before === "land") &&
      (after === "deck" || after === "land") &&
      (before === "deck" || after === "deck") &&
      length <= MAX_ABUTMENT
    )
      for (let j = i; j < end; j++) sections[j].surface = "deck";
    i = end - 1;
  }
  return sections.filter((section) => section.surface === "land" || section.surface === "deck");
}

/** Reconstruct the walk graph from the saved generated scene. No external street data is needed. */
export function syntheticNetwork(
  arrays: Record<string, Arr>,
  geo: Geo,
  deckAt: DeckAt,
): { segments: Segment[]; piers: number[][] } {
  const read = (xy: Arr, first: number, end: number): number[] => {
    const points = [];
    for (let v = first; v < end; v++) points.push(...mapToEN(geo, xy[v * 2], xy[v * 2 + 1]));
    return points;
  };
  const ringsOf = (prefix: "ground" | "vol", index: number): number[][] => {
    const ringStart = arrays[`${prefix}.ringStart`];
    const vertStart = arrays[`${prefix}.vertStart`];
    const rings = [];
    for (let ring = ringStart[index]; ring < ringStart[index + 1]; ring++)
      rings.push(read(arrays[`${prefix}.xy`], vertStart[ring], vertStart[ring + 1]));
    return rings;
  };
  const paths: Span[][] = [];
  const piers: number[][] = [];
  const addPath = (pts: number[], width: number, cls: string): void => {
    const spans: Span[] = [];
    for (let i = 2; i < pts.length; i += 2) {
      const a: Point = [pts[i - 2], pts[i - 1]];
      const de = pts[i] - a[0];
      const dn = pts[i + 1] - a[1];
      const length = Math.hypot(de, dn);
      if (length >= MIN_LENGTH) spans.push({ a, de, dn, length, width, cls, cuts: [0, 1] });
    }
    if (spans.length) paths.push(spans);
  };
  const lineStart = arrays["lines.vertStart"];
  const lineXY = arrays["lines.xy"];
  for (const [line, kind] of arrays["lines.kind"].entries()) {
    const cls = CLASS[kind as G];
    if (!cls) continue;
    const width = arrays["lines.width"][line];
    const pts = read(lineXY, lineStart[line], lineStart[line + 1]);
    if (kind === G.Pier) piers.push(ribbon(pts, width));
    addPath(pts, width, cls);
    // The generated street grids leave room for sidewalks inside their building setbacks.
    if (pts.length === 4 && width <= 14 && (kind === G.Road || kind === G.RoadMajor)) {
      const edge = ribbon(pts, width + 4);
      addPath(edge.slice(0, 4), 2, "footway");
      addPath(edge.slice(4), 2, "footway");
    }
  }

  const shores: { kind: number; rings: number[][] }[] = [];
  for (const [index, kind] of arrays["ground.kind"].entries()) {
    if (!definesSyntheticShore(kind)) continue;
    shores.push({ kind, rings: ringsOf("ground", index) });
  }
  for (const pier of piers) shores.push({ kind: G.Pier, rings: [pier] });
  // Topmost coast polygon wins, with the same even-odd rule as the walk mask.
  shores.reverse().sort((a, b) => PAINT_RANK[b.kind] - PAINT_RANK[a.kind]);
  const containing = (rings: number[][], e: number, n: number): boolean => {
    let inside = false;
    for (const ring of rings) if (insideRing(ring, e, n)) inside = !inside;
    return inside;
  };
  const footprints: (Box & { rings: number[][]; closed: number[][] })[] = [];
  for (const [i, base] of arrays["vol.base"].entries()) {
    if (base > 2 * geo.kz) continue;
    const rings = ringsOf("vol", i);
    const closed = rings.map((ring) => [...ring, ring[0], ring[1]]);
    const flat = rings.flat();
    const east = flat.filter((_, i) => i % 2 === 0);
    const north = flat.filter((_, i) => i % 2 !== 0);
    footprints.push({
      rings,
      closed,
      e0: Math.min(...east) - BUILDING_CLEARANCE,
      n0: Math.min(...north) - BUILDING_CLEARANCE,
      e1: Math.max(...east) + BUILDING_CLEARANCE,
      n1: Math.max(...north) + BUILDING_CLEARANCE,
    });
  }
  const surface = ([e, n]: Point): Surface => {
    if (deckAt(e, n).length) return "deck";
    for (const { e0, n0, e1, n1, rings, closed } of footprints) {
      if (e < e0 || e > e1 || n < n0 || n > n1) continue;
      if (
        containing(rings, e, n) ||
        closed.some((ring) => nearestOnPath(ring, e, n).dist < BUILDING_CLEARANCE)
      )
        return "blocked";
    }
    for (const { kind, rings } of shores) {
      if (containing(rings, e, n)) return isWater(kind) ? "water" : "land";
    }
    return "water";
  };

  const spans = paths.flat();
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) intersect(spans[i], spans[j]);
    cutSurfaces(spans[i], surface);
  }
  const segments: Segment[] = [];
  const seen = new Set<string>();
  // Use the same decimetres as the serialized walk graph so the two sides of a junction agree.
  const snap = (point: Point): Point => [Math.round(point[0] * 10) / 10, Math.round(point[1] * 10) / 10];
  for (const path of paths) {
    for (const { span, start, end, surface: ground } of sectionsOf(path, surface)) {
      const a = snap(at(span, start));
      const b = snap(at(span, end));
      const type = span.cls === "rail" ? "rail" : "road";
      const key = `${type}:${[a.join(","), b.join(",")].sort().join("|")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({
        id: String(segments.length),
        subtype: type,
        cls: span.cls,
        subclass: null,
        name: "",
        width: span.width,
        flags: ground === "deck" ? [{ values: ["is_bridge"] }] : [],
        levels: [],
        access: [],
        connectors: [
          { id: a.join(","), at: 0 },
          { id: b.join(","), at: 1 },
        ],
        pts: [...a, ...b],
      });
    }
  }
  return { segments, piers };
}
