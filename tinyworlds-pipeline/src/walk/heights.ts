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
 * A vertex on the map's deck stands at that deck and nothing moves it, and no vertex off it
 * stands higher than a ramp climbing from it (a cap spread outward from the decks before the
 * heights are). Which deck is the way's own where decks stack (the Queensboro's two levels and
 * ramps) is chosen along each piece for continuity (`decksOf`), and the deck's 7 m steps are
 * smoothed into a slope. The map draws a suspension bridge as a hump that lands on each shore;
 * the walk does not draw the map's decks, so on a bridge of level 2 or more a vertex on the deck
 * reaches for the level's height instead (no higher than the bridge's crest) where that is
 * higher, as a vertex off the deck does, and the approaches stay up; it still comes down by a
 * ramp to a deck the map holds lower (where the level changes along a tangle of ramps).
 */
import type { Piece } from "./pieces.js";

/** Every height (metres) of the map's decks holding this point: none off them, several where they stack. */
export type DeckAt = (e: number, n: number) => readonly number[];

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

/** Metres a piece's deck may change between two vertices this far apart before the second is
 * taken for another deck: a step plus the steepest the map's hump climbs. */
const deckJump = (d: number): number => 3 + 0.4 * d;
/** How steeply the map's own deck may climb between two vertices at no cost to the choice (its
 * 7 m steps, sampled every 10 m, read up to 41%). */
const DECK_GRADE = 0.45;
/** What standing off a deck that holds the vertex costs the choice, in metres of jump. */
const OFF_DECK = 4;
/** Metres a vertex on the deck may stand off the line through its neighbours on it (the map's
 * steps put it up to about one either side). */
const OFF_LINE = 2.5;
/** What each metre between a deck and the vertex's level costs: only enough to break a tie. */
const LEVEL_PULL = 0.01;
/** Metres either side of a vertex, along its piece, that its deck height is the mean of: one of
 * the map's deck steps, so the staircase becomes a slope wherever the vertices fall. */
const SMOOTH = 3.5;
const SMOOTH_SAMPLES = 15;
/** A sample of the smoothing on another deck than the vertex's (farther than this) is left out. */
const SMOOTH_SAME = 2;

/** A choice at one vertex: on a deck at z, or off the decks with z the last one stood on (NaN
 * for none yet) and s where along the piece that was; its cost so far and the choice before. */
interface DeckState {
  on: boolean;
  z: number;
  s: number;
  cost: number;
  back: number;
}

/** Per piece vertex: the map's deck it stands on (metres, NaN off the decks), and the height its
 * bridge's level asks of it there (0 where none is asked: a bridge below level 2, or off a deck). */
export interface PieceDecks {
  at: Float32Array[];
  floor: Float32Array[];
}

export interface DeckStats {
  /** Vertices that stand on a deck of the map. */
  onDeck: number;
  /** Of them, asked by their bridge's level to stand above the deck the map draws. */
  floored: number;
  /** Vertices a deck holds that stand off it: another bridge's deck, or a gap in their own. */
  dropped: number;
}

/**
 * The deck each piece vertex stands on (metres, NaN off the map's decks), its piece's own where
 * several hold it. Along each piece the choice is the most continuous one (a Viterbi pass over
 * every deck at every raised vertex, or none): a vertex whose only decks are another bridge's
 * (a spike) or the one under a gap in its own (a pit) stands off them, and the solver ramps it.
 */
