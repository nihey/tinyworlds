import { readScene, type Arr } from "../scene/store.js";
import type { Geo } from "../projection.js";
import type { Flora } from "./sprites.js";

/** The scene as the renderer sees it: typed arrays over shared memory plus a little metadata. */
export interface Scene {
  ground: Poly & { kind: Uint8Array };
  lines: {
    vertStart: Uint32Array;
    xy: Float32Array;
    bbox: Float32Array;
    kind: Uint8Array;
    flags: Uint8Array;
    width: Float32Array;
    count: number;
  };
  vol: Poly & {
    base: Float32Array;
    top: Float32Array;
    roofH: Float32Array;
    roofShape: Uint8Array;
    wall: Uint8Array;
    roof: Uint8Array;
    glass: Uint8Array;
    pattern: Uint8Array;
    flags: Uint8Array;
    seed: Uint32Array;
    ridge: Float32Array;
    center: Float32Array;
    area: Float32Array;
  };
  trees: { xy: Float32Array; kind: Uint8Array; count: number };
  /**
   * Bridge cables and trusses: 3D paths as (x, ground y, rise) triples. Kind 0 is a main cable,
   * 1 a suspender, 2 a truss chord, 3 a lesser truss member.
   */
  cab: { start: Uint32Array; xyz: Float32Array; kind: Uint8Array; bbox: Float32Array; count: number };
  fog: {
    d: Float32Array;
    p0: number;
    q0: number;
    cell: number;
    cols: number;
    rows: number;
    start: number;
    end: number;
  };
  geo: Geo;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Which trees grow here: decides the odd crown that is not green. */
  flora: Flora;
  /** A framed world: nothing is drawn outside this rectangle of map px (max edges exclusive). */
  clip?: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface Poly {
  ringStart: Uint32Array;
  vertStart: Uint32Array;
  xy: Float32Array;
  bbox: Float32Array;
  count: number;
}

export interface SceneData {
  arrays: Record<string, Arr>;
  meta: Record<string, unknown>;
}

/** Assemble the typed view from raw arrays (which may have crossed a thread boundary). */
export function sceneFrom(data: SceneData): Scene {
  const a = data.arrays;
  const meta = data.meta as {
    geo: Geo;
    bounds: Scene["bounds"];
    fog: Omit<Scene["fog"], "d">;
    flora?: Flora;
    clip?: Scene["clip"];
  };
  const poly = (prefix: string): Poly => ({
    ringStart: a[`${prefix}.ringStart`] as Uint32Array,
    vertStart: a[`${prefix}.vertStart`] as Uint32Array,
    xy: a[`${prefix}.xy`] as Float32Array,
    bbox: a[`${prefix}.bbox`] as Float32Array,
    count: a[`${prefix}.ringStart`].length - 1,
  });
  return {
    ground: { ...poly("ground"), kind: a["ground.kind"] as Uint8Array },
    lines: {
      vertStart: a["lines.vertStart"] as Uint32Array,
      xy: a["lines.xy"] as Float32Array,
      bbox: a["lines.bbox"] as Float32Array,
      kind: a["lines.kind"] as Uint8Array,
      flags: a["lines.flags"] as Uint8Array,
      width: a["lines.width"] as Float32Array,
      count: a["lines.kind"].length,
    },
    vol: {
      ...poly("vol"),
      base: a["vol.base"] as Float32Array,
      top: a["vol.top"] as Float32Array,
      roofH: a["vol.roofH"] as Float32Array,
      roofShape: a["vol.roofShape"] as Uint8Array,
      wall: a["vol.wall"] as Uint8Array,
      roof: a["vol.roof"] as Uint8Array,
      glass: a["vol.glass"] as Uint8Array,
      pattern: a["vol.pattern"] as Uint8Array,
      flags: a["vol.flags"] as Uint8Array,
      seed: a["vol.seed"] as Uint32Array,
      ridge: a["vol.ridge"] as Float32Array,
      center: a["vol.center"] as Float32Array,
      area: a["vol.area"] as Float32Array,
    },
    trees: {
      xy: a["trees.xy"] as Float32Array,
      kind: a["trees.kind"] as Uint8Array,
      count: a["trees.kind"].length,
    },
    cab: {
      start: a["cab.start"] as Uint32Array,
      xyz: a["cab.xyz"] as Float32Array,
      kind: a["cab.kind"] as Uint8Array,
      bbox: a["cab.bbox"] as Float32Array,
      count: a["cab.kind"].length,
    },
    fog: { ...meta.fog, d: a["fog.d"] as Float32Array },
    geo: meta.geo,
    bounds: meta.bounds,
    flora: meta.flora ?? "temperate",
    clip: meta.clip,
  };
}

export function loadScene(dir: string): { scene: Scene; data: SceneData } {
  const data = readScene(dir);
  return { scene: sceneFrom(data), data };
}
