/**
 * How high every vertex of the walk's ways stands. A bridge over water stands at the deck the
 * map draws there; any other bridge or overpass at its level times 6.5 m (a bridge with no level
 * at one level). Everything else lies on the ground, except where a ramp has to come down: a way
 * may fall no faster than 8% (12% on links), so it lifts its own ends and, when it is too short
 * for its ramps, the ways it joins. Then a way that passes over another keeps 4.5 m of headroom
 * over it, plus its slab.
 *
 * The ways are one graph: a piece's consecutive vertices are joined by their distance, and the
 * ends of pieces that share a connector are one vertex (streets and walks join each other, rails
 * only rails; tunnels are left out and stay at 0). A vertex's height is the highest of its own
 * target and every neighbour's height less the slope times the distance, found by spreading
 * from the highest down (a max-heap), so only what rises is ever visited.
 *
 * The map's deck is exact: a vertex on it stands at its height and nothing moves it, and no
 * vertex off it stands higher than a ramp climbing from it (a cap spread outward from the decks
 * before the heights are). The deck climbs from the shore far faster than a ramp may, so near
 * the shore the cap wins: the approach comes down to meet it, steeper where it must.
 */
import type { Piece } from "./pieces.js";

/** The map's deck height (metres) where it draws one holding this point, else null. */
export type DeckAt = (e: number, n: number) => number | null;

/** Metres between one level and the next, over land. */
export const LEVEL_HEIGHT = 6.5;
/** The steepest a ramp may fall, and a link's. */
export const RAMP = 0.08;
export const LINK_RAMP = 0.12;
/** Headroom kept under an elevated way, and the thickness of its deck under the surface. */
export const CLEARANCE = 4.5;
export const SLAB = 1;

/** Only vertices higher than this can be over another way. */
const ELEVATED = 0.5;
const ROUNDS = 3;
/** Ways meeting at less than 30° run alongside each other: a merge, or a road and its sidewalk. */
const ALONGSIDE = Math.sin((30 * Math.PI) / 180);
/** Metres; the clearance check's grid. */
const GRID = 50;

interface Graph {
  /** Pieces' vertices one after another: piece p's are off[p] to off[p + 1] − 1. */
  off: Int32Array;
  /** The graph vertex of each piece vertex; −1 in a tunnel. */
  vert: Int32Array;
  size: number;
  /** Neighbours of vertex v: to[start[v]] to to[start[v + 1] − 1], with the height a ramp
   * loses on the way. */
  start: Int32Array;
  to: Int32Array;
  drop: Float32Array;
}

/** A binary max-heap of (key, vertex) pairs. */
class Heap {
  private keys = new Float64Array(1024);
  private vals = new Int32Array(1024);
  size = 0;

  push(key: number, val: number): void {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2);
      const vals = new Int32Array(this.size * 2);
      keys.set(this.keys);
      vals.set(this.vals);
      this.keys = keys;
      this.vals = vals;
    }
    let i = this.size++;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.keys[up] >= key) break;
      this.keys[i] = this.keys[up];
      this.vals[i] = this.vals[up];
      i = up;
    }
    this.keys[i] = key;
    this.vals[i] = val;
  }

  get topKey(): number {
    return this.keys[0];
  }

  pop(): number {
    const top = this.vals[0];
    const n = --this.size;
    const key = this.keys[n];
    const val = this.vals[n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && this.keys[c + 1] > this.keys[c]) c++;
      if (this.keys[c] <= key) break;
      this.keys[i] = this.keys[c];
      this.vals[i] = this.vals[c];
      i = c;
    }
    this.keys[i] = key;
    this.vals[i] = val;
    return top;
  }
}

