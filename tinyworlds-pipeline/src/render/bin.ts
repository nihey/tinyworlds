import { PAINT_RANK } from "../scene/kinds.js";
import { PAD, SUN_DROP, type ChunkJob } from "./chunk.js";
import type { Scene } from "./scene.js";

export interface Rect {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

/** Distance from the city (metres) at a map position. */
export function fogDistance(scene: Scene, x: number, y: number): number {
  const { fog, geo } = scene;
  const sum = x / geo.k;
  const diff = (2 * y) / geo.k;
  const gx = Math.floor(((sum - diff) / 2 - fog.p0) / fog.cell);
  const gy = Math.floor(((sum + diff) / 2 - fog.q0) / fog.cell);
  if (gx < 0 || gy < 0 || gx >= fog.cols || gy >= fog.rows) return 1e9;
  return fog.d[gy * fog.cols + gx];
}

/** Nearest and farthest the rectangle gets to the city, sampled on a grid. */
export function fogRange(scene: Scene, rect: Rect, extraDown = 0): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  const steps = 8;
  for (let j = 0; j <= steps; j++) {
    for (let i = 0; i <= steps; i++) {
      const d = fogDistance(
        scene,
        rect.x0 + (rect.w * i) / steps,
        rect.y0 + ((rect.h + extraDown) * j) / steps,
      );
      if (d < min) min = d;
      if (d > max) max = d;
    }
  }
  return { min, max };
}

const LINE_BRIDGE = 1;

/** Sort ground polygons into paint order (by kind) and lines into theirs (bridges last, then by kind). */
export function orderJob(
  scene: Scene,
  ground: number[],
  lines: number[],
): { ground: Uint32Array; lines: Uint32Array } {
  const gk = scene.ground.kind;
  ground.sort((a, b) => PAINT_RANK[gk[a]] - PAINT_RANK[gk[b]] || a - b);
  const lk = scene.lines.kind;
  const lf = scene.lines.flags;
  lines.sort(
    (a, b) => (lf[a] & LINE_BRIDGE) - (lf[b] & LINE_BRIDGE) || PAINT_RANK[lk[a]] - PAINT_RANK[lk[b]] || a - b,
  );
  return { ground: Uint32Array.from(ground), lines: Uint32Array.from(lines) };
}

/**
 * The volumes that show in a rectangle, those whose shadows reach it, and the margins the renderer
 * needs for them. `among` (ascending volume ids) narrows the search to candidates found some
 * faster way; without it every volume is looked at.
 */
export function binVolumes(
  scene: Scene,
  rect: Rect,
  among?: ArrayLike<number>,
): { vols: number[]; casters: number[]; marginLeft: number; marginDown: number } {
  const { x0, y0, w, h } = rect;
  const x1 = x0 + w;
  const y1 = y0 + h;
  const count = among ? among.length : scene.vol.count;
  const at = among ? (n: number) => among[n] : (n: number) => n;

  const vols: number[] = [];
  const vb = scene.vol.bbox;
  let marginDown = 0;
  for (let n = 0; n < count; n++) {
    const v = at(n);
    const rise = scene.vol.top[v] + scene.vol.roofH[v] + 2;
    if (
      vb[v * 4] < x1 + 4 &&
      vb[v * 4 + 2] > x0 - 4 &&
      vb[v * 4 + 1] - rise < y1 + 4 &&
      vb[v * 4 + 3] > y0 - 4
    ) {
      vols.push(v);
      const below = Math.min(rise, vb[v * 4 + 3] - y0);
      if (below > marginDown) marginDown = below;
    }
  }

  const casters: number[] = [];
  let marginLeft = 0;
  for (let n = 0; n < count; n++) {
    const v = at(n);
    const rise = scene.vol.top[v] + scene.vol.roofH[v];
    const reach = rise / SUN_DROP + 2;
    if (
      vb[v * 4] < x1 + 4 &&
      vb[v * 4 + 2] + reach > x0 - 4 &&
      vb[v * 4 + 1] < y1 + marginDown + 4 &&
      vb[v * 4 + 3] > y0 - 4
    ) {
      casters.push(v);
      const left = x0 - vb[v * 4];
      if (left > marginLeft) marginLeft = Math.min(left, reach + (vb[v * 4 + 2] - vb[v * 4]));
    }
  }
  return { vols, casters, marginLeft, marginDown };
}

/** Everything one rectangle needs, found by brute force. Fine for a preview; the full run bins on a grid. */
export function binRect(scene: Scene, rect: Rect): ChunkJob {
  const { x0, y0, w, h } = rect;
  const x1 = x0 + w;
  const y1 = y0 + h;
  const k = scene.geo.k;

  const ground: number[] = [];
  const gb = scene.ground.bbox;
  for (let f = 0; f < scene.ground.count; f++) {
    if (
      gb[f * 4] < x1 + PAD &&
      gb[f * 4 + 2] > x0 - PAD &&
      gb[f * 4 + 1] < y1 + PAD &&
      gb[f * 4 + 3] > y0 - PAD
    )
      ground.push(f);
  }

  const lines: number[] = [];
  const lb = scene.lines.bbox;
  for (let f = 0; f < scene.lines.count; f++) {
    const m = PAD + scene.lines.width[f] * k;
    if (lb[f * 4] < x1 + m && lb[f * 4 + 2] > x0 - m && lb[f * 4 + 1] < y1 + m && lb[f * 4 + 3] > y0 - m)
      lines.push(f);
  }

  const { vols, casters, marginLeft, marginDown } = binVolumes(scene, rect);

  const trees: number[] = [];
  const txy = scene.trees.xy;
  for (let t = 0; t < scene.trees.count; t++) {
    const x = txy[t * 2];
    const y = txy[t * 2 + 1];
    if (x > x0 - PAD && x < x1 + PAD && y > y0 - PAD && y < y1 + PAD) trees.push(t);
  }

  const cables: number[] = [];
  const cb = scene.cab.bbox;
  for (let c = 0; c < scene.cab.count; c++) {
    if (cb[c * 4] < x1 + 2 && cb[c * 4 + 2] > x0 - 2 && cb[c * 4 + 1] < y1 + 2 && cb[c * 4 + 3] > y0 - 2)
      cables.push(c);
  }

  const range = fogRange(scene, rect, marginDown);
  return {
    x0,
    y0,
    w,
    h,
    ...orderJob(scene, ground, lines),
    vols: Uint32Array.from(vols),
    casters: Uint32Array.from(casters),
    trees: Uint32Array.from(trees),
    cables: Uint32Array.from(cables),
    marginLeft,
    marginDown,
    foggy: range.max > scene.fog.start - 300,
  };
}
