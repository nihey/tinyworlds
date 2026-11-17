import { HALF, LIT, OUTLINE, SHADE } from "./render/palette";

/**
 * The water's rules, layer by layer: each picks one palette tone per pixel, never a blend
 * (blending is what turns pixel-art water to mush). The water shader (`render/materials.ts`)
 * does the same sums with these numbers; they are here to be read and tested.
 *
 * Distances to the shore are in the data's steps: 2 m cells, 0 on land, so the shore line
 * itself, halfway between a land cell and a water cell, is at half a step.
 */

/** Seconds: every motion on the water makes a whole number of cycles in this, so nothing jumps when it wraps. */
export const LOOP = 5;

export type WaterRamp = "water" | "waterShallow" | "foam";
export type WaterTone = { ramp: WaterRamp; shade: number };

/** Under this many steps from the land, the shallow band: the first row of water cells, about 2 m. */
export const SHALLOW_STEPS = 1.5;
/** The shallow band is at most this many pixels across, so near the shore it stays a thin rim. */
export const SHALLOW_PX = 6;
/** Under this many, the light rim. */
export const RIM_STEPS = 3;
/** From this many, the deep shade; the base between. */
export const DEEP_STEPS = 7;

/**
 * Darker away from the land: a teal band at the shore, a light rim, the base, then the deep
 * (lightened towards the horizon: `skyTone`).
 */
export function depthTone(shoreSteps: number): WaterTone {
  if (shoreSteps < SHALLOW_STEPS) return { ramp: "waterShallow", shade: LIT };
  if (shoreSteps < RIM_STEPS) return { ramp: "water", shade: LIT };
  if (shoreSteps < DEEP_STEPS) return { ramp: "water", shade: HALF };
  return { ramp: "water", shade: SHADE };
}

/**
 * The depth shows as the shore says, at any angle: darker away from the land, from a bridge as
 * from the water (an angle that let it show only at middle angles drew a dark ring round anyone
 * looking down from a bridge). Only towards the horizon, how grazing the look is (1 − |the
 * view's slope|) lets the sky it mirrors take the depth back a shade at a time (`GRAZE_ONE`,
 * about 6° under the horizon, then `GRAZE_TWO`, about 3°), up to the map's water. So along any
 * look outwards the water's tone changes with the shore, then only lightens.
 */
export const GRAZE_ONE = 0.9;
export const GRAZE_TWO = 0.95;

/** The depth's tone as the angle shows it; the shallow band keeps its own tone. */
export function skyTone(tone: WaterTone, grazing: number): WaterTone {
  if (tone.ramp !== "water") return tone;
  const lift = grazing >= GRAZE_TWO ? 2 : grazing >= GRAZE_ONE ? 1 : 0;
  const depth = Math.max(0, LIT - tone.shade);
  return { ramp: "water", shade: LIT - Math.max(0, depth - lift) };
}

/**
 * Where two tones meet, the shader does not draw a hard line: each threshold is crossed over a
 * few pixels in a 4 × 4 Bayer pattern (still one palette colour per pixel). The pattern's
 * thresholds, row by row.
 */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
/** Pixels over which a threshold between two tones is dithered. */
export const DITHER_PX = 3;

/**
 * Whether `x` is past the threshold `t` at a pixel whose Bayer cell is `b` (0–1): over `w`
 * (the threshold's width, as much of `x` as `DITHER_PX` pixels hold) a growing share of cells.
 */
export function dithered(x: number, t: number, w: number, b: number): 0 | 1 {
  if (!(w > 0)) return x > t ? 1 : 0;
  return Math.max(0, Math.min(1, (x - t) / w + 0.5)) > b ? 1 : 0;
}

/** Brightness (0–255) from which a reflected pixel takes the reflection's lightest tone. */
export const LIGHT_CUT = 110;
/** The share of the darkest colours that reflect in the darkest tone. */
export const DARK_SHARE = 0.15;

/**
 * What stands by the water drawn again in three flat tones, by its brightness: the darkest
 * (below `darkCut`) three shades under the water it lies on, the middle (below `LIGHT_CUT`) two,
 * the lightest one. So a reflection always shows, whatever band of the water it crosses: on the
 * map's water, the deep, the deep shade (the deep water's own) and a shade under the base.
 */
export function reflectTone(luma: number, darkCut: number, water: WaterTone): WaterTone {
  const under = luma < darkCut ? 3 : luma < LIGHT_CUT ? 2 : 1;
  return { ramp: water.ramp, shade: Math.max(OUTLINE, water.shade - under) };
}

/**
 * Where the shallow band ends, in steps from the land (the shore line is at half a step), given
 * how many steps a pixel spans there: the 2 m band, but never more than `SHALLOW_PX` pixels.
 */
export function shallowUntil(stepsPerPixel: number): number {
  return 0.5 + Math.min(SHALLOW_STEPS - 0.5, SHALLOW_PX * Math.max(0, stepsPerPixel));
}

/** Metres over the water within which a reflected thing is at its waterline: where the broken light line goes. */
export const FOOT_HEIGHT = 0.4;

/** Shades a reflection lightens by from no fog to all fog along its mirrored path: it goes into the water's own tone a shade at a time. */
export const MIRROR_FOG_SHADES = 3;

