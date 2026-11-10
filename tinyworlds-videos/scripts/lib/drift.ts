/**
 * The drift every loop makes: the view leaves its opening framing, goes round an ellipse and
 * comes back to it, so the last frame hands over to the first. One place for its measures: the
 * plates are cut to cover it and the compositions move by it.
 */
export interface Drift {
  /** output px: the picture the loop shows */
  width: number;
  height: number;
  /** half-axes of the ellipse, output px */
  a: number;
  b: number;
  /** spare picture round the travel, output px */
  margin: number;
  /** plate px per output px: the plate is finer than the picture and drawn small, which keeps
   *  a slow move from shimmering */
  density: number;
}

export const CARD_DRIFT: Drift = { width: 1200, height: 630, a: 150, b: 75, margin: 8, density: 2 };
export const FLYOVER_DRIFT: Drift = { width: 1920, height: 1080, a: 260, b: 130, margin: 8, density: 2 };

/** The plate's size in output px. */
export function plateSize(drift: Drift): { width: number; height: number } {
  return {
    width: drift.width + 2 * (drift.a + drift.margin),
    height: drift.height + 2 * (drift.b + drift.margin),
  };
}