function graphOf(pieces: Piece[], slope: number, linkSlope: number): Graph {
  const off = new Int32Array(pieces.length + 1);
  pieces.forEach((p, i) => (off[i + 1] = off[i] + p.pts.length / 2));
  const vert = new Int32Array(off[pieces.length]).fill(-1);
  const joins = new Map<string, number>();
  let size = 0;
  const join = (key: string): number => {
    let v = joins.get(key);
    if (v === undefined) joins.set(key, (v = size++));
    return v;
  };
  let edges = 0;
  pieces.forEach((p, i) => {
    if (p.tunnel) return;
    const o = off[i];
    const m = off[i + 1] - o;
    const ns = p.kind === "rail" ? "rail:" : "";
    vert[o] = join(ns + p.a);
    for (let k = 1; k < m - 1; k++) vert[o + k] = size++;
    vert[o + m - 1] = join(ns + p.b);
    edges += m - 1;
  });

  const start = new Int32Array(size + 1);
  pieces.forEach((p, i) => {
    if (p.tunnel) return;
    for (let f = off[i]; f + 1 < off[i + 1]; f++) {
      start[vert[f] + 1]++;
      start[vert[f + 1] + 1]++;
    }
  });
  for (let v = 0; v < size; v++) start[v + 1] += start[v];
  const fill = start.slice(0, size);
  const to = new Int32Array(edges * 2);
  const drop = new Float32Array(edges * 2);
  pieces.forEach((p, i) => {
    if (p.tunnel) return;
    const s = p.link ? linkSlope : slope;
    for (let f = off[i]; f + 1 < off[i + 1]; f++) {
      const k = f - off[i];
      const d = Math.hypot(p.pts[k * 2 + 2] - p.pts[k * 2], p.pts[k * 2 + 3] - p.pts[k * 2 + 1]);
      const u = vert[f];
      const v = vert[f + 1];
      let x = fill[u]++;
      to[x] = v;
      drop[x] = d * s;
      x = fill[v]++;
      to[x] = u;
      drop[x] = d * s;
    }
  });
  return { off, vert, size, start, to, drop };
}

/** Off the ground in the data: on a bridge, or above level 0. */
const raised = (p: Piece, k: number): boolean => p.bridge[k] || p.level[k] > 0;

/** What each vertex must reach (the map's deck, or its level's height), and whether it is the
 * map's deck: a vertex any piece finds on a deck stands at that deck, whatever the levels say. */
function targetsOf(pieces: Piece[], g: Graph, deckAt: DeckAt): { target: Float64Array; onDeck: Uint8Array } {
  const target = new Float64Array(g.size);
  const deck = new Float64Array(g.size).fill(-Infinity);
  pieces.forEach((p, i) => {
    if (p.tunnel) return;
    for (let k = 0; k < p.level.length; k++) {
      if (!raised(p, k)) continue;
      const v = g.vert[g.off[i] + k];
      const d = deckAt(p.pts[k * 2], p.pts[k * 2 + 1]);
      if (d !== null) deck[v] = Math.max(deck[v], d);
      else target[v] = Math.max(target[v], Math.max(p.level[k], 1) * LEVEL_HEIGHT);
    }
  });
  const onDeck = new Uint8Array(g.size);
  for (let v = 0; v < g.size; v++)
    if (deck[v] > -Infinity) {
      onDeck[v] = 1;
      target[v] = deck[v];
    }
  return { target, onDeck };
}

/**
 * The highest each vertex may stand: its deck on the map's deck, else the least of every deck's
 * height plus a ramp's climb from it (spread outward from the decks, not through them, out to
 * `limit`, above which nothing stands anyway).
 */
function capsOf(g: Graph, target: Float64Array, onDeck: Uint8Array, limit: number): Float64Array {
  const cap = new Float64Array(g.size).fill(Infinity);
  const heap = new Heap();
  for (let v = 0; v < g.size; v++)
    if (onDeck[v]) {
      cap[v] = target[v];
      heap.push(-cap[v], v);
    }
  while (heap.size > 0) {
    const cu = -heap.topKey;
    const u = heap.pop();
    if (cu > cap[u]) continue;
    for (let x = g.start[u]; x < g.start[u + 1]; x++) {
      const v = g.to[x];
      const c = cu + g.drop[x];
      if (!onDeck[v] && c < cap[v] && c <= limit) {
        cap[v] = c;
        heap.push(-c, v);
      }
    }
  }
  return cap;
}