/** The brightness under which the darkest `share` of these lie: the reflections' dark cut. */
export function darkCutOf(lumas: readonly number[], share = DARK_SHARE): number {
  if (lumas.length === 0) return 0;
  const sorted = [...lumas].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

/** Rows of a reflection under its foot that stay still, so it stays attached to what it mirrors. */
export const WOBBLE_STILL = 3;
/** Rows up to which a reflection moves one pixel at most; two beyond. */
export const WOBBLE_ONE = 30;
/** Waves per loop, and rows from crest to crest. */
export const WOBBLE_CYCLES = 2;
export const WOBBLE_WAVE = 9;

/** Whole pixels a reflection's row moves sideways, `rowsFromBase` rows under its foot, at time t on screen row y. */
export function wobble(rowsFromBase: number, t: number, y: number): number {
  const amp = rowsFromBase < WOBBLE_STILL ? 0 : rowsFromBase < WOBBLE_ONE ? 1 : 2;
  if (amp === 0) return 0;
  const period = LOOP / WOBBLE_CYCLES;
  const phase = mod(t, period) / period + y / WOBBLE_WAVE;
  return Math.floor(amp * Math.sin(2 * Math.PI * phase) + 0.5);
}

/**
 * Which texel of a mirror row the pixel at x shows (the shader's rule): its own moved by its own
 * wobble; where its own texel is sky, the nearest neighbour within two whose wobble lands on x,
 * so a reflection a texel or two wide (a thin column, a cable) keeps its pixels as it sways;
 * null for sky. `rowsAt` is a texel's rows under its foot, null where it is sky.
 */
export function mirrorSource(
  x: number,
  rowsAt: (x: number) => number | null,
  t: number,
  y: number,
): number | null {
  const own = rowsAt(x);
  if (own !== null) {
    const at = x + wobble(own, t, y);
    return rowsAt(at) === null ? null : at;
  }
  for (const k of [-1, 1, -2, 2]) {
    const rows = rowsAt(x + k);
    if (rows !== null && wobble(rows, t, y) === k) return x + k;
  }
  return null;
}

/** Pixels across the shore's lines (the lapping, the quiet shore's dark edge), whatever the distance. */
export const LINE_PX = 2;

/** The lapping line's two rings, in steps from the land, and how often it steps out and back per loop. */
export const LAP_NEAR = 2;
export const LAP_FAR = 3;
export const LAP_CYCLES = 2;
/** The lapping dashes: metres from one to the next, the share of that drawn, and how many lengths they travel per loop. */
export const LAP_PERIOD = 5;
export const LAP_DASH = 0.55;
export const LAP_TRAVEL = 1;

/** Which ring the lapping line is on at time t: out to the far one and back, twice a loop. */
export function lapRing(t: number): 2 | 3 {
  const period = LOOP / LAP_CYCLES;
  return mod(t, period) < period / 2 ? LAP_NEAR : LAP_FAR;
}

/**
 * The living surface: short horizontal dashes a shade lighter or darker than the water under
 * them, one in some of the squares of a world grid (so they stay where they are as you move),
 * each drifting a little and showing for part of the loop. The squares are `SURFACE_CELL`
 * metres near, twice as big a level up wherever they would be under `SURFACE_ACROSS` pixels
 * across or `SURFACE_DOWN` pixels down, so the dashes stay a few pixels apart and do not crawl:
 * denser and finer with distance. A level's squares are shared with the next by hash, so the
 * levels hand over without a seam.
 */
export const SURFACE_CELL = 0.4;
export const SURFACE_ACROSS = 10;
export const SURFACE_DOWN = 1.5;
/** The share of squares with a dash, and of the loop each one shows for. */
export const SURFACE_SHARE = 0.6;
export const SURFACE_SHOWN = 0.7;

/** The level of the surface's squares where they must be at least this many metres. */
export function surfaceLevel(metres: number): number {
  return Math.log2(Math.max(metres, SURFACE_CELL) / SURFACE_CELL);
}

/** The longest dash at a level, pixels: up to 4 near, down to 1 far. */
export function dashSpan(level: number): number {
  return Math.max(1, Math.min(4, 4 - Math.floor(level / 2)));
}

/** Land under this many steps from the water is damp, a shade darker: the shore line is at half
 * a step, so the first metre of land (a 2 m band read heavy along piers, which are all edge). */
export const DAMP_STEPS = 1;

/**
 * Glints: each square of `GLINT_CELL` metres of open water may glint once a loop (this share
 * of them), at a moment and a spot of its own, new every loop; not on a reflection, and within
 * `GLINT_REACH` metres (a few lit at once on a wide view; farther they crowd the horizon).
 */
export const GLINT_CELL = 16;
export const GLINT_SHARE = 0.25;
export const GLINT_REACH = 120;
/** No glints where the water is seen flatter than this (1 − |the view's slope|): there they would crowd into a line along the horizon. */
export const GLINT_GRAZE = 0.97;
/** Seconds a glint lasts: 1, 3 and 5 pixels long, then split in two. */
export const GLINT_FOR = 0.6;

/** Whether the pixel `dx` from a glint's middle (on its row) is lit, `age` seconds into it. */
export function glint(age: number, dx: number): boolean {
  if (!(age >= 0 && age < GLINT_FOR)) return false;
  const frame = Math.floor(age / (GLINT_FOR / 4));
  const a = Math.abs(dx);
  if (frame === 0) return a === 0;
  if (frame === 1) return a <= 1;
  if (frame === 2) return a <= 2;
  return a === 2 || a === 3;
}

/** Metres beyond which a shore is quiet. */
export const QUIET_FAR = 150;
/** A shore whose face takes less of the sun than this (−1 to 1) is in shade, and quiet. */
export const SHADE_LIGHT = -0.25;

/**
 * Whether a shore is quiet (no bright lapping, which far off reads as a neon outline; a dark
 * line where the water meets it instead): `distance` metres from the eye, `light` how much its
 * face turns to the sun (−1 away, 1 towards; the walls' rule for lit, half and shade).
 */
export function quietShore(distance: number, light: number): boolean {
  return distance > QUIET_FAR || light < SHADE_LIGHT;
}

const mod = (a: number, b: number) => a - b * Math.floor(a / b);
