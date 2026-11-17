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
