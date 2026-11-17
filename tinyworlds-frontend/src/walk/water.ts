import { DEEP, HALF, HIGH, LIT, OUTLINE, SHADE } from "./render/palette";

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
/** Under this many, the light rim. */
export const RIM_STEPS = 3;
/** From this many, the deep shade; the base between. */
export const DEEP_STEPS = 7;

/** Darker away from the land: a teal band at the shore, a light rim, the base, then the deep. */
export function depthTone(shoreSteps: number): WaterTone {
  if (shoreSteps < SHALLOW_STEPS) return { ramp: "waterShallow", shade: LIT };
  if (shoreSteps < RIM_STEPS) return { ramp: "water", shade: LIT };
  if (shoreSteps < DEEP_STEPS) return { ramp: "water", shade: HALF };
  return { ramp: "water", shade: SHADE };
}

/**
 * How grazing a look at the water (1 − |the view's slope|) lightens it a shade, then two: far
 * water mirrors the sky, while at your feet you see into it.
 */
export const GRAZE_ONE = 0.75;
export const GRAZE_TWO = 0.9;

/** Lighter at a grazing angle, up to the ramp's highlight; the shallow band keeps its own tone. */
export function skyTone(tone: WaterTone, grazing: number): WaterTone {
  if (tone.ramp !== "water") return tone;
  const lift = grazing >= GRAZE_TWO ? 2 : grazing >= GRAZE_ONE ? 1 : 0;
  return { ramp: "water", shade: Math.min(HIGH, tone.shade + lift) };
}

/** Brightness (0–255) from which a reflected pixel takes the reflection's lightest tone. */
export const LIGHT_CUT = 110;
/** The share of the darkest colours that reflect in the darkest tone. */
export const DARK_SHARE = 0.15;

/**
 * What stands by the water drawn again in three flat tones from the deep half of the water's
 * ramp: the darkest below `darkCut`, the middle below `LIGHT_CUT`, the lightest above. Where it
 * shows, the darker of it and the water wins, so a reflection never lights the water up.
 */
export function reflectTone(luma: number, darkCut: number): WaterTone {
  if (luma < darkCut) return { ramp: "water", shade: OUTLINE };
  if (luma < LIGHT_CUT) return { ramp: "water", shade: DEEP };
  return { ramp: "water", shade: SHADE };
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

/** Land under this many steps from the water (the shore line is at half a step: 2 m) is damp, a shade darker. */
export const DAMP_STEPS = 1.5;

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
