import { worldDataUrl } from "@/map/data";
import type { Projection } from "@/map/projection";
import { G, isMapDeck, readCell, type WalkCell } from "./cell";
import { REACH, snapDrop, yawAlong, type Drop } from "./drop";
import { decodeCell, inflate, WalkDataError } from "./format";
import { enToLonLat, lonLatToEN, type WalkGeo } from "./geo";
import { cellExists, parseWalkIndex, type WalkIndex } from "./walk-index";

/**
 * The walk's files as the viewer reads them: `walk/walk.json` once, and the squares, each
 * `walk/cells/<i>_<j>.bin` with `?v=<manifest.walk>`, from the world's own data folder whichever
 * way the map is turned (one walk, in metres, for both views). The squares read while the person
 * is held over the map are kept, a few of them, so the walk opens on them at once. Reached only
 * by dynamic import, like everything of the walk.
 */

/** Squares kept for the next drop or the walk's first look round. */
const KEPT = 24;
/** The highest deck looked for under a pointer, m (New York's bridges stand under 80 m), the
 * steps it is looked for at, and how far round each step's ground point. */
const DECK_TOP = 80;
const DECK_STEP = 20;
const DECK_REACH = 40;
/** Map px a deck reaches beyond its drawn half-width (its slab and parapets). */
const DECK_SLACK = 2;

const RAD = Math.PI / 180;
const PREVIEW_GREEN = new Set<number>([G.Park, G.Lawn, G.Garden, G.Forest, G.Cemetery, G.Meadow]);
const PREVIEW_PAVED = new Set<number>([G.Plaza, G.Pier]);

export interface DropGround {
  footprints: Float32Array[][];
  green: Float32Array[][];
  paved: Float32Array[][];
}

/** A point (e, n) metres from the origin, z up, in map px, as the map draws it (raised by z·kz). */
export function toMapPx(geo: WalkGeo, e: number, n: number, z: number): { x: number; y: number } {
  const s = Math.sin(geo.betaDeg * RAD);
  const c = Math.cos(geo.betaDeg * RAD);
  const p = e * s + n * c;
  const q = e * c - n * s;
  return { x: (p + q) * geo.k, y: ((q - p) * geo.k) / 2 - z * geo.kz };
}

/** The point at height z that the map draws at map px (x, y), in metres east and north. */
export function fromMapPx(geo: WalkGeo, x: number, y: number, z: number): [number, number] {
  const s = Math.sin(geo.betaDeg * RAD);
  const c = Math.cos(geo.betaDeg * RAD);
  const sum = x / geo.k;
  const diff = (2 * (y + z * geo.kz)) / geo.k;
  const p = (sum - diff) / 2;
  const q = (sum + diff) / 2;
  return [p * s + q * c, p * c - q * s];
}

/**
 * How the map on screen places the walk's points: north up or turned to the street grid, its map
 * px are its own projection's, not the walk's (`walk.json`'s `geo` is the world's own view).
 */
export interface MapFrame {
  /** map px per metre of the map's projection (its `geo.k`) */
  k: number;
  /** (e, n) metres of the walk at height z: map px as the map draws it, raised by z·kz */
  toMap(e: number, n: number, z: number): { x: number; y: number };
  /** map px (x, y) as the map draws a point at height z: the walk's (e, n) metres */
  fromMap(x: number, y: number, z: number): [number, number];
}

/** The frame of a map drawn with the walk's own projection (`geo`): the world's own view. */
export function geoFrame(geo: WalkGeo): MapFrame {
  return {
    k: geo.k,
    toMap: (e, n, z) => toMapPx(geo, e, n, z),
    fromMap: (x, y, z) => fromMapPx(geo, x, y, z),
  };
}

/**
 * The frame of the map being shown (a `MapEngine`: its current projection and manifest), for a
 * walk whose metres are `walk`'s: through lon/lat, so it holds for either view.
 */
export function mapFrame(
  walk: WalkGeo,
  map: { projection: Projection; manifest: { geo: { k: number; kz: number } } },
): MapFrame {
  const { k, kz } = map.manifest.geo;
  return {
    k,
    toMap(e, n, z) {
      const [lon, lat] = enToLonLat(walk, e, n);
      const p = map.projection.toMap(lon, lat);
      return { x: p.x, y: p.y - z * kz };
    },
    fromMap(x, y, z) {
      const g = map.projection.toGeo(x, y + z * kz);
      return lonLatToEN(walk, g.lon, g.lat);
    },
  };
}