/** Spreads heights from the vertices given, highest first, each up to its cap; a height never
 * comes down. */
function rise(g: Graph, z: Float64Array, cap: Float64Array, from: Iterable<number>): void {
  const heap = new Heap();
  for (const v of from) heap.push(z[v], v);
  while (heap.size > 0) {
    const zu = heap.topKey;
    const u = heap.pop();
    if (zu < z[u]) continue;
    for (let x = g.start[u]; x < g.start[u + 1]; x++) {
      const v = g.to[x];
      const c = Math.min(zu - g.drop[x], cap[v]);
      if (c > z[v]) {
        z[v] = c;
        heap.push(c, v);
      }
    }
  }
}

/** How far a ramp would fall on the way from one vertex to the others (the least drop through
 * the graph, a Dijkstra), out to a limit. */
class Reach {
  readonly dist: Float64Array;
  private touched: number[] = [];
  private heap = new Heap();

  constructor(private g: Graph) {
    this.dist = new Float64Array(g.size).fill(Infinity);
  }

  from(source: number, limit: number): void {
    for (const v of this.touched) this.dist[v] = Infinity;
    this.touched = [source];
    this.dist[source] = 0;
    const heap = this.heap;
    heap.push(0, source);
    while (heap.size > 0) {
      const du = -heap.topKey;
      const u = heap.pop();
      if (du > this.dist[u]) continue;
      for (let x = this.g.start[u]; x < this.g.start[u + 1]; x++) {
        const d = du + this.g.drop[x];
        const v = this.g.to[x];
        if (d <= limit && d < this.dist[v]) {
          if (this.dist[v] === Infinity) this.touched.push(v);
          this.dist[v] = d;
          heap.push(-d, v);
        }
      }
    }
  }
}

interface Extent {
  e0: number;
  n0: number;
  cell: number;
  cols: number;
  rows: number;
}

function extentOf(pieces: Piece[]): Extent {
  let e0 = Infinity;
  let n0 = Infinity;
  let e1 = -Infinity;
  let n1 = -Infinity;
  for (const p of pieces) {
    if (p.tunnel) continue;
    for (let i = 0; i < p.pts.length; i += 2) {
      e0 = Math.min(e0, p.pts[i]);
      e1 = Math.max(e1, p.pts[i]);
      n0 = Math.min(n0, p.pts[i + 1]);
      n1 = Math.max(n1, p.pts[i + 1]);
    }
  }
  if (e0 > e1) return { e0: 0, n0: 0, cell: GRID, cols: 1, rows: 1 };
  let cell = GRID;
  while (((e1 - e0) / cell + 1) * ((n1 - n0) / cell + 1) > 1 << 24) cell *= 2;
  return {
    e0,
    n0,
    cell,
    cols: Math.floor((e1 - e0) / cell) + 1,
    rows: Math.floor((n1 - n0) / cell) + 1,
  };
}

/**
 * Raises the target of every vertex of a way that passes over another without headroom, and
 * answers the vertices raised.
 *
 * Which of two crossing ways is on top is the data's word, not the solved heights': a piece's
 * level is the highest along it (a bridge with no level is at one), and only a higher one passes
 * over a lower one, where it already stands above the height the data gives the other there
 * (its deck or level, else the ground; a way still on its ramp under a bridge stays under it).
 * It keeps its headroom over that height, never over a ramp the other way only lends: lifting
 * it over that would lift the ramp with it. So a street lifted as a ramp is never lifted
 * itself, and no round feeds the next.
 *
 * Nor is a way lifted over one running alongside it (a merge, its own sidewalk), over one it
 * joins by less than a ramp's drop (the street at the foot of its ramp, which it would lift
 * too), off the map's deck, or where the data puts it below the ground (a cantilevered deck
 * under a street, a line on its way into a tunnel).
 */
