import { isMapDeck, type ElevatedWay, type Volume, type WalkCell } from "./cell";
import { CELL } from "./geo";
import type { WalkIndex } from "./walk-index";

/** The water's surface, metres below the land: where swimmers and boats are, for everything that moves. */
export const WATER_Z = -0.6;
/** Walls are found through a grid of this many metres per side, per square. */
const BUCKET = 20;
const BUCKETS = CELL / BUCKET;
/** How tall a parapet stands above its deck, metres. */
export const PARAPET_HEIGHT = 1;
/**
 * A parapet is open where it runs inside another elevated way that is this near in height: at
 * least a car's height and a parapet, so where two roadways overlap on a steep hump (and their
 * edges disagree by more than their middles) no rail of one stands in the other's lanes.
 */
export const JOIN_HEIGHT = 3;
/** A way's round end, past its last vertex, gives way to a deck beside another way's line unless
 * it stands this much higher (then it is what covers the outside of a bend over a lower deck). */
const CAP_OVER = 3;
/** Metres a deck holds you up past the rails along its edges: so a foot or a wheel that finds a
 * gap between two rails (round the outside of a joint) is still on the deck, not over the drop. */
const DECK_SPARE = 0.5;
/** Overlapping ways this near the highest one under you are all ones you might be on. */
const SAME_LEVEL = 1;
/** The way you are on is kept while you are this near its line, as a share of its half-width,
 * as you are to the nearest other's: so you do not change ways at every step along the midline. */
const STAY_NEARER = 0.1;

export interface Surface {
  z: number;
  kind: "ground" | "water" | "deck" | "roof";
  /** On a deck: the elevated way it is (the same way filed in another square compares by `sameWay`). */
  way?: ElevatedWay;
}

export interface Parapet {
  e0: number;
  n0: number;
  e1: number;
  n1: number;
  z: number;
}

const keyOf = (i: number, j: number) => `${i}_${j}`;

/** Where a point is against a volume's outline (even-odd over its rings) and its nearest edge point. */
function probe(v: Volume, e: number, n: number) {
  let inside = false;
  let best = Infinity;
  let px = e;
  let py = n;
  for (const ring of v.rings) {
    const k = ring.length / 2;
    for (let a = k - 1, b = 0; b < k; a = b++) {
      const ae = ring[a * 2];
      const an = ring[a * 2 + 1];
      const be = ring[b * 2];
      const bn = ring[b * 2 + 1];
      if (an > n !== bn > n && e < ((be - ae) * (n - an)) / (bn - an) + ae) inside = !inside;
      const de = be - ae;
      const dn = bn - an;
      const len2 = de * de + dn * dn;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((e - ae) * de + (n - an) * dn) / len2)) : 0;
      const qe = ae + de * t;
      const qn = an + dn * t;
      const d = Math.hypot(e - qe, n - qn);
      if (d < best) {
        best = d;
        px = qe;
        py = qn;
      }
    }
  }
  return { inside, d: best, px, py };
}

/**
 * Where an elevated way passes through a tower, an anchorage or a building the map stands across
 * it (the Brooklyn Bridge's arches, the Queensboro's columns under its upper deck): within its
 * strip and this much to spare, for feet from a little under its deck to well over it, no volume
 * is a wall. "A little under" is a car's nose on the map's steepest ramps (45%), ahead of its feet.
 */
const OPENING_MARGIN = 0.3;
const OPENING_BELOW = 1.5;
const OPENING_ABOVE = 5;

/** What `stripHit` found: the deck's height, the distance from the way's line, and whether the
 * point is past one of the way's ends (in the round cap its strip ends in) rather than beside it. */
let hitZ = 0;
let hitD = 0;
let hitCap = false;

/** Whether the point is inside a way's strip (nearest segment, `half` either side of its line);
 * the height and the cap are left in `hitZ` and `hitCap`. */