export function decksOf(pieces: Piece[], deckAt: DeckAt, stats?: DeckStats): PieceDecks {
  const floors: Float32Array[] = [];
  const at = pieces.map((p) => {
    const m = p.level.length;
    const out = new Float32Array(m).fill(NaN);
    floors.push(new Float32Array(m));
    if (p.tunnel) return out;
    const cands: (readonly number[])[] = [];
    for (let k = 0; k < m; k++) cands.push(raised(p, k) ? deckAt(p.pts[k * 2], p.pts[k * 2 + 1]) : []);
    if (cands.every((c) => c.length === 0)) return out;

    // the states at each vertex: on one of its decks, or off them remembering the last deck stood
    // on (and where), so a gap in a deck never lets the next vertex start afresh on another one
    const along = new Float64Array(m);
    for (let k = 1; k < m; k++)
      along[k] =
        along[k - 1] + Math.hypot(p.pts[k * 2] - p.pts[k * 2 - 2], p.pts[k * 2 + 1] - p.pts[k * 2 - 1]);
    const steps: DeckState[][] = [];
    for (let k = 0; k < m; k++) {
      const c = cands[k];
      const target = Math.max(p.level[k], 1) * LEVEL_HEIGHT;
      const prev = k > 0 ? steps[k - 1] : [{ on: false, z: NaN, s: 0, cost: 0, back: -1 }];
      const here: DeckState[] = [];
      for (const z of c) {
        let cost = Infinity;
        let back = -1;
        for (let ri = 0; ri < prev.length; ri++) {
          const r = prev[ri];
          let step = 0;
          if (!Number.isNaN(r.z)) {
            const d = along[k] - r.s;
            const rise = Math.abs(z - r.z);
            if (rise > deckJump(d)) continue;
            step = Math.max(0, rise - DECK_GRADE * d);
          }
          if (r.cost + step < cost) [cost, back] = [r.cost + step, ri];
        }
        if (back >= 0)
          here.push({ on: true, z, s: along[k], cost: cost + LEVEL_PULL * Math.abs(z - target), back });
      }
      // off: from each state before, keeping its last deck (the cheapest of those that agree)
      const off = c.length > 0 ? OFF_DECK : 0;
      prev.forEach((r, ri) => {
        const z = r.z;
        const s = r.on ? along[k - 1] : r.s;
        const same = here.find(
          (h) => !h.on && (Number.isNaN(z) ? Number.isNaN(h.z) : Math.abs(h.z - z) < 0.5),
        );
        if (!same) here.push({ on: false, z, s, cost: r.cost + off, back: ri });
        else if (r.cost + off < same.cost) Object.assign(same, { z, s, cost: r.cost + off, back: ri });
      });
      steps.push(here);
    }
    let x = 0;
    const last = steps[m - 1];
    for (let y = 1; y < last.length; y++) if (last[y].cost < last[x].cost) x = y;
    for (let k = m - 1; k >= 0; k--) {
      const st = steps[k][x];
      if (st.on) out[k] = st.z;
      else if (stats && cands[k].length > 0) stats.dropped++;
      x = st.back;
    }

    // a lone vertex far off the line through its neighbours on the deck is on the wrong one (a
    // seam between two of its own steps over a lower ramp, a gap over another deck): the one
    // nearest that line, or none; the farthest off first, so a pit does not condemn its neighbour
    const lineAt = (k: number): number => {
      if (k < 1 || k + 1 >= m || Number.isNaN(out[k - 1]) || Number.isNaN(out[k]) || Number.isNaN(out[k + 1]))
        return NaN;
      const u = (along[k] - along[k - 1]) / Math.max(1e-6, along[k + 1] - along[k - 1]);
      return out[k - 1] + (out[k + 1] - out[k - 1]) * u;
    };
    for (let round = 0; round < m; round++) {
      let worst = -1;
      let off = OFF_LINE;
      for (let k = 1; k + 1 < m; k++) {
        const d = Math.abs(out[k] - lineAt(k));
        if (d > off) [worst, off] = [k, d];
      }
      if (worst < 0) break;
      const line = lineAt(worst);
      let near = NaN;
      let gap = OFF_LINE;
      for (const z of cands[worst]) if (Math.abs(z - line) <= gap) [near, gap] = [z, Math.abs(z - line)];
      if (Number.isNaN(near) && stats) stats.dropped++;
      out[worst] = near;
    }

    // each deck vertex at the mean of its own deck over a step either side, along the piece
    const chosen = out.slice();
    for (let k = 0; k < m; k++) {
      if (Number.isNaN(chosen[k])) continue;
      const k0 = Math.max(0, k - 1);
      const k1 = Math.min(m - 1, k + 1);
      const de = p.pts[k1 * 2] - p.pts[k0 * 2];
      const dn = p.pts[k1 * 2 + 1] - p.pts[k0 * 2 + 1];
      const len = Math.hypot(de, dn);
      if (len < 1e-6) continue;
      let sum = 0;
      let count = 0;
      for (let x = 0; x < SMOOTH_SAMPLES; x++) {
        const o = -SMOOTH + (2 * SMOOTH * x) / (SMOOTH_SAMPLES - 1);
        let near = NaN;
        let gap = SMOOTH_SAME;
        for (const z of deckAt(p.pts[k * 2] + (de / len) * o, p.pts[k * 2 + 1] + (dn / len) * o))
          if (Math.abs(z - chosen[k]) <= gap) {
            near = z;
            gap = Math.abs(z - chosen[k]);
          }
        if (!Number.isNaN(near)) {
          sum += near;
          count++;
        }
      }
      if (count > 0) out[k] = sum / count;
    }

    return out;
  });

  // a bridge of level 2 or more asks for its level, never above its crest: the highest of the
  // deck it is on, followed along every piece on it (a bridge is cut into pieces at its towers
  // and junctions, and the one by the shore must still know how high the span goes)
  const first = new Int32Array(pieces.length + 1);
  pieces.forEach((p, i) => (first[i + 1] = first[i] + p.level.length));
  const parent = Int32Array.from({ length: first[pieces.length] }, (_, x) => x);
  const root = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const join = (x: number, y: number): void => {
    parent[root(x)] = root(y);
  };
  const ends = new Map<string, number>();
  pieces.forEach((p, i) => {
    const m = p.level.length;
    for (let k = 0; k + 1 < m; k++)
      if (!Number.isNaN(at[i][k]) && !Number.isNaN(at[i][k + 1])) join(first[i] + k, first[i] + k + 1);
    for (const [id, k] of [
      [p.a, 0],
      [p.b, m - 1],
    ] as const) {
      if (Number.isNaN(at[i][k])) continue;
      const key = (p.kind === "rail" ? "rail:" : "") + id;
      const other = ends.get(key);
      if (other === undefined) ends.set(key, first[i] + k);
      else join(first[i] + k, other);
    }
  });
  const crest = new Float64Array(parent.length).fill(-Infinity);
  pieces.forEach((p, i) => {
    for (let k = 0; k < p.level.length; k++) {
      if (Number.isNaN(at[i][k])) continue;
      const r = root(first[i] + k);
      crest[r] = Math.max(crest[r], at[i][k]);
    }
  });
  pieces.forEach((p, i) => {
    for (let k = 0; k < p.level.length; k++) {
      if (Number.isNaN(at[i][k])) continue;
      if (stats) stats.onDeck++;
      if (p.level[k] < 2) continue;
      const floor = Math.min(p.level[k] * LEVEL_HEIGHT, crest[root(first[i] + k)]);
      if (floor > at[i][k]) {
        floors[i][k] = floor;
        if (stats) stats.floored++;
      }
    }
  });
  return { at, floor: floors };
}

