import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { binVolumes, fogRange, type Rect } from "../render/bin.js";
import { ChunkRenderer, SUN_DROP, type ChunkJob } from "../render/chunk.js";
import { toRgba } from "../render/encode.js";
import type { Scene } from "../render/scene.js";
import { hashString } from "../scene/hash.js";

/**
 * A sight's picture: the structure drawn on its own, as the tiles draw it (its shadows included)
 * but with nothing standing in front of it, so the viewer can lift it out of the map when it
 * lights up. `src` is relative to the world's data folder; x, y, w, h place it in map px.
 */
export interface SpriteRef {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Px kept round an outline: the renderer's edge lines, and the outline's own rounding. */
const MARGIN = 2;
/** A picture larger than this (px) is not made: the viewer would have to hold it all at once. */
export const MAX_SPRITE_PX = 16_000_000;
/** Side of the grid the volumes are filed in (map px). */
const CELL = 1024;

const EMPTY = new Uint32Array(0);

/** The whole-pixel rectangle round an outline's rings, with a margin. */
export function spriteRect(rings: number[][], margin = MARGIN): Rect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const ring of rings)
    for (let i = 0; i < ring.length; i += 2) {
      left = Math.min(left, ring[i]);
      right = Math.max(right, ring[i]);
      top = Math.min(top, ring[i + 1]);
      bottom = Math.max(bottom, ring[i + 1]);
    }
  const x0 = Math.floor(left) - margin;
  const y0 = Math.floor(top) - margin;
  return { x0, y0, w: Math.ceil(right) + margin - x0, h: Math.ceil(bottom) + margin - y0 };
}

/**
 * The volumes filed by where they can matter to a rectangle (where they stand, from their foot to
 * their top, and as far right as their shadow falls), so a small rectangle need not look at all
 * of a city's volumes. `near` gives candidates in ascending order; `binVolumes` decides.
 */
export class VolumeGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly seen: Uint32Array;
  private stamp = 0;
  /** The tallest volume, in px: how far below a rectangle a caster may stand. */
  readonly tallest: number;

  constructor(private readonly scene: Scene) {
    const { vol } = scene;
    const vb = vol.bbox;
    this.seen = new Uint32Array(vol.count);
    let tallest = 0;
    for (let v = 0; v < vol.count; v++) {
      const rise = vol.top[v] + vol.roofH[v] + 2;
      if (rise > tallest) tallest = rise;
      const reach = rise / SUN_DROP + 2;
      const cx0 = Math.floor(vb[v * 4] / CELL);
      const cx1 = Math.floor((vb[v * 4 + 2] + reach) / CELL);
      const cy0 = Math.floor((vb[v * 4 + 1] - rise) / CELL);
      const cy1 = Math.floor(vb[v * 4 + 3] / CELL);
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cy * 1_000_003 + cx;
          const list = this.cells.get(key);
          if (list) list.push(v);
          else this.cells.set(key, [v]);
        }
    }
    this.tallest = tallest;
  }

  /** Every volume that may show in the rectangle or shade it, ascending. */
  near(rect: Rect): Uint32Array {
    const pad = 8;
    const cx0 = Math.floor((rect.x0 - pad) / CELL);
    const cx1 = Math.floor((rect.x0 + rect.w + pad) / CELL);
    const cy0 = Math.floor((rect.y0 - pad) / CELL);
    const cy1 = Math.floor((rect.y0 + rect.h + this.tallest + pad) / CELL);
    const stamp = ++this.stamp;
    const out: number[] = [];
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = this.cells.get(cy * 1_000_003 + cx);
        if (!list) continue;
        for (const v of list)
          if (this.seen[v] !== stamp) {
            this.seen[v] = stamp;
            out.push(v);
          }
      }
    return Uint32Array.from(out).sort();
  }
}

/** What to draw for one sight: its own volumes alone, shaded by everything that shades them. */
export function spriteJob(scene: Scene, grid: VolumeGrid, rect: Rect, vols: number[]): ChunkJob {
  const { casters, marginLeft, marginDown } = binVolumes(scene, rect, grid.near(rect));
  const range = fogRange(scene, rect, marginDown);
  return {
    ...rect,
    ground: EMPTY,
    lines: EMPTY,
    vols: Uint32Array.from(vols).sort(),
    casters: Uint32Array.from(casters),
    trees: EMPTY,
    cables: EMPTY,
    marginLeft,
    marginDown,
    foggy: range.max > scene.fog.start - 300,
    alone: true,
  };
}

/** The file a sight's picture goes to, under the data folder: named by a hash of its id. */
export const spriteSrc = (id: string): string => `sights/${hashString(id).toString(36)}.webp`;

/**
 * Draws each sight's picture into `<out>/sights/` (emptied first) and returns where each one is,
 * by sight id. A sight whose picture would be empty or too large gets none.
 */
export async function writeSprites(opts: {
  scene: Scene;
  sights: { id: string; rings: number[][] }[];
  volsOf: (id: string) => number[] | undefined;
  out: string;
  log: (m: string) => void;
}): Promise<Map<string, SpriteRef>> {
  const { scene, sights, volsOf, out, log } = opts;
  const started = Date.now();
  const dir = path.join(out, "sights");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const grid = new VolumeGrid(scene);
  const renderer = new ChunkRenderer(scene);
  const refs = new Map<string, SpriteRef>();
  const files = new Map<string, string>();
  let bytes = 0;
  let skipped = 0;
  const writes: Promise<void>[] = [];
  for (const sight of sights) {
    const vols = volsOf(sight.id);
    if (!vols || vols.length === 0) continue;
    const rect = spriteRect(sight.rings);
    if (rect.w * rect.h > MAX_SPRITE_PX) {
      skipped++;
      continue;
    }
    const src = spriteSrc(sight.id);
    const other = files.get(src);
    if (other !== undefined) throw new Error(`sights "${other}" and "${sight.id}" would share ${src}`);
    files.set(src, sight.id);
    const rgba = toRgba(renderer.render(spriteJob(scene, grid, rect, vols)));
    if (!rgba) continue;
    refs.set(sight.id, { src, x: rect.x0, y: rect.y0, w: rect.w, h: rect.h });
    writes.push(
      sharp(rgba, { raw: { width: rect.w, height: rect.h, channels: 4 } })
        .webp({ lossless: true, effort: 4 })
        .toFile(path.join(out, src))
        .then((info) => {
          bytes += info.size;
        }),
    );
    // keep a few encodes in flight, not a city's worth of pictures in memory
    if (writes.length >= 8) await Promise.all(writes.splice(0));
  }
  await Promise.all(writes);
  log(
    `index: ${refs.size} sight pictures, ${(bytes / 1e6).toFixed(1)} MB` +
      (skipped ? `, ${skipped} too large to draw` : "") +
      ` (${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
  return refs;
}
