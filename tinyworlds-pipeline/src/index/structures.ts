import type { Projection } from "../projection.js";
import type { Scene } from "../render/scene.js";
import { Roof } from "../scene/kinds.js";
import type { Owners } from "../scene/owners.js";
import type { Piece } from "./silhouette.js";
import type { Candidate, Found } from "./sights.js";

/** A stadium's grounds (a ring of map px) and the seeds of the stands that stand in them. */
export interface Stands {
  ring: number[];
  seeds: number[];
}

/** How far a point may miss a footprint and still be on it, in metres. */
const SNAP = 4;
/** How near the statue a point must be, in metres. */
const STATUE = 30;
/** How far apart the pieces of one building may stand, in metres. */
const SPREAD = 300;
const CELL = 256;
/** How far past a bridge's own pieces a piece filed under another road's name may stand, in metres. */
const BRIDGE_PAD = 40;
/**
 * For a bridge none of whose pieces carry its name (Pittsburgh's Smithfield Street Bridge is
 * filed under "Smithfield Street"): how far from its entry's point the pieces filed under the
 * names the city lists for it may stand, in metres.
 */
const BRIDGE_REACH = 220;

/** "Ed Koch Queensboro Bridge — Upper Level" → "ed koch queensboro bridge upper level" */
export const normalizeName = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Even-odd: is (x, y) inside the rings? Rings are flat [x0, y0, x1, y1, …]. */
function inside(rings: number[][], x: number, y: number): boolean {
  let hit = false;
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = ring[i * 2 + 1];
      const yj = ring[j * 2 + 1];
      if (yi > y !== yj > y && x < ((ring[j * 2] - ring[i * 2]) * (y - yi)) / (yj - yi) + ring[i * 2])
        hit = !hit;
    }
  }
  return hit;
}

function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

function area(ring: number[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2)
    a += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  return Math.abs(a / 2);
}

/** The footprint rings of volume v, as flat map px. */
function ringsOf(scene: Scene, v: number): number[][] {
  const { ringStart, vertStart, xy } = scene.vol;
  const rings: number[][] = [];
  for (let r = ringStart[v]; r < ringStart[v + 1]; r++) {
    const ring: number[] = [];
    for (let k = vertStart[r]; k < vertStart[r + 1]; k++) ring.push(xy[k * 2], xy[k * 2 + 1]);
    rings.push(ring);
  }
  return rings;
}

/** Steps a tapered roof's outline is built of. */
const ROOF_STEPS = 10;

/**
 * What silhouette() needs of each volume: footprint, underside and top (px). A spire or a dome
 * narrows towards the volume's centre as the renderer draws it (`1 − f` and `√(1 − f²)` of the
 * footprint at a share f of the roof's height): its walls, then the roof in steps, each as wide
 * as the roof at its foot, so the outline never cuts into what is drawn.
 */
export function piecesOf(scene: Scene, vols: number[]): Piece[] {
  const { base, top, roofH, roofShape, center } = scene.vol;
  const pieces: Piece[] = [];
  for (const v of vols) {
    const rings = ringsOf(scene, v);
    const shape = roofShape?.[v] ?? Roof.Flat;
    if ((shape !== Roof.Pyramid && shape !== Roof.Dome) || roofH[v] <= 0) {
      pieces.push({ rings, lift: base[v], rise: top[v] + roofH[v] });
      continue;
    }
    pieces.push({ rings, lift: base[v], rise: top[v] });
    const cx = center[v * 2];
    const cy = center[v * 2 + 1];
    for (let k = 0; k < ROOF_STEPS; k++) {
      const f = k / ROOF_STEPS;
      const s = shape === Roof.Dome ? Math.sqrt(1 - f * f) : 1 - f;
      pieces.push({
        rings: rings.map((ring) => ring.map((c, i) => (i % 2 === 0 ? cx + (c - cx) * s : cy + (c - cy) * s))),
        lift: top[v] + roofH[v] * f,
        rise: top[v] + (roofH[v] * (k + 1)) / ROOF_STEPS,
      });
    }
  }
  return pieces;
}