function stripHit(w: ElevatedWay, e: number, n: number, half: number): boolean {
  const p = w.pts;
  let best = Infinity;
  for (let q = 3; q < p.length; q += 3) {
    const ae = p[q - 3];
    const an = p[q - 2];
    const de = p[q] - ae;
    const dn = p[q + 1] - an;
    const len2 = de * de + dn * dn;
    const raw = len2 > 0 ? ((e - ae) * de + (n - an) * dn) / len2 : 0;
    const t = Math.max(0, Math.min(1, raw));
    const d = Math.hypot(e - (ae + de * t), n - (an + dn * t));
    if (d <= half && d < best) {
      best = d;
      hitZ = p[q - 1] + (p[q + 2] - p[q - 1]) * t;
      hitCap = (q === 3 && raw < 0) || (q === p.length - 3 && raw > 1);
    }
  }
  hitD = best;
  return best !== Infinity;
}

/** The decks found beside their ways' lines at one point, reused from call to call. */
const besideWays: ElevatedWay[] = [];
const besideZ: number[] = [];
const besideNear: number[] = [];

/** The deck's height at a point inside its strip (nearest segment), else null; `margin` widens the strip each side. */
export function deckAt(w: ElevatedWay, e: number, n: number, margin = 0): number | null {
  return stripHit(w, e, n, w.width / 2 + margin) ? hitZ : null;
}

/** Whether two elevated ways are the same one (a way is filed whole under every square it
 * touches, so its copies are equal point for point; two roadways sharing their ends are not). */
export function sameWay(a: ElevatedWay, b: ElevatedWay): boolean {
  if (a === b) return true;
  const p = a.pts;
  const q = b.pts;
  if (a.kind !== b.kind || a.width !== b.width || p.length !== q.length) return false;
  for (let x = 0; x < p.length; x++) if (p[x] !== q[x]) return false;
  return true;
}

/** The box [e0, n0, e1, n1] round each elevated way's strip, grown by the opening's margin. */
const stripBoxes = new WeakMap<ElevatedWay, [number, number, number, number]>();
function stripBox(w: ElevatedWay): [number, number, number, number] {
  let box = stripBoxes.get(w);
  if (!box) {
    const r = w.width / 2 + OPENING_MARGIN;
    box = [Infinity, Infinity, -Infinity, -Infinity];
    for (let q = 0; q < w.pts.length; q += 3) {
      box[0] = Math.min(box[0], w.pts[q] - r);
      box[1] = Math.min(box[1], w.pts[q + 1] - r);
      box[2] = Math.max(box[2], w.pts[q] + r);
      box[3] = Math.max(box[3], w.pts[q + 1] + r);
    }
    stripBoxes.set(w, box);
  }
  return box;
}

/** The squares and the questions every moving thing asks of them. No three.js, no DOM. */
export class WalkWorld {
  /** Set by the game: the roof of a car under (e, n), for someone on foot. */
  roofs: ((e: number, n: number) => number | null) | null = null;

  private cellMap = new Map<string, WalkCell>();
  private grids = new Map<string, Volume[][]>();
  private parapetCache = new Map<string, Parapet[]>();

  constructor(readonly index: WalkIndex) {}

  add(cell: WalkCell): void {
    this.cellMap.set(cell.key, cell);
    this.parapetCache.delete(cell.key);
    this.regrid(cell.i, cell.j);
  }

  remove(key: string): void {
    const cell = this.cellMap.get(key);
    if (!cell) return;
    this.cellMap.delete(key);
    this.grids.delete(key);
    this.parapetCache.delete(key);
    this.regrid(cell.i, cell.j, true);
  }

  has(i: number, j: number): boolean {
    return this.cellMap.has(keyOf(i, j));
  }

  cells(): Iterable<WalkCell> {
    return this.cellMap.values();
  }

  inData(e: number, n: number): boolean {
    return this.cellMap.has(keyOf(Math.floor(e / CELL), Math.floor(n / CELL)));
  }

