/** The wasted screen's timeline, in seconds from the moment you go down. */
export const WASTED = { slowFor: 1.5, slowRate: 0.25, wordAt: 1.2, holdFor: 2.5, fadeFor: 0.6 };

/** How long the word takes to come up. */
const WORD_RISE = 0.3;
const TOTAL = WASTED.wordAt + WASTED.holdFor + WASTED.fadeFor;

/**
 * What the screen shows `t` seconds in. `timeRate` scales the world's clock, `grey` drains the
 * colours, `lift` raises the camera, `word` is the lettering's opacity. Reduced motion keeps the
 * word and the fade and drops the slow motion, the drain and the lift.
 */
export function wastedAt(
  t: number,
  reduced: boolean,
): {
  timeRate: number;
  grey: number;
  lift: number;
  word: number;
  skippable: boolean;
  done: boolean;
} {
  const rise = Math.min(1, Math.max(0, (t - WASTED.wordAt) / WORD_RISE));
  const fade = Math.min(1, Math.max(0, (TOTAL - t) / WASTED.fadeFor));
  const hold = WASTED.wordAt + WASTED.holdFor;
  return {
    timeRate: reduced || t >= WASTED.slowFor ? 1 : WASTED.slowRate,
    grey: reduced ? 0 : Math.min(1, Math.max(0, t / WASTED.slowFor)),
    lift: reduced ? 0 : Math.min(1, Math.max(0, t / hold)),
    word: Math.min(rise, fade),
    skippable: t >= WASTED.wordAt + WORD_RISE && t < TOTAL,
    done: t >= TOTAL,
  };
}