/** What each vertex must reach (its deck, or its level's height), and whether it is on a deck:
 * a vertex any piece stands on a deck at stands at that deck, whatever the levels say, unless its
 * bridge's level asks for more (then it is a target like any other, and the cap from the decks
 * the map holds lower brings it down by a ramp). */
function targetsOf(
  pieces: Piece[],
  g: Graph,
  decks: PieceDecks,
): { target: Float64Array; onDeck: Uint8Array } {
  const target = new Float64Array(g.size);
  const deck = new Float64Array(g.size).fill(-Infinity);
  pieces.forEach((p, i) => {
    if (p.tunnel) return;
    for (let k = 0; k < p.level.length; k++) {
      if (!raised(p, k)) continue;
      const v = g.vert[g.off[i] + k];
      const d = decks.at[i][k];
      const lift = decks.floor[i][k];
      if (lift > 0) target[v] = Math.max(target[v], lift);
      else if (!Number.isNaN(d)) deck[v] = Math.max(deck[v], d);
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

/** The height of every vertex of every piece, metres above the land (tunnels at 0). `decks`
 * are `decksOf(pieces, deckAt)`, when the caller has them already. */
export function solveHeights(
  pieces: Piece[],
  deckAt: DeckAt,
  opts: { slope?: number; linkSlope?: number; decks?: PieceDecks } = {},
): Float32Array[] {
  const slope = opts.slope ?? RAMP;
  const linkSlope = opts.linkSlope ?? LINK_RAMP;
  const g = graphOf(pieces, slope, linkSlope);
  const { target, onDeck } = targetsOf(pieces, g, opts.decks ?? decksOf(pieces, deckAt));
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