  isWater(e: number, n: number): boolean {
    const i = Math.floor(e / CELL);
    const j = Math.floor(n / CELL);
    const c = this.cellMap.get(keyOf(i, j));
    if (!c || c.mask.mode === 0) return false;
    if (c.mask.mode === 1) return true;
    const x = Math.min(99, Math.floor((e - i * CELL) / 2));
    const y = Math.min(99, Math.floor((n - j * CELL) / 2));
    const idx = x + 100 * y;
    return ((c.mask.bits![idx >> 3] >> (idx & 7)) & 1) === 1;
  }

  /**
   * The highest of the land (or water), an elevated way's deck, or a car's roof that is at most
   * `fromZ + reach`. Overlapping ways are common (the data's widths are wider than the gaps
   * between its lines), and the deck you are on is the way whose line you are nearest, as a share
   * of its half-width, among those about as high as the highest within reach: at a fork it is
   * the branch you steer along, never the other one rising or falling beside it. `on`, the way
   * you were on, is kept while you are about as near its line. A way's round end counts only
   * where no way holds the point beside its line, or where it stands well above them (the
   * outside of a bend between two ways): where one way ends and the next goes on down, the
   * next one is what you are on, not the end's flat cap, which would be a ledge.
   */
  surfaceUnder(
    e: number,
    n: number,
    fromZ: number,
    reach: number,
    on?: ElevatedWay | null,
  ): Surface {
    const limit = fromZ + reach;
    let best: Surface = this.isWater(e, n)
      ? { z: WATER_Z, kind: "water" }
      : { z: 0, kind: "ground" };
    const c = this.cellMap.get(keyOf(Math.floor(e / CELL), Math.floor(n / CELL)));
    if (c) {
      let end: ElevatedWay | null = null;
      let endZ = -Infinity;
      let top = -Infinity;
      besideWays.length = 0;
      besideZ.length = 0;
      besideNear.length = 0;
      for (const w of c.elevated) {
        if (!stripHit(w, e, n, w.width / 2 + DECK_SPARE) || hitZ > limit) continue;
        if (hitCap) {
          if (hitZ > endZ) [end, endZ] = [w, hitZ];
          continue;
        }
        besideWays.push(w);
        besideZ.push(hitZ);
        besideNear.push(hitD / (w.width / 2));
        top = Math.max(top, hitZ);
      }
      let deck: ElevatedWay | null = null;
      let deckZ = -Infinity;
      let near = Infinity;
      let mine = -1;
      for (let x = 0; x < besideWays.length; x++) {
        if (besideZ[x] < top - SAME_LEVEL) continue;
        if (on && mine < 0 && sameWay(besideWays[x], on)) mine = x;
        if (besideNear[x] < near || (besideNear[x] === near && besideZ[x] > deckZ)) {
          [deck, deckZ, near] = [besideWays[x], besideZ[x], besideNear[x]];
        }
      }
      if (mine >= 0 && besideNear[mine] <= near + STAY_NEARER)
        [deck, deckZ] = [besideWays[mine], besideZ[mine]];
      if (end && (!deck || endZ > deckZ + CAP_OVER)) [deck, deckZ] = [end, endZ];
      if (deck && deckZ > best.z) best = { z: deckZ, kind: "deck", way: deck };
    }
    const roof = this.roofs?.(e, n);
    if (roof != null && roof <= limit && roof > best.z) best = { z: roof, kind: "roof" };
    return best;
  }

  /** Whether a body of this radius, feet at zFeet and `height` tall, is in a wall or outside the data. */
  blocked(e: number, n: number, radius: number, zFeet: number, height: number): boolean {
    if (!this.inData(e, n)) return true;
    return this.nearestWall(e, n, radius, zFeet, height) !== null;
  }

