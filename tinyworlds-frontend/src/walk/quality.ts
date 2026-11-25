/**
 * The walk's automatic quality: when it runs under 30 fps for 3 s, one step down, then another
 * 3 s to see. First the water's reflections (about one more drawing of the city), then fewer
 * people and cars (150 → 90 → 60 people, 70 → 45 → 30 cars), then bigger pixels, one size at a
 * time up to 5 (unless the visitor chose a size). It never steps back up during a walk: a phone
 * that was too slow once will be again in the next street, and quality that comes and goes
 * reads as a bug. The crowd it reached is kept for the visit's next walk (the screen keeps it,
 * as it keeps the pixel size). Pure: the screen feeds it frames and does what it says.
 */

export const SLOW_FPS = 30;
/** Seconds of frames measured at a time. */
export const SLOW_FOR = 3;
/** A frame longer than this is a gap (the tab was hidden, a breakpoint), not a slow frame. */
export const GAP = 1;
const PIXEL_AT_MOST = 5;

/** How many people and cars, from the walk as it starts to the fewest. */
export const CROWDS: readonly { people: number; cars: number }[] = [
  { people: 150, cars: 70 },
  { people: 90, cars: 45 },
  { people: 60, cars: 30 },
];

export type QualityStep = "reflections" | "crowd" | "pixel";

/** What can still be given up: whether the reflections are on, the pixel size and whether the visitor chose it. */
export interface QualityNow {
  reflections: boolean;
  pixel: number;
  pixelChosen: boolean;
}

export class QualityLadder {
  private frames = 0;
  private span = 0;

  /** `crowdLevel`: where an earlier walk of the visit left the crowd (an index into CROWDS). */
  constructor(private crowdLevel = 0) {
    this.crowdLevel = Math.max(0, Math.min(CROWDS.length - 1, Math.round(crowdLevel)));
  }

  /** How many people and cars the walk keeps now. */
  get crowd(): { people: number; cars: number } {
    return CROWDS[this.crowdLevel];
  }

  /** Where the crowd is on its rungs, to keep for the next walk. */
  get crowdAt(): number {
    return this.crowdLevel;
  }

  /** One frame of `dt` seconds (count only frames that should: the page in view, the streets in).
   * Answers the step to take now, if this frame ends a slow measure, else null. */
  frame(dt: number, now: QualityNow): QualityStep | null {
    if (!(dt > 0) || dt > GAP) return null;
    this.frames++;
    this.span += dt;
    if (this.span < SLOW_FOR) return null;
    const fps = this.frames / this.span;
    this.frames = 0;
    this.span = 0;
    if (fps >= SLOW_FPS) return null;
    if (now.reflections) return "reflections";
    if (this.crowdLevel < CROWDS.length - 1) {
      this.crowdLevel++;
      return "crowd";
    }
    if (!now.pixelChosen && now.pixel < PIXEL_AT_MOST) return "pixel";
    return null;
  }

  /** Starts measuring afresh (after the walk was put somewhere new, say). */
  reset(): void {
    this.frames = 0;
    this.span = 0;
  }
}
