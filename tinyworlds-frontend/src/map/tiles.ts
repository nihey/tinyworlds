import { bitAt, decodeBitset } from "./bitset";
import type { Manifest } from "./manifest";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Inclusive tile range; empty when tx1 < tx0 or ty1 < ty0. */
export interface TileRange {
  z: number;
  tx0: number;
  ty0: number;
  tx1: number;
  ty1: number;
}

/**
 * The pyramid level to draw at a given scale (screen px per map px): the most
 * detailed level that is still being shrunk, so nothing is ever upscaled below
 * native. floor(log2(1/scale)), clamped to the levels that exist.
 */
export function levelForScale(scale: number, maxZ: number): number {
  if (!(scale > 0)) return maxZ;
  const z = Math.floor(Math.log2(1 / scale) + 1e-9);
  return Math.max(0, Math.min(maxZ, z));
}

/** A decoded view of the manifest's pyramid. */
export class Pyramid {
  readonly tileSize: number;
  readonly originX: number;
  readonly originY: number;
  readonly maxZ: number;
  private readonly levels = new Map<number, { cols: number; rows: number; bits: Uint8Array }>();

  constructor(manifest: Pick<Manifest, "tileSize" | "origin" | "levels">) {
    this.tileSize = manifest.tileSize;
    this.originX = manifest.origin.x;
    this.originY = manifest.origin.y;
    let maxZ = 0;
    for (const l of manifest.levels) {
      this.levels.set(l.z, { cols: l.cols, rows: l.rows, bits: decodeBitset(l.tiles) });
      maxZ = Math.max(maxZ, l.z);
    }
    this.maxZ = maxZ;
  }

  hasLevel(z: number): boolean {
    return this.levels.has(z);
  }

  /** Does the tile file exist? */
  has(z: number, tx: number, ty: number): boolean {
    const l = this.levels.get(z);
    if (!l || tx < 0 || ty < 0 || tx >= l.cols || ty >= l.rows) return false;
    return bitAt(l.bits, tx + ty * l.cols);
  }

  /** Side of one tile of level z, in map px. */
  span(z: number): number {
    return this.tileSize * 2 ** z;
  }

  /** Where tile (z, tx, ty) sits in map px. */
  tileRect(z: number, tx: number, ty: number): Rect {
    const s = this.span(z);
    const left = this.originX + tx * s;
    const top = this.originY + ty * s;
    return { left, top, right: left + s, bottom: top + s };
  }

  /** The tiles of level z that touch a map-px rectangle, clamped to the level's grid. */
  range(z: number, view: Rect): TileRange {
    const l = this.levels.get(z);
    if (!l) return { z, tx0: 0, ty0: 0, tx1: -1, ty1: -1 };
    const s = this.span(z);
    // a tile covers [left, right): a view edge exactly on a boundary does not touch the tile before it
    const tx0 = Math.max(0, Math.floor((view.left - this.originX) / s));
    const ty0 = Math.max(0, Math.floor((view.top - this.originY) / s));
    const tx1 = Math.min(l.cols - 1, Math.ceil((view.right - this.originX) / s) - 1);
    const ty1 = Math.min(l.rows - 1, Math.ceil((view.bottom - this.originY) / s) - 1);
    return { z, tx0, ty0, tx1, ty1 };
  }

  /**
   * Grow a range by `margin` tiles on each side, staying on the level's grid.
   * An empty range stays empty.
   */
  pad(range: TileRange, margin: number): TileRange {
    const l = this.levels.get(range.z);
    if (!l || margin <= 0 || range.tx1 < range.tx0 || range.ty1 < range.ty0) return range;
    return {
      z: range.z,
      tx0: Math.max(0, range.tx0 - margin),
      ty0: Math.max(0, range.ty0 - margin),
      tx1: Math.min(l.cols - 1, range.tx1 + margin),
      ty1: Math.min(l.rows - 1, range.ty1 + margin),
    };
  }

  /** How many tiles exist at a level. */
  count(z: number): number {
    const l = this.levels.get(z);
    if (!l) return 0;
    let n = 0;
    for (const byte of l.bits) {
      let b = byte;
      while (b) {
        n += b & 1;
        b >>= 1;
      }
    }
    return n;
  }

  /** Columns and rows of a level's grid. */
  extent(z: number): { cols: number; rows: number } | null {
    const l = this.levels.get(z);
    return l ? { cols: l.cols, rows: l.rows } : null;
  }

  /** Every existing tile of a level. */
  all(z: number): { tx: number; ty: number }[] {
    const l = this.levels.get(z);
    if (!l) return [];
    const out: { tx: number; ty: number }[] = [];
    for (let ty = 0; ty < l.rows; ty++)
      for (let tx = 0; tx < l.cols; tx++) if (bitAt(l.bits, tx + ty * l.cols)) out.push({ tx, ty });
    return out;
  }
}

export const tileKey = (z: number, tx: number, ty: number): string => `${z}/${tx}_${ty}`;

/** One tile around the view is fetched ahead, so a short pan does not start from blank. */
export const PREFETCH_RING = 1;

/** Coarser tiles that contain (z, tx, ty), nearest parent first. */
export function ancestors(
  z: number,
  tx: number,
  ty: number,
  maxZ: number,
): { z: number; tx: number; ty: number }[] {
  const out: { z: number; tx: number; ty: number }[] = [];
  for (let dz = 1; z + dz <= maxZ; dz++) out.push({ z: z + dz, tx: tx >> dz, ty: ty >> dz });
  return out;
}

/**
 * Coarse levels small enough to pin in memory, so a pan always has something to show.
 * The top level may be a little larger (it is only one overview); finer overviews stay smaller.
 */