function liftOverCrossings(
  pieces: Piece[],
  levels: Int32Array,
  g: Graph,
  z: Float64Array,
  target: Float64Array,
  onDeck: Uint8Array,
  ext: Extent,
  reach: Reach,
  slopes: [number, number],
): number[] {
  const { e0, n0, cell, cols, rows } = ext;
  const col = (e: number): number => Math.min(cols - 1, Math.max(0, Math.floor((e - e0) / cell)));
  const row = (n: number): number => Math.min(rows - 1, Math.max(0, Math.floor((n - n0) / cell)));
  const liftable = (i: number, k: number): boolean => {
    const v = g.vert[g.off[i] + k];
    return z[v] > ELEVATED && !onDeck[v] && pieces[i].level[k] >= 0;
  };

  // the cells a liftable vertex's corridor reaches; only segments there are filed
  const hot = new Uint8Array(cols * rows);
  let any = false;
  pieces.forEach((p, i) => {
    if (levels[i] === 0) return;
    const h = p.width / 2;
    for (let k = 0; k < p.pts.length / 2; k++) {
      if (!liftable(i, k)) continue;
      any = true;
      const e = p.pts[k * 2];
      const n = p.pts[k * 2 + 1];
      for (let r = row(n - h); r <= row(n + h); r++)
        for (let c = col(e - h); c <= col(e + h); c++) hot[r * cols + c] = 1;
    }
  });
  if (!any) return [];

  // each segment, grown by its half-width, filed under the hot cells it overlaps
  const start = new Int32Array(cols * rows + 1);
  const eachCell = (visit: (cellIndex: number, piece: number, k: number) => void): void => {
    pieces.forEach((p, i) => {
      if (p.tunnel) return;
      const h = p.width / 2;
      for (let k = 0; k + 1 < p.pts.length / 2; k++) {
        const ea = p.pts[k * 2];
        const na = p.pts[k * 2 + 1];
        const eb = p.pts[k * 2 + 2];
        const nb = p.pts[k * 2 + 3];
        const r1 = row(Math.max(na, nb) + h);
        const c0 = col(Math.min(ea, eb) - h);
        const c1 = col(Math.max(ea, eb) + h);
        for (let r = row(Math.min(na, nb) - h); r <= r1; r++)
          for (let c = c0; c <= c1; c++) if (hot[r * cols + c]) visit(r * cols + c, i, k);
      }
    });
  };
  eachCell((x) => start[x + 1]++);
  for (let x = 0; x < cols * rows; x++) start[x + 1] += start[x];
  const fill = start.slice(0, cols * rows);
  const segPiece = new Int32Array(start[cols * rows]);
  const segK = new Int32Array(start[cols * rows]);
  eachCell((x, i, k) => {
    segPiece[fill[x]] = i;
    segK[fill[x]++] = k;
  });

  const headroom = CLEARANCE + SLAB;
  const lifted = new Set<number>();
  pieces.forEach((p, i) => {
    if (levels[i] === 0) return;
    const m = p.pts.length / 2;
    const h = p.width / 2;
    for (let k = 0; k < m; k++) {
      if (!liftable(i, k)) continue;
      const v = g.vert[g.off[i] + k];
      const e = p.pts[k * 2];
      const n = p.pts[k * 2 + 1];
      const k0 = Math.max(0, k - 1);
      const k1 = Math.min(m - 1, k + 1);
      const de = p.pts[k1 * 2] - p.pts[k0 * 2];
      const dn = p.pts[k1 * 2 + 1] - p.pts[k0 * 2 + 1];
      const dl = Math.hypot(de, dn);
      if (dl < 1e-6) continue;
      let reached = false;
      for (let r = row(n - h); r <= row(n + h); r++)
        for (let c = col(e - h); c <= col(e + h); c++) {
          const x = r * cols + c;
          for (let s = start[x]; s < start[x + 1]; s++) {
            const qi = segPiece[s];
            if (levels[qi] >= levels[i]) continue;
            const q = pieces[qi];
            const j = segK[s];
            const ea = q.pts[j * 2];
            const na = q.pts[j * 2 + 1];
            const se = q.pts[j * 2 + 2] - ea;
            const sn = q.pts[j * 2 + 3] - na;
            const sl = Math.hypot(se, sn);
            if (sl < 1e-6) continue;
            const t = Math.min(1, Math.max(0, ((e - ea) * se + (n - na) * sn) / (sl * sl)));
            if (Math.hypot(ea + se * t - e, na + sn * t - n) > h + q.width / 2) continue;
            const a = g.vert[g.off[qi] + j];
            const b = g.vert[g.off[qi] + j + 1];
            const ha = raised(q, j) ? target[a] : 0;
            const hb = raised(q, j + 1) ? target[b] : 0;
            const under = ha + (hb - ha) * t;
            const need = under + headroom;
            if (!(under < z[v]) || z[v] >= need || target[v] >= need) continue;
            if (Math.abs(de * sn - dn * se) / (dl * sl) < ALONGSIDE) continue;
            if (!reached) {
              reach.from(v, headroom);
              reached = true;
            }
            const ramp = sl * slopes[q.link ? 1 : 0];
            if (Math.min(reach.dist[a] + t * ramp, reach.dist[b] + (1 - t) * ramp) < headroom) continue;
            lifted.add(v);
            target[v] = need;
          }
        }
    }
  });
  return [...lifted];
}

