import type { PlaceType } from "./manifest";

/**
 * Sights: the structures that light up under the pointer (sights.json), and what Wikipedia says
 * of them (sights.<locale>.json). Shapes are in map px, not lon/lat: an outline includes height.
 */

/** A place type, or a building named by its own name. */
export type SightType = PlaceType | "building";

export interface Sight {
  id: string;
  n: string;
  t: SightType;
  /** context line: borough, … */
  b?: string;
  lon: number;
  lat: number;
  /** the outline as drawn, flat map px rings, even-odd */
  rings: number[][];
  /** the largest ground y of its footprints: the nearer the viewer, the larger */
  front: number;
  /** where its sign hangs, map px */
  anchor: [number, number];
  /** its picture with nothing standing in front of it, where the world has one */
  sprite?: SightSprite;
}

/**
 * A sight drawn on its own, as the tiles draw it: `src` is a file in the world's data folder,
 * x, y, w, h where it lies in map px.
 */
export interface SightSprite {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SightsFile {
  sights: Sight[];
}

/** The opening of a sight's article, and where to read the rest. `lang` is the article's own. */
export interface SightText {
  title: string;
  url: string;
  text: string;
  lang: string;
}

export type SightTexts = Record<string, SightText>;

/** A sight ready to hit-test and draw: its rings as typed arrays, and its box. */
export interface SightShape extends Sight {
  paths: Float64Array[];
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isRing = (r: unknown): r is number[] =>
  Array.isArray(r) && r.length >= 6 && r.length % 2 === 0 && r.every(finite);

/** A picture in the data folder's `sights/`, with a place and a size; anything else is none. */
function parseSprite(v: unknown): SightSprite | undefined {
  if (!v || typeof v !== "object") return undefined;
  const { src, x, y, w, h } = v as Partial<SightSprite>;
  if (typeof src !== "string" || !/^sights\/[\w-]+\.webp$/.test(src)) return undefined;
  if (!finite(x) || !finite(y) || !finite(w) || !finite(h) || w <= 0 || h <= 0) return undefined;
  return { src, x, y, w, h };
}

/** The well-formed sights of a sights.json; anything else is left out (a bad picture: the sight without it). */
export function parseSights(json: unknown): Sight[] {
  const list = (json as Partial<SightsFile> | null)?.sights;
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (s: Partial<Sight> | null): s is Sight =>
        !!s &&
        typeof s.id === "string" &&
        typeof s.n === "string" &&
        typeof s.t === "string" &&
        finite(s.lon) &&
        finite(s.lat) &&
        finite(s.front) &&
        Array.isArray(s.anchor) &&
        finite(s.anchor[0]) &&
        finite(s.anchor[1]) &&
        Array.isArray(s.rings) &&
        s.rings.length > 0 &&
        s.rings.every(isRing),
    )
    .map((s) => {
      const { sprite, ...rest } = s;
      const ok = parseSprite(sprite);
      return ok ? { ...rest, sprite: ok } : rest;
    });
}

/** The well-formed texts of a sights.<locale>.json: a title, words, and a link to a web page. */
export function parseSightTexts(json: unknown): SightTexts {
  const out: SightTexts = {};
  if (!json || typeof json !== "object") return out;
  for (const [id, v] of Object.entries(json as Record<string, Partial<SightText> | null>)) {
    if (!v || typeof v !== "object") continue;
    const { title, url, text, lang } = v;
    if (typeof title !== "string" || typeof text !== "string" || typeof lang !== "string") continue;
    if (typeof url !== "string" || !/^https:\/\//.test(url)) continue;
    out[id] = { title, url, text, lang };
  }
  return out;
}

export function buildSightShapes(sights: Sight[]): SightShape[] {
  return sights.map((s) => {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const paths = s.rings.map((ring) => {
      for (let i = 0; i < ring.length; i += 2) {
        left = Math.min(left, ring[i]);
        right = Math.max(right, ring[i]);
        top = Math.min(top, ring[i + 1]);
        bottom = Math.max(bottom, ring[i + 1]);
      }
      return Float64Array.from(ring);
    });
    return { ...s, paths, left, top, right, bottom };
  });
}

function inside(paths: Float64Array[], x: number, y: number): boolean {
  let hit = false;
  for (const ring of paths) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = ring[i * 2 + 1];
      const yj = ring[j * 2 + 1];
      if (
        yi > y !== yj > y &&
        x < ((ring[j * 2] - ring[i * 2]) * (y - yi)) / (yj - yi) + ring[i * 2]
      )
        hit = !hit;
    }
  }
  return hit;
}

/** Whether any of a sight's outline can be on a screen showing this map-px rectangle (by its box). */
export function sightInView(
  s: SightShape,
  view: { left: number; top: number; right: number; bottom: number },
): boolean {
  return (
    s.right >= view.left && s.left <= view.right && s.bottom >= view.top && s.top <= view.bottom
  );
}

/** The sight under map point (x, y): of those whose outline holds it, the one nearest the viewer. -1 for none. */
export function sightAt(shapes: SightShape[], x: number, y: number): number {
  let best = -1;
  for (let i = 0; i < shapes.length; i++) {
    const s = shapes[i];
    if (x < s.left || x > s.right || y < s.top || y > s.bottom) continue;
    if (best >= 0 && s.front <= shapes[best].front) continue;
    if (inside(s.paths, x, y)) best = i;
  }
  return best;
}

/**
 * Which pictures to let go so the rest fit in `budget` px: the least recently used first, never
 * the one in use (`keep`). Pictures still loading count nothing.
 */
export function picturesToDrop(
  pictures: { id: string; px: number; usedAt: number }[],
  keep: string | null,
  budget: number,
): string[] {
  let total = pictures.reduce((sum, p) => sum + p.px, 0);
  const drop: string[] = [];
  for (const p of [...pictures].sort((a, b) => a.usedAt - b.usedAt)) {
    if (total <= budget) break;
    if (p.id === keep || p.px === 0) continue;
    drop.push(p.id);
    total -= p.px;
  }
  return drop;
}