/**
 * Finds the structure a search entry stands on: a bridge by its roads' names, the statue beside
 * its point, a stadium's stands from a point in its grounds, a building entry's own building, or
 * the building whose footprint holds (or nearly holds) its point.
 */
export function makeFinder(
  scene: Scene,
  owners: Owners,
  proj: Projection,
  stands: Stands[],
  /** a bridge (lower-case name) → other roads' names its pieces are filed under (`sights.bridges`) */
  bridgeAliases: Record<string, string[]> = {},
): (c: Candidate) => Found | null {
  const { bbox, seed, count } = scene.vol;

  // a grid of buckets over the volumes' boxes
  const buckets = new Map<number, number[]>();
  const cellKey = (cx: number, cy: number): number => cx * 1_000_003 + cy;
  for (let v = 0; v < count; v++) {
    const x0 = Math.floor(bbox[v * 4] / CELL);
    const y0 = Math.floor(bbox[v * 4 + 1] / CELL);
    const x1 = Math.floor(bbox[v * 4 + 2] / CELL);
    const y1 = Math.floor(bbox[v * 4 + 3] / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const key = cellKey(cx, cy);
        const list = buckets.get(key);
        if (list) list.push(v);
        else buckets.set(key, [v]);
      }
  }
  /** Volumes whose boxes come within `pad` px of (x, y). */
  const near = (x: number, y: number, pad: number): number[] => {
    const out = new Set<number>();
    for (let cx = Math.floor((x - pad) / CELL); cx <= Math.floor((x + pad) / CELL); cx++)
      for (let cy = Math.floor((y - pad) / CELL); cy <= Math.floor((y + pad) / CELL); cy++)
        for (const v of buckets.get(cellKey(cx, cy)) ?? [])
          if (
            bbox[v * 4] - pad <= x &&
            x <= bbox[v * 4 + 2] + pad &&
            bbox[v * 4 + 1] - pad <= y &&
            y <= bbox[v * 4 + 3] + pad
          )
            out.add(v);
    return [...out].sort((a, b) => a - b);
  };
  /** px that `metres` can span on the map in any direction (generous). */
  const span = (metres: number): number => metres * proj.geo.k * 2;

  const owned = new Set<number>();
  for (const b of owners.bridges) for (const v of b.vols) owned.add(v);
  for (const s of owners.statues) for (const v of s.vols) owned.add(v);

  /** All volumes of one seed within SPREAD of (x, y). */
  const bySeed = (s: number, x: number, y: number): number[] =>
    near(x, y, span(SPREAD)).filter((v) => seed[v] === s && !owned.has(v));

  // each stadium: its stands, and which seeds lead to it
  const standFound: Found[] = [];
  const standOf = new Map<number, number>();
  stands.forEach((st, i) => {
    const xs = st.ring.filter((_, j) => j % 2 === 0);
    const ys = st.ring.filter((_, j) => j % 2 === 1);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const seeds = new Set(st.seeds);
    const vols = near(cx, cy, span(SPREAD)).filter((v) => seeds.has(seed[v]) && !owned.has(v));
    standFound.push({ key: `b${st.seeds[0].toString(36)}`, vols, seed: st.seeds[0] });
    for (const s of st.seeds) standOf.set(s, i);
  });

  /** The building under (x, y): the largest footprint holding it, else the nearest within SNAP. */
  const footprint = (x: number, y: number): number | null => {
    const [gp, gq] = proj.mapToGrid(x, y);
    let best = -1;
    let bestArea = -1;
    let nearest = -1;
    let nearestD = SNAP;
    for (const v of near(x, y, span(SNAP))) {
      if (owned.has(v)) continue;
      const rings = ringsOf(scene, v);
      if (inside(rings, x, y)) {
        const a = area(rings[0]);
        if (a > bestArea) {
          bestArea = a;
          best = v;
        }
        continue;
      }
      for (const ring of rings)
        for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
          const [ap, aq] = proj.mapToGrid(ring[j], ring[j + 1]);
          const [bp, bq] = proj.mapToGrid(ring[i], ring[i + 1]);
          const d = toSegment(gp, gq, ap, aq, bp, bq);
          if (d <= nearestD) {
            nearestD = d;
            nearest = v;
          }
        }
    }
    return best >= 0 ? best : nearest >= 0 ? nearest : null;
  };

  const building = (v: number, x: number, y: number): Found => {
    const stand = standOf.get(seed[v]);
    if (stand !== undefined) return standFound[stand];
    return { key: `b${seed[v].toString(36)}`, vols: bySeed(seed[v], x, y), seed: seed[v] };
  };

  return (c: Candidate): Found | null => {
    const [x, y] = proj.toMap(c.lon, c.lat);

    if (c.t === "bridge") {
      const name = ` ${normalizeName(c.n)} `;
      const vols = new Set<number>();
      for (const b of owners.bridges)
        if (` ${normalizeName(b.name)} `.includes(name)) for (const v of b.vols) vols.add(v);
      // pieces filed under other roads' names (a tower under "Canal Street (lower level)"):
      // those that stand within the bridge's own extent
      const aliases = new Set((bridgeAliases[c.n.toLowerCase()] ?? []).map(normalizeName));
      if (vols.size === 0) {
        // no piece carries its own name: those of the names listed for it, near its point
        const reach = span(BRIDGE_REACH);
        for (const owner of owners.bridges) {
          if (!aliases.has(normalizeName(owner.name))) continue;
          for (const v of owner.vols) {
            const cx = (bbox[v * 4] + bbox[v * 4 + 2]) / 2;
            const cy = (bbox[v * 4 + 1] + bbox[v * 4 + 3]) / 2;
            if (Math.hypot(cx - x, cy - y) <= reach) vols.add(v);
          }
        }
        if (vols.size === 0) return null;
        return { key: `bridge:${normalizeName(c.n)}`, vols: [...vols].sort((a, b) => a - b) };
      }
      if (aliases.size > 0) {
        let [l, t, r, b] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const v of vols) {
          l = Math.min(l, bbox[v * 4]);
          t = Math.min(t, bbox[v * 4 + 1]);
          r = Math.max(r, bbox[v * 4 + 2]);
          b = Math.max(b, bbox[v * 4 + 3]);
        }
        const pad = span(BRIDGE_PAD);
        for (const owner of owners.bridges) {
          if (!aliases.has(normalizeName(owner.name))) continue;
          for (const v of owner.vols) {
            const cx = (bbox[v * 4] + bbox[v * 4 + 2]) / 2;
            const cy = (bbox[v * 4 + 1] + bbox[v * 4 + 3]) / 2;
            if (cx >= l - pad && cx <= r + pad && cy >= t - pad && cy <= b + pad) vols.add(v);
          }
        }
      }
      return { key: `bridge:${normalizeName(c.n)}`, vols: [...vols].sort((a, b) => a - b) };
    }

    const [gp, gq] = proj.toGrid(c.lon, c.lat);
    for (const [i, statue] of owners.statues.entries()) {
      const [sp, sq] = proj.toGrid(statue.lon, statue.lat);
      if (Math.hypot(gp - sp, gq - sq) > STATUE) continue;
      const [sx, sy] = proj.toMap(statue.lon, statue.lat);
      const vols = new Set(statue.vols);
      // what it stands on: the entry's own building when it has one (Reunion Tower's ball is a
      // statue on the tower, whose base the hotel beside it wraps round), else whatever holds its spot
      const own = c.seed !== undefined ? bySeed(c.seed, sx, sy) : [];
      const pedestal = own.length > 0 ? null : footprint(sx, sy);
      for (const v of own) vols.add(v);
      if (pedestal !== null) for (const v of bySeed(seed[pedestal], sx, sy)) vols.add(v);
      return { key: `statue:${i}`, vols: [...vols].sort((a, b) => a - b) };
    }

    for (const [i, st] of stands.entries()) if (inside([st.ring], x, y)) return standFound[i];

    if (c.seed !== undefined) {
      const vols = bySeed(c.seed, x, y);
      if (vols.length > 0) return building(vols[0], x, y);
    }

    const hit = footprint(x, y);
    return hit === null ? null : building(hit, x, y);
  };
}