/**
 * The raised deck the map draws at map px (x, y): bridges and overpasses stand z·kz px above
 * their footprint, so a point on one is far (71 m for a 41 m deck) from the ground under the
 * pointer. Each deck (not the railways) is drawn as the map draws it and hit within its
 * half-width; of two drawn at the point, the one in front (its ground nearest the viewer).
 * Answers where on it a person stands, facing along it, or null.
 */
export function pickDeck(
  cells: Iterable<WalkCell>,
  frame: MapFrame,
  x: number,
  y: number,
): Drop | null {
  let best: { drop: Drop; front: number; dist: number } | null = null;
  const seen = new Set<Float32Array>();
  for (const cell of cells)
    for (const w of cell.elevated) {
      if (w.kind === 2 || seen.has(w.pts)) continue;
      seen.add(w.pts);
      const reach = (w.width / 2) * frame.k + DECK_SLACK;
      const p = w.pts;
      let a = frame.toMap(p[0], p[1], p[2]);
      for (let q = 3; q + 2 < p.length; q += 3) {
        const b = frame.toMap(p[q], p[q + 1], p[q + 2]);
        const sx = b.x - a.x;
        const sy = b.y - a.y;
        const len2 = sx * sx + sy * sy;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * sx + (y - a.y) * sy) / len2)) : 0;
        const dist = Math.hypot(x - (a.x + sx * t), y - (a.y + sy * t));
        a = b;
        if (dist > reach) continue;
        const de = p[q] - p[q - 3];
        const dn = p[q + 1] - p[q - 2];
        const len = Math.hypot(de, dn);
        if (len === 0) continue;
        const e = p[q - 3] + de * t;
        const n = p[q - 2] + dn * t;
        const z = p[q - 1] + (p[q + 2] - p[q - 1]) * t;
        const front = frame.toMap(e, n, 0).y;
        if (best && !(front > best.front + 0.5 || (front > best.front - 0.5 && dist < best.dist)))
          continue;
        best = { drop: { e, n, z, yaw: yawAlong(de / len, dn / len) }, front, dist };
      }
    }
  return best?.drop ?? null;
}

/** A square without its elevated ways: what the ground under a pointer offers. */
const onTheGround = (c: WalkCell): WalkCell => ({ ...c, elevated: [] });

/** The squares round a point that may hold a way within `r` metres of it. */
export function squaresNear(ix: WalkIndex, e: number, n: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  if (!Number.isFinite(e) || !Number.isFinite(n)) return out;
  const c = ix.cell;
  for (let j = Math.floor((n - r) / c); j <= Math.floor((n + r) / c); j++)
    for (let i = Math.floor((e - r) / c); i <= Math.floor((e + r) / c); i++)
      if (cellExists(ix, i, j)) out.push([i, j]);
  return out;
}

export class WalkData {
  private kept = new Map<string, Promise<WalkCell>>();

  constructor(
    readonly ix: WalkIndex,
    private readonly fetchCell: (i: number, j: number) => Promise<WalkCell>,
  ) {}

  /** A square, from those kept or asked for; a square that failed is asked again next time. */
  square(i: number, j: number): Promise<WalkCell> {
    const key = `${i}_${j}`;
    const kept = this.kept.get(key);
    if (kept) {
      // the most recently used last, so the oldest goes first
      this.kept.delete(key);
      this.kept.set(key, kept);
      return kept;
    }
    let asked: Promise<WalkCell>;
    try {
      asked = this.fetchCell(i, j);
    } catch (err) {
      asked = Promise.reject(err);
    }
    this.kept.set(key, asked);
    asked.catch(() => {
      if (this.kept.get(key) === asked) this.kept.delete(key);
    });
    while (this.kept.size > KEPT) this.kept.delete(this.kept.keys().next().value!);
    return asked;
  }

  /** The squares that are in already, of those round a point: no waiting, nothing asked. */
  private ready = new Map<string, WalkCell>();