  /** The move from (e0, n0) to (e1, n1), with whatever points into a wall taken out of it. */
  slide(
    e0: number,
    n0: number,
    e1: number,
    n1: number,
    radius: number,
    zFeet: number,
    height: number,
  ): [number, number] {
    if (!this.blocked(e1, n1, radius, zFeet, height)) return [e1, n1];
    const normal = this.wallNormal(e1, n1, radius, zFeet, height);
    if (normal) {
      const [ne, nn] = normal;
      const de = e1 - e0;
      const dn = n1 - n0;
      const into = de * ne + dn * nn;
      const se = e0 + de - (into < 0 ? into * ne : 0);
      const sn = n0 + dn - (into < 0 ? into * nn : 0);
      if (!this.blocked(se, sn, radius, zFeet, height)) return [se, sn];
    }
    if (!this.blocked(e1, n0, radius, zFeet, height)) return [e1, n0];
    if (!this.blocked(e0, n1, radius, zFeet, height)) return [e0, n1];
    return [e0, n0];
  }

  /**
   * The way out of the nearest wall a body touches: a unit vector from the wall towards the body
   * (from the body to the wall's nearest edge when it is inside it), or null when it touches none.
   * Outside the data (its edge, or a square that failed to load, is a wall too) it is the way back
   * in, towards the nearest square beside it that is loaded. What a car needs to slide along a wall
   * and to know how hard it hit it.
   */
  wallNormal(
    e: number,
    n: number,
    radius: number,
    zFeet: number,
    height: number,
  ): [number, number] | null {
    if (!this.inData(e, n)) return this.wayIn(e, n);
    const hit = this.nearestWall(e, n, radius, zFeet, height);
    if (!hit) return null;
    const ne = hit.inside ? hit.px - e : e - hit.px;
    const nn = hit.inside ? hit.py - n : n - hit.py;
    const len = Math.hypot(ne, nn);
    return len > 1e-6 ? [ne / len, nn / len] : null;
  }

