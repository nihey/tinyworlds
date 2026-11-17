import { dataUrl } from "@/map/data";
import { readCell, type WalkCell } from "./cell";
import { REACH, snapDrop, type Drop } from "./drop";
import { decodeCell, inflate, WalkDataError } from "./format";
import { enToLonLat, lonLatToEN } from "./geo";
import { cellExists, parseWalkIndex, type WalkIndex } from "./walk-index";

/**
 * The walk's files as the viewer reads them: `walk/walk.json` once, and the squares, each
 * `walk/cells/<i>_<j>.bin` with `?v=<manifest.walk>`. The squares read while the person is
 * held over the map are kept, a few of them, so the walk opens on them at once. Reached only
 * by dynamic import, like everything of the walk.
 */

/** Squares kept for the next drop or the walk's first look round. */
const KEPT = 24;

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

  /** Every square that could hold a way within reach of (e, n), once they are in (those that fail are left out). */
  async near(e: number, n: number, r = REACH): Promise<WalkCell[]> {
    const got = await Promise.allSettled(
      squaresNear(this.ix, e, n, r).map(([i, j]) => this.square(i, j)),
    );
    const cells: WalkCell[] = [];
    for (const g of got)
      if (g.status === "fulfilled") {
        cells.push(g.value);
        this.ready.set(g.value.key, g.value);
      }
    while (this.ready.size > KEPT) this.ready.delete(this.ready.keys().next().value!);
    return cells;
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
   * The ways near (e, n) a person can be put down on, as (e, n, z) polylines, each once: streets
   * and sidewalks on the ground and the decks of bridges and overpasses (not the railways).
   * Only from squares already in: the drop's highlight never waits.
   */
  waysNear(e: number, n: number, r: number): Float32Array[] {
    const out: Float32Array[] = [];
    const seen = new Set<string>();
    const add = (key: string, pts: Float32Array) => {
      if (seen.has(key) || !near(pts, e, n, r)) return;
      seen.add(key);
      out.push(pts);
    };
    for (const [i, j] of squaresNear(this.ix, e, n, r)) {
      const cell = this.ready.get(`${i}_${j}`);
      if (!cell) continue;
      for (const s of cell.streets) if (!s.elevated) add(`s${s.key}`, s.pts);
      for (const w of cell.walks) if (!w.crosswalk && !w.elevated) add(`w${w.key}`, w.pts);
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

/** Whether any vertex of an (e, n, z) polyline, or a point between two, is within r of (e, n). */
function near(pts: Float32Array, e: number, n: number, r: number): boolean {
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
 * The walk's index and its squares for this data set (`manifest.walk`), read once per page; a
 * failed read is forgotten, so asking again tries again.
 */
export function walkData(version: string | undefined): Promise<WalkData> {
  const key = version ?? "";
  let p = loading.get(key);
  if (!p) {
    p = (async () => {
      const res = await fetch(dataUrl("walk/walk.json", version));
      if (!res.ok) throw new WalkDataError(`walk.json: ${res.status}`);
      const ix = parseWalkIndex(await res.json());
      return new WalkData(ix, async (i, j) => {
        const raw = await inflate(await bytesOf(dataUrl(`walk/cells/${i}_${j}.bin`, version)));
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
