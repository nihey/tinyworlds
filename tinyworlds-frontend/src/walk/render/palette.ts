import * as THREE from "three";
import { WalkDataError } from "../format";
import type { WalkIndex } from "../walk-index";

/**
 * The map's palette: a few dozen materials, six shades each, and nothing else. The walk draws
 * every surface by picking one of these colours per pixel, exactly as the tiles do.
 */

/** Shades along a ramp, as the pipeline's `render/palette.ts` numbers them. */
export const OUTLINE = 0;
export const DEEP = 1;
export const SHADE = 2;
export const HALF = 3;
export const LIT = 4;
export const HIGH = 5;
export const SHADES = 6;

export interface Palette {
  /** A colour as bytes. */
  rgb(ramp: number, shade: number): [number, number, number];
  /** Every colour in one row (index = ramp · 6 + shade), read exactly: nearest, no colour space. */
  texture: THREE.DataTexture;
  /** A ramp's id by its name; throws `WalkDataError` for a name the palette lacks. */
  ramp(name: string): number;
  /** How many colours there are. */
  size: number;
}

export function makePalette(ix: WalkIndex): Palette {
  const { names, rgb } = ix.palette;
  const ids = new Map(names.map((name, i) => [name, i]));
  const size = names.length * SHADES;
  const data = new Uint8Array(size * 4);
  for (let c = 0; c < size; c++) {
    data[c * 4] = rgb[c * 3];
    data[c * 4 + 1] = rgb[c * 3 + 1];
    data[c * 4 + 2] = rgb[c * 3 + 2];
    data[c * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;

  return {
    rgb(ramp, shade) {
      const c = (ramp * SHADES + Math.max(0, Math.min(SHADES - 1, shade))) * 3;
      return [rgb[c], rgb[c + 1], rgb[c + 2]];
    },
    texture,
    ramp(name) {
      const id = ids.get(name);
      if (id === undefined) throw new WalkDataError(`palette: no ramp named ${name}`);
      return id;
    },
    size,
  };
}

// ---- ground kinds and their paints, after the tile renderer's (`render/ground.ts`)

/** Ground kinds, as the scene numbers them (`scene/kinds.ts`). */
export const G = {
  Water: 0,
  Land: 1,
  Scrub: 10,
  Wetland: 11,
  Park: 12,
  Cemetery: 13,
  Forest: 14,
  Lawn: 15,
  Garden: 16,
  Sand: 17,
  Rock: 18,
  Fairway: 19,
  GolfGreen: 20,
  Bunker: 21,
  Lake: 30,
  Pier: 32,
  Path: 33,
  Rail: 34,
  Road: 36,
  Highway: 38,
  Snow: 41,
  Meadow: 44,
  RedRock: 45,
} as const;
export const isWaterKind = (kind: number) => kind === G.Water || kind === G.Lake;
/** Added to a ground paint's pattern: no damp band by the water (a pier's deck, whatever paints it). */
export const PAINT_DRY = 4;

/**
 * Ground kind → paint: [colour ramp, shade, alternate ramp, shade, how often the alternate,
 * pattern (0 speckle, 1 paving grid, 2 mown stripes, 3 a street)], after `render/ground.ts`.
 */
type Paint = readonly [string, number, string, number, number, number];
const WATER_PAINT: Paint = ["water", LIT, "water", HIGH, 0.04, 0];
const ROAD_PAINT: Paint = ["asphalt", LIT, "asphalt", HALF, 0.015, 3];
const DEFAULT_PAINT: Paint = ["pavement", LIT, "pavement", HALF, 0.02, 0];
const KIND: Record<number, Paint> = {
  0: WATER_PAINT,
  1: DEFAULT_PAINT,
  2: DEFAULT_PAINT,
  3: ["concrete", LIT, "concrete", HALF, 0.03, 0],
  4: ["gravel", LIT, "gravel", HALF, 0.12, 0],
  5: ["dirt", LIT, "dirt", HALF, 0.06, 0],
  6: ["concrete", HIGH, "concrete", LIT, 0, 1],
  7: ["cane", LIT, "caneYoung", LIT, 0, 2],
  8: ["terraRoxa", LIT, "terraRoxa", HALF, 0.12, 0],
  9: ["steppe", LIT, "steppeDark", LIT, 0.06, 0],
  10: ["scrub", LIT, "scrub", HALF, 0.12, 0],
  11: ["wetland", LIT, "waterShallow", HALF, 0.1, 0],
  12: ["park", LIT, "lawn", LIT, 0.18, 0],
  13: ["park", LIT, "greyStone", HIGH, 0.02, 0],
  14: ["forest", LIT, "forest", HALF, 0.12, 0],
  15: ["lawn", LIT, "lawn", HIGH, 0.03, 0],
  16: ["lawn", LIT, "rose", HIGH, 0.06, 0],
  17: ["sand", LIT, "sand", HIGH, 0.06, 0],
  18: ["rock", LIT, "rock", HALF, 0.12, 0],
  19: ["lawn", LIT, "lawn", HIGH, 0, 2],
  20: ["lawn", HIGH, "lawn", HIGH, 0, 0],
  21: ["sand", LIT, "sand", HIGH, 0.06, 0],
  22: ["lawn", LIT, "park", LIT, 0, 2],
  23: ["lawn", LIT, "dirt", LIT, 0, 2],
  24: ["court", LIT, "court", LIT, 0, 0],
  25: ["courtGreen", LIT, "courtGreen", LIT, 0, 0],
  26: ["track", LIT, "track", LIT, 0, 0],
  27: ["dirt", HIGH, "carRed", LIT, 0.03, 0],
  28: ["plaza", LIT, "plaza", HALF, 0, 1],
  29: ["asphaltLight", LIT, "asphaltLight", HALF, 0.03, 0],
  30: WATER_PAINT,
  31: ["pool", LIT, "foam", HIGH, 0.02, 0],
  32: ["pier", LIT, "pier", HALF, 0, 2],
  33: ["plaza", HIGH, "plaza", LIT, 0.05, 0],
  34: ["gravel", HALF, "darkStone", SHADE, 0.25, 0],
  35: ["asphaltLight", LIT, "asphaltLight", HALF, 0.03, 3],
  36: ROAD_PAINT,
  37: ROAD_PAINT,
  38: ["asphaltDark", LIT, "asphaltDark", HALF, 0.05, 3],
  39: ["asphaltDark", HALF, "asphaltDark", LIT, 0.02, 3],
  40: ["asphalt", HALF, "asphalt", SHADE, 0.02, 0],
  41: ["snow", LIT, "snow", HALF, 0.01, 0],
  42: ["cobble", LIT, "cobble", HALF, 0.2, 0],
  43: ["dirtRoad", LIT, "dirtRoad", HALF, 0.1, 0],
  44: ["park", LIT, "lawn", LIT, 0.2, 0],
  45: ["redStone", LIT, "redStone", HALF, 0.12, 0],
};

/** Palette-index paints by ground kind, made once per palette. */
const paintCache = new WeakMap<Palette, Map<number, number[]>>();
export function groundPaint(palette: Palette, kind: number): number[] {
  let cache = paintCache.get(palette);
  if (!cache) paintCache.set(palette, (cache = new Map()));
  let p = cache.get(kind);
  if (!p) {
    const [a, as, b, bs, often, pattern] = KIND[kind] ?? DEFAULT_PAINT;
    p = [palette.ramp(a) * SHADES + as, palette.ramp(b) * SHADES + bs, often, pattern];
    cache.set(kind, p);
  }
  return p;
}
