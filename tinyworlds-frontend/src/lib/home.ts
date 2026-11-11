/**
 * The front page's small rules, without the page: how its hero goes round the worlds and when
 * it may move by itself, and how wide the "which city next?" tile is. Pure.
 */

/** How long the hero stays on a world before it moves on. */
export const SLIDE_MS = 8000;
/** How long one world's picture takes to give way to the next. */
export const FADE_MS = 600;

/** The slide `by` steps from `current`, going round at either end. */
export function stepSlide(current: number, by: number, count: number): number {
  if (!(count > 0)) return 0;
  return (((current + by) % count) + count) % count;
}

/**
 * How many columns the tile after a grid's cards takes: what is left of the last row, or a
 * whole row of its own when the cards fill theirs.
 */
export function tileSpan(cards: number, columns: number): number {
  if (!(columns > 1)) return 1;
  const over = cards % columns;
  return over === 0 ? columns : columns - over;
}

/** What the hero knows of the moment. */
export interface AdvanceState {
  /** how many worlds it shows */
  slides: number;
  /** the visitor asked for less motion */
  calm: boolean;
  /** or for less data */
  saveData: boolean;
  /** the page is behind another tab or window */
  hidden: boolean;
  /** the hero is on screen */
  inView: boolean;
  /** the pointer is on it */
  hovered: boolean;
  /** the focus is inside it */
  focused: boolean;
  /** the visitor has chosen a slide: the hero is theirs from then on */
  chosen: boolean;
}

/**
 * Whether the hero may move on by itself: only for someone who is watching it and has not
 * chosen a slide (nor is in the middle of choosing), and never for a visitor who asked for
 * less motion or less data. A choice by hand stops it for good: that is how a finger, which
 * has no hover, or a screen reader holds it, and what moves by itself can always be stopped.
 */
export function mayAdvance(state: AdvanceState): boolean {
  return (
    state.slides > 1 &&
    !state.calm &&
    !state.saveData &&
    !state.hidden &&
    state.inView &&
    !state.hovered &&
    !state.focused &&
    !state.chosen
  );
}

/**
 * Whether something is on screen, by what an `IntersectionObserver` just said. One delivery
 * can carry several entries (out of view and back in before the page got to listen): the last
 * is how things stand. Told nothing, it is as it `was`.
 */
export function lastSeen(entries: readonly { isIntersecting: boolean }[], was: boolean): boolean {
  return entries.at(-1)?.isIntersecting ?? was;
}