  /** These squares, once they are in (those that fail are left out; when every one fails, the
   * first failure: offline, or a browser that cannot unzip them, is not "no street here"). */
  private async load(squares: [number, number][]): Promise<WalkCell[]> {
    const got = await Promise.allSettled(squares.map(([i, j]) => this.square(i, j)));
    const failed = got.find((g): g is PromiseRejectedResult => g.status === "rejected");
    if (failed && got.every((g) => g.status === "rejected")) throw failed.reason;
    const cells: WalkCell[] = [];
    for (const g of got)
      if (g.status === "fulfilled") {
        cells.push(g.value);
        // the most recently used last, so the oldest goes first
        this.ready.delete(g.value.key);
        this.ready.set(g.value.key, g.value);
      }
    while (this.ready.size > KEPT) this.ready.delete(this.ready.keys().next().value!);
    return cells;
  }

  /** Every square that could hold a way within reach of (e, n), once they are in. */
  async near(e: number, n: number, r = REACH): Promise<WalkCell[]> {
    return this.load(squaresNear(this.ix, e, n, r));
  }

  /**
   * The squares that could hold what the map draws at map px (x, y): round the ground point under
   * it, and round the footprints of decks up to `DECK_TOP` high drawn there.
   */
  private under(frame: MapFrame, x: number, y: number): [number, number][] {
    const out = new Map<string, [number, number]>();
    for (let z = 0; z <= DECK_TOP; z += DECK_STEP) {
      const [e, n] = frame.fromMap(x, y, z);
      for (const sq of squaresNear(this.ix, e, n, z === 0 ? REACH : DECK_REACH))
        out.set(`${sq[0]}_${sq[1]}`, sq);
    }
    return [...out.values()];
  }

  /**
   * Where a person put down at map px (x, y) of a map placed by `frame` stands: on the raised deck
   * the map draws there, or else by the street or sidewalk nearest the ground point under it
   * (never on a deck the map draws elsewhere). Null when there is neither.
   */
  async dropAtMap(frame: MapFrame, x: number, y: number): Promise<Drop | null> {
    const cells = await this.load(this.under(frame, x, y));
    const deck = pickDeck(cells, frame, x, y);
    if (deck) return deck;
    const [e, n] = frame.fromMap(x, y, 0);
    return snapDrop(cells.map(onTheGround), e, n);
  }

  /** Ground context for the drag preview, using the same already-loaded cells as the routes. */
  groundNearMap(frame: MapFrame, x: number, y: number, r: number): DropGround {
    const [e, n] = frame.fromMap(x, y, 0);
    const ground: DropGround = { footprints: [], green: [], paved: [] };
    for (const [i, j] of squaresNear(this.ix, e, n, r)) {
      const cell = this.ready.get(`${i}_${j}`);
      if (!cell) continue;
      for (const v of cell.volumes) {
        const [left, bottom, right, top] = v.box;
        if (
          v.base <= 0.05 &&
          !isMapDeck(v) &&
          left <= e + r &&
          right >= e - r &&
          bottom <= n + r &&
          top >= n - r
        ) {
          ground.footprints.push(v.rings);
        }
      }
      for (const surface of cell.ground) {
        if (PREVIEW_GREEN.has(surface.kind)) ground.green.push(surface.rings);
        else if (PREVIEW_PAVED.has(surface.kind)) ground.paved.push(surface.rings);
      }
    }
    return ground;
  }

  /**
   * The ways a person carried over map px (x, y) could be put down on, near it as the map draws
   * them: streets and sidewalks within r metres of the ground point, and decks drawn within
   * r metres' worth of px. Only from squares already in: the highlight never waits.
   */
  waysNearMap(frame: MapFrame, x: number, y: number, r: number): Float32Array[] {
    const [e, n] = frame.fromMap(x, y, 0);
    const out = this.waysNear(e, n, r, false);
    const seen = new Set<Float32Array>();
    for (const [i, j] of this.under(frame, x, y)) {
      const cell = this.ready.get(`${i}_${j}`);
      if (!cell) continue;
      for (const d of cell.elevated) {
        if (d.kind === 2 || seen.has(d.pts)) continue;
        seen.add(d.pts);
        if (drawnWithin(frame, d.pts, x, y, r * frame.k)) out.push(d.pts);
      }
    }
    return out;
  }

  /** Where a person dropped at (e, n) stands, or null when no way is within reach. */
  async drop(e: number, n: number): Promise<Drop | null> {
    return snapDrop(await this.near(e, n), e, n);
  }

