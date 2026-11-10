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