export function pinLevels(pyramid: Pyramid, topCap = 40, finerCap = 16): number[] {
  const out: number[] = [];
  for (let z = pyramid.maxZ; z >= 0; z--) {
    const n = pyramid.count(z);
    if (n === 0) continue;
    if (n > (z === pyramid.maxZ ? topCap : finerCap)) break;
    out.push(z);
  }
  return out;
}

/** A tile the engine should download, nearest and most useful first. */
export interface TileRequest {
  z: number;
  tx: number;
  ty: number;
  /** map-px distance from the view centre */
  dist: number;
  /** 0 = on screen, 1 = a parent standing in, 2 = a ring around the view */
  pri: number;
}

export interface TilePlan {
  z: number;
  range: TileRange;
  wanted: TileRequest[];
  /** already-cached tiles to keep this frame (parents and the prefetch ring) */
  retain: { z: number; tx: number; ty: number }[];
}

/** Tuning for one frame: how far to prefetch, and whether to skip native tiles. */
export interface PlanOptions {
  /** tiles of padding around the view; default `PREFETCH_RING` */
  ring?: number;
  /** extra tiles east (positive) or west, on top of the ring */
  aheadTx?: number;
  /** extra tiles south (positive) or north, on top of the ring */
  aheadTy?: number;
  /** skip the native level and only fetch parents (a fast pan on a slow link) */
  deferNative?: boolean;
  /** rank by distance to this map-px point; defaults to the view centre */
  aimX?: number;
  aimY?: number;
}

/**
 * Which tiles to draw, to fetch, and to keep. `has` is "already in the cache" (loading
 * or ready); `ready` is "decoded and drawable".
 */
export function planTiles(
  pyramid: Pyramid,
  view: Rect & { x: number; y: number; scale: number; dpr: number },
  has: (key: string) => boolean,
  ready: (key: string) => boolean,
  options: PlanOptions = {},
): TilePlan {
  const z = levelForScale(view.scale * Math.min(view.dpr, 2), pyramid.maxZ);
  const range = pyramid.range(z, view);
  const ring = options.ring ?? PREFETCH_RING;
  const padded = extendRange(pyramid, range, ring, options.aheadTx ?? 0, options.aheadTy ?? 0);
  const wanted: TileRequest[] = [];
  const retain: { z: number; tx: number; ty: number }[] = [];
  const seen = new Set<string>();

  const want = (tz: number, tx: number, ty: number, pri: number, dist: number) => {
    if (!pyramid.has(tz, tx, ty)) return;
    const key = tileKey(tz, tx, ty);
    if (has(key) || seen.has(key)) return;
    seen.add(key);
    wanted.push({ z: tz, tx, ty, pri, dist });
  };
  const keep = (tz: number, tx: number, ty: number) => {
    if (!pyramid.has(tz, tx, ty)) return;
    const key = tileKey(tz, tx, ty);
    if (has(key)) retain.push({ z: tz, tx, ty });
  };

  const aimX = options.aimX ?? view.x;
  const aimY = options.aimY ?? view.y;
  const distTo = (tz: number, tx: number, ty: number) => {
    const r = pyramid.tileRect(tz, tx, ty);
    return Math.hypot((r.left + r.right) / 2 - aimX, (r.top + r.bottom) / 2 - aimY);
  };

  for (let ty = range.ty0; ty <= range.ty1; ty++) {
    for (let tx = range.tx0; tx <= range.tx1; tx++) {
      if (!pyramid.has(z, tx, ty)) continue;
      const dist = distTo(z, tx, ty);
      const key = tileKey(z, tx, ty);
      if (!ready(key) && !options.deferNative) want(z, tx, ty, 0, dist);
      // keep every ancestor we already have, and fetch the missing ones until a stand-in is in hand
      let covered = ready(key);
      for (const a of ancestors(z, tx, ty, pyramid.maxZ)) {
        keep(a.z, a.tx, a.ty);
        if (covered) continue;
        if (ready(tileKey(a.z, a.tx, a.ty))) {
          covered = true;
          continue;
        }
        want(a.z, a.tx, a.ty, 1, dist);
      }
    }
  }

  for (let ty = padded.ty0; ty <= padded.ty1; ty++) {
    for (let tx = padded.tx0; tx <= padded.tx1; tx++) {
      if (!pyramid.has(z, tx, ty)) continue;
      if (tx >= range.tx0 && tx <= range.tx1 && ty >= range.ty0 && ty <= range.ty1) continue;
      const dist = distTo(z, tx, ty);
      keep(z, tx, ty);
      want(z, tx, ty, 2, dist);
    }
  }

  wanted.sort((a, b) => a.pri - b.pri || a.dist - b.dist);
  return { z, range, wanted, retain };
}

/** Pad a range by `ring` on every side, then stretch it in the direction of a pan. */
export function extendRange(
  pyramid: Pyramid,
  range: TileRange,
  ring: number,
  aheadTx: number,
  aheadTy: number,
): TileRange {
  const padded = pyramid.pad(range, ring);
  if (aheadTx === 0 && aheadTy === 0) return padded;
  const ext = pyramid.extent(range.z);
  if (!ext || padded.tx1 < padded.tx0 || padded.ty1 < padded.ty0) return padded;
  return {
    z: padded.z,
    tx0: Math.max(0, padded.tx0 + (aheadTx < 0 ? aheadTx : 0)),
    ty0: Math.max(0, padded.ty0 + (aheadTy < 0 ? aheadTy : 0)),
    tx1: Math.min(ext.cols - 1, padded.tx1 + (aheadTx > 0 ? aheadTx : 0)),
    ty1: Math.min(ext.rows - 1, padded.ty1 + (aheadTy > 0 ? aheadTy : 0)),
  };
}
