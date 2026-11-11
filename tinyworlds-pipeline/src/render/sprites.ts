import { hash2 } from "../scene/hash.js";
import { R } from "./palette.js";

/** A tiny bitmap anchored at its foot. Pixel codes: 0 empty, 1 highlight, 2 body, 3 shade, 4 trunk. */
export interface Sprite {
  w: number;
  h: number;
  /** Column of the foot within the sprite. */
  anchorX: number;
  /** Radius of the crown, px: sizes the shadow it casts. */
  r: number;
  px: Uint8Array;
}

/**
 * A tree: a lumpy ball of leaves lit from the upper left, on a short trunk. Drawn by rule rather
 * than by hand so there can be many sizes and no two alike.
 */
function makeTree(r: number, variant: number): Sprite {
  const rx = r;
  const ry = Math.max(2, Math.round(r * 0.9));
  const w = rx * 2 + 1;
  const crown = ry * 2 + 1;
  const trunk = Math.max(1, Math.round(r * 0.4));
  const h = crown + trunk;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < crown; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - rx) / (rx + 0.35);
      const ny = (y - ry) / (ry + 0.35);
      const noise = hash2(x + variant * 31, y + variant * 17);
      // a ragged outline: the rim comes and goes
      if (nx * nx + ny * ny > 1 - ((noise & 7) / 7) * 0.2) continue;
      const light = -nx * 0.62 - ny * 0.7 + (((noise >>> 3) & 7) / 7 - 0.5) * 0.3;
      px[y * w + x] = light > 0.4 ? 1 : light > -0.32 ? 2 : 3;
    }
  }
  for (let y = crown - 1; y < h; y++) {
    for (let x = rx - (r > 5 ? 1 : 0); x <= rx; x++) if (px[y * w + x] === 0) px[y * w + x] = 4;
  }
  return { w, h, anchorX: rx, r, px };
}

/** Tree sizes by setting: 0 street, 1 park, 2 forest, 3 scrub. */
const SIZES: number[][] = [
  [3, 4, 4, 5],
  [4, 5, 5, 6, 6, 7],
  [5, 6, 6, 7, 7, 8],
  [2, 2, 3],
];
const VARIANTS = 4;

export const TREE_STREET = 0;
export const TREE_PARK = 1;
export const TREE_FOREST = 2;
export const TREE_SCRUB = 3;

const TREES: Sprite[][] = SIZES.map((sizes) =>
  sizes.flatMap((r) => Array.from({ length: VARIANTS }, (_, v) => makeTree(r, v + r * 7))),
);

export function treeSprite(setting: number, seed: number): Sprite {
  const set = TREES[setting];
  return set[seed % set.length];
}

export type Flora = "temperate" | "tropical" | "subtropical" | "boreal" | "montane";

/**
 * Mostly green. In a temperate city now and then one has already turned; in a tropical one it is
 * in flower instead: a yellow or pink ipê, a red flamboyant; in a subtropical one it is all green;
 * in the far north it is dark evergreens, some of them white with snow; in the mountains of the
 * west it is dark pines and firs with the lighter green of aspens and willows here and there.
 */
export function treeRamp(seed: number, flora: Flora = "temperate"): number {
  const r = seed % 200;
  if (flora === "boreal") {
    if (r < 104) return R.pine;
    if (r < 168) return R.leafDark;
    return R.snow;
  }
  if (flora === "montane") {
    if (r < 100) return R.pine;
    if (r < 160) return R.leafDark;
    if (r < 188) return R.leaf;
    return R.leafLight;
  }
  if (flora === "subtropical") {
    // evergreen: live oaks and palms, nothing turning and nothing in flower
    if (r < 70) return R.leaf;
    if (r < 118) return R.leafLight;
    return R.leafDark;
  }
  if (flora === "tropical") {
    if (r < 66) return R.leaf;
    if (r < 108) return R.leafLight;
    if (r < 190) return R.leafDark;
    if (r < 194) return R.ipeYellow;
    if (r < 197) return R.ipePink;
    return R.flamboyant;
  }
  if (r < 78) return R.leaf;
  if (r < 124) return R.leafLight;
  if (r < 189) return R.leafDark;
  if (r < 197) return R.leafAutumn;
  return R.leafRed;
}