/** The height of every vertex of every piece, metres above the land (tunnels at 0). */
export function solveHeights(
  pieces: Piece[],
  deckAt: DeckAt,
  opts: { slope?: number; linkSlope?: number } = {},
): Float32Array[] {
  const slope = opts.slope ?? RAMP;
  const linkSlope = opts.linkSlope ?? LINK_RAMP;
  const g = graphOf(pieces, slope, linkSlope);
  const { target, onDeck } = targetsOf(pieces, g, deckAt);
  // nothing stands higher than the highest target plus a headroom for every round
  const cap = capsOf(
    g,
    target,
    onDeck,
    target.reduce((a, b) => Math.max(a, b), 0) + (CLEARANCE + SLAB) * ROUNDS,
  );
  const z = new Float64Array(g.size);
  const sources: number[] = [];
  for (let v = 0; v < g.size; v++) {
    z[v] = Math.min(target[v], cap[v]);
    if (z[v] > 0) sources.push(v);
  }
  rise(g, z, cap, sources);

  // a piece's level: the highest along it, a bridge with no level at one, the ground at 0
  const levels = Int32Array.from(pieces, (p) => {
    let level = 0;
    if (!p.tunnel)
      for (let k = 0; k < p.level.length; k++) if (raised(p, k)) level = Math.max(level, p.level[k], 1);
    return level;
  });
  const ext = extentOf(pieces);
  const reach = new Reach(g);
  for (let round = 0; round < ROUNDS; round++) {
    const lifted = liftOverCrossings(pieces, levels, g, z, target, onDeck, ext, reach, [slope, linkSlope]);
    if (lifted.length === 0) break;
    for (const v of lifted) z[v] = Math.max(z[v], Math.min(target[v], cap[v]));
    rise(g, z, cap, lifted);
  }

  const all = new Float32Array(g.off[pieces.length]);
  for (let f = 0; f < all.length; f++) if (g.vert[f] >= 0) all[f] = z[g.vert[f]];
  return pieces.map((_, i) => all.subarray(g.off[i], g.off[i + 1]));
}