  /** From a point outside the data, the unit way to the nearest of the loaded squares round its own, or null when none is. */
  private wayIn(e: number, n: number): [number, number] | null {
    const i = Math.floor(e / CELL);
    const j = Math.floor(n / CELL);
    let best = Infinity;
    let out: [number, number] | null = null;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if ((di === 0 && dj === 0) || !this.has(i + di, j + dj)) continue;
        const qe = Math.max((i + di) * CELL, Math.min((i + di + 1) * CELL, e));
        const qn = Math.max((j + dj) * CELL, Math.min((j + dj + 1) * CELL, n));
        const d = Math.hypot(qe - e, qn - n);
        if (d >= best) continue;
        best = d;
        // on the boundary itself: straight across it
        const len = d > 1e-9 ? d : Math.hypot(di, dj);
        out = d > 1e-9 ? [(qe - e) / len, (qn - n) / len] : [di / len, dj / len];
      }
    return out;
  }

  /** The railings of every elevated way near the point: both edges, 1 m high, open where ways meet. */
  parapets(e: number, n: number, radius: number): Parapet[] {
    const out: Parapet[] = [];
    const i0 = Math.floor((e - radius) / CELL);
    const i1 = Math.floor((e + radius) / CELL);
    const j0 = Math.floor((n - radius) / CELL);
    const j1 = Math.floor((n + radius) / CELL);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const c = this.cellMap.get(keyOf(i, j));
        if (!c) continue;
        for (const p of this.cellParapets(c)) {
          const de = p.e1 - p.e0;
          const dn = p.n1 - p.n0;
          const len2 = de * de + dn * dn;
          const t =
            len2 > 0 ? Math.max(0, Math.min(1, ((e - p.e0) * de + (n - p.n0) * dn) / len2)) : 0;
          if (Math.hypot(e - (p.e0 + de * t), n - (p.n0 + dn * t)) <= radius)
            out.push({ e0: p.e0, n0: p.n0, e1: p.e1, n1: p.n1, z: p.z });
        }
      }
    return out;
  }

  /**
   * Parapet pieces along this square's stretch of each way, so a way filed under several squares
   * gives each piece once. A run of closed pieces never crosses into the next square: each square
   * asks whether a piece is open only of its own ways, which are every way that reaches it, so
   * two squares agree where they meet and leave no gap in a rail there.
   */
  private cellParapets(c: WalkCell): Parapet[] {
    const cached = this.parapetCache.get(c.key);
    if (cached) return cached;
    const out: Parapet[] = [];
    const inCell = (e: number, n: number) =>
      Math.floor(e / CELL) === c.i && Math.floor(n / CELL) === c.j;
    c.elevated.forEach((w, wi) => {
      const half = w.width / 2;
      const p = w.pts;
      for (let q = 3; q < p.length; q += 3) {
        const de = p[q] - p[q - 3];
        const dn = p[q + 1] - p[q - 2];
        const len = Math.hypot(de, dn);
        if (len < 1e-6) continue;
        for (const side of [1, -1]) {
          const oe = (-dn / len) * half * side;
          const on = (de / len) * half * side;
          const steps = Math.max(1, Math.ceil(len));
          // runs of closed pieces, at most four steps long so the height follows a ramp
          let from = -1;
          const flush = (to: number) => {
            if (from < 0) return;
            const t0 = from / steps;
            const t1 = to / steps;
            const e0 = p[q - 3] + de * t0 + oe;
            const n0 = p[q - 2] + dn * t0 + on;
            const e1 = p[q - 3] + de * t1 + oe;
            const n1 = p[q - 2] + dn * t1 + on;
            const z = p[q - 1] + (p[q + 2] - p[q - 1]) * ((t0 + t1) / 2);
            out.push({ e0, n0, e1, n1, z });
            from = -1;
          };
          for (let s = 0; s < steps; s++) {
            const t = (s + 0.5) / steps;
            const me = p[q - 3] + de * t + oe;
            const mn = p[q - 2] + dn * t + on;
            // another square's piece: that square's to give
            if (!inCell(me, mn)) {
              flush(s);
              continue;
            }
            const z = p[q - 1] + (p[q + 2] - p[q - 1]) * t;
            const open = c.elevated.some((o, oi) => {
              if (oi === wi) return false;
              const oz = deckAt(o, me, mn);
              return oz !== null && Math.abs(oz - z) <= JOIN_HEIGHT;
            });
            if (open) flush(s);
            else if (from < 0) from = s;
            else if (s - from >= 4) {
              flush(s);
              from = s;
            }
          }
          flush(steps);
        }
      }
      // round the outside of each bend, where one segment's rail ends and the next one's starts
      // apart, a piece between the two (a car would pass through the gap, off the strip)
      for (let q = 3; q + 3 < p.length; q += 3) {
        const ae = p[q] - p[q - 3];
        const an = p[q + 1] - p[q - 2];
        const be = p[q + 3] - p[q];
        const bn = p[q + 4] - p[q + 1];
        const la = Math.hypot(ae, an);
        const lb = Math.hypot(be, bn);
        if (la < 1e-6 || lb < 1e-6) continue;
        const turn = ae * bn - an * be;
        if (Math.abs(turn) < 1e-9 * la * lb) continue;
        // a left turn's outside is its right
        const side = turn > 0 ? -1 : 1;
        const e0 = p[q] + (-an / la) * half * side;
        const n0 = p[q + 1] + (ae / la) * half * side;
        const e1 = p[q] + (-bn / lb) * half * side;
        const n1 = p[q + 1] + (be / lb) * half * side;
        const me = (e0 + e1) / 2;
        const mn = (n0 + n1) / 2;
        if (Math.hypot(e1 - e0, n1 - n0) < 0.05 || !inCell(me, mn)) continue;
        const z = p[q + 2];
        const open = c.elevated.some((o, oi) => {
          if (oi === wi) return false;
          const oz = deckAt(o, me, mn);
          return oz !== null && Math.abs(oz - z) <= JOIN_HEIGHT;
        });
        if (!open) out.push({ e0, n0, e1, n1, z });
      }
    });
    this.parapetCache.set(c.key, out);
    return out;
  }

  /** Rebuilds the 20 m grids of a square and its neighbours: each holds the volumes whose box reaches in (the map's deck pieces aside). */
  private regrid(i: number, j: number, skipSelf = false) {
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (skipSelf && di === 0 && dj === 0) continue;
        const c = this.cellMap.get(keyOf(i + di, j + dj));
        if (c) this.grids.set(c.key, this.gridOf(c));
      }
  }

  private gridOf(c: WalkCell): Volume[][] {
    const grid: Volume[][] = Array.from({ length: BUCKETS * BUCKETS }, () => []);
    const oe = c.i * CELL;
    const on = c.j * CELL;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const s = this.cellMap.get(keyOf(c.i + di, c.j + dj));
        if (!s) continue;
        for (const v of s.volumes) {
          // the map's deck pieces step around the way's own roadway: never a wall
          if (isMapDeck(v)) continue;
          const [e0, n0, e1, n1] = v.box;
          if (e1 < oe || e0 > oe + CELL || n1 < on || n0 > on + CELL) continue;
          const x0 = Math.max(0, Math.floor((e0 - oe) / BUCKET));
          const x1 = Math.min(BUCKETS - 1, Math.floor((e1 - oe) / BUCKET));
          const y0 = Math.max(0, Math.floor((n0 - on) / BUCKET));
          const y1 = Math.min(BUCKETS - 1, Math.floor((n1 - on) / BUCKET));
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++) grid[x + y * BUCKETS].push(v);
        }
      }
    return grid;
  }

  /** The wall nearest to a body, or null when it touches none (or stands in an elevated way's opening). */
  private nearestWall(e: number, n: number, radius: number, zFeet: number, height: number) {
    let best: { inside: boolean; d: number; px: number; py: number } | null = null;
    let opening: boolean | undefined;
    const i0 = Math.floor((e - radius) / CELL);
    const i1 = Math.floor((e + radius) / CELL);
    const j0 = Math.floor((n - radius) / CELL);
    const j1 = Math.floor((n + radius) / CELL);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const grid = this.grids.get(keyOf(i, j));
        if (!grid) continue;
        const oe = i * CELL;
        const on = j * CELL;
        const x0 = Math.max(0, Math.floor((e - radius - oe) / BUCKET));
        const x1 = Math.min(BUCKETS - 1, Math.floor((e + radius - oe) / BUCKET));
        const y0 = Math.max(0, Math.floor((n - radius - on) / BUCKET));
        const y1 = Math.min(BUCKETS - 1, Math.floor((n + radius - on) / BUCKET));
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++)
            for (const v of grid[x + y * BUCKETS]) {
              if (v.base > zFeet + height || v.top <= zFeet + 0.05) continue;
              const [be0, bn0, be1, bn1] = v.box;
              if (e + radius < be0 || e - radius > be1 || n + radius < bn0 || n - radius > bn1)
                continue;
              const h = probe(v, e, n);
              if (!h.inside && h.d >= radius) continue;
              // asked once, and only when something is there: on a roadway, nothing is a wall
              opening ??= this.inOpening(e, n, zFeet);
              if (opening) return null;
              if (!best || (h.inside ? 0 : h.d) < (best.inside ? 0 : best.d)) best = h;
            }
      }
    return best;
  }

  /** Whether a body with its feet at zFeet stands in an elevated way's opening (see `OPENING_MARGIN`). */
  private inOpening(e: number, n: number, zFeet: number): boolean {
    const c = this.cellMap.get(keyOf(Math.floor(e / CELL), Math.floor(n / CELL)));
    if (!c) return false;
    for (const w of c.elevated) {
      const b = stripBox(w);
      if (e < b[0] || e > b[2] || n < b[1] || n > b[3]) continue;
      const z = deckAt(w, e, n, OPENING_MARGIN);
      if (z !== null && zFeet >= z - OPENING_BELOW && zFeet <= z + OPENING_ABOVE) return true;
    }
    return false;
  }
}