  async dropAt(lon: number, lat: number): Promise<Drop | null> {
    const [e, n] = lonLatToEN(this.ix.geo, lon, lat);
    return this.drop(e, n);
  }

  /**
   * The ways near (e, n) in plan a person can be put down on, as (e, n, z) polylines, each once:
   * streets and sidewalks on the ground and (`decks`) the decks of bridges and overpasses, not
   * the railways. Only from squares already in.
   */
  waysNear(e: number, n: number, r: number, decks = true): Float32Array[] {
    const out: Float32Array[] = [];
    const seen = new Set<string>();
    const add = (key: string, pts: Float32Array) => {
      if (seen.has(key) || !within(pts, e, n, r)) return;
      seen.add(key);
      out.push(pts);
    };
    for (const [i, j] of squaresNear(this.ix, e, n, r)) {
      const cell = this.ready.get(`${i}_${j}`);
      if (!cell) continue;
      for (const s of cell.streets) if (!s.elevated) add(`s${s.key}`, s.pts);
      for (const w of cell.walks) if (!w.crosswalk && !w.elevated) add(`w${w.key}`, w.pts);
      if (decks)
        for (const d of cell.elevated)
          if (d.kind !== 2 && d.pts.length >= 3) add(`d${d.pts[0]},${d.pts[1]},${d.pts[2]}`, d.pts);
    }
    return out;
  }

  toEN(lon: number, lat: number): [number, number] {
    return lonLatToEN(this.ix.geo, lon, lat);
  }

  toLonLat(e: number, n: number): [number, number] {
    return enToLonLat(this.ix.geo, e, n);
  }
}

/** Whether an (e, n, z) polyline, drawn as the map draws it, passes within r px of map px (x, y). */
function drawnWithin(frame: MapFrame, pts: Float32Array, x: number, y: number, r: number): boolean {
  let a = frame.toMap(pts[0], pts[1], pts[2]);
  for (let q = 3; q + 2 < pts.length; q += 3) {
    const b = frame.toMap(pts[q], pts[q + 1], pts[q + 2]);
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const len2 = sx * sx + sy * sy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * sx + (y - a.y) * sy) / len2)) : 0;
    if (Math.hypot(x - (a.x + sx * t), y - (a.y + sy * t)) <= r) return true;
    a = b;
  }
  return false;
}

/** Whether any vertex of an (e, n, z) polyline, or a point between two, is within r of (e, n). */
function within(pts: Float32Array, e: number, n: number, r: number): boolean {
  const r2 = r * r;
  for (let q = 0; q + 2 < pts.length; q += 3) {
    const de = pts[q] - e;
    const dn = pts[q + 1] - n;
    if (de * de + dn * dn <= r2) return true;
    if (q + 5 < pts.length) {
      const se = pts[q + 3] - pts[q];
      const sn = pts[q + 4] - pts[q + 1];
      const len2 = se * se + sn * sn;
      if (len2 === 0) continue;
      const t = Math.max(0, Math.min(1, (-de * se - dn * sn) / len2));
      const pe = de + se * t;
      const pn = dn + sn * t;
      if (pe * pe + pn * pn <= r2) return true;
    }
  }
  return false;
}

async function bytesOf(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new WalkDataError(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const loading = new Map<string, Promise<WalkData>>();

/**
 * The walk's index and its squares (`manifest.walk` of the world's own manifest), read once per
 * page, whichever way the map is turned; a failed read is forgotten, so asking again tries again.
 */
export function walkData(version: string | undefined): Promise<WalkData> {
  const key = version ?? "";
  let p = loading.get(key);
  if (!p) {
    p = (async () => {
      const res = await fetch(worldDataUrl("walk/walk.json", version));
      if (!res.ok) throw new WalkDataError(`walk.json: ${res.status}`);
      const ix = parseWalkIndex(await res.json());
      return new WalkData(ix, async (i, j) => {
        const raw = await inflate(await bytesOf(worldDataUrl(`walk/cells/${i}_${j}.bin`, version)));
        return readCell(decodeCell(raw));
      });
    })();
    loading.set(key, p);
    p.catch(() => {
      if (loading.get(key) === p) loading.delete(key);
    });
  }
  return p;
}
