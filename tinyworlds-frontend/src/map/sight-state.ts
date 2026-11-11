/**
 * Which sight is lit, and whether it is pinned. The mouse hovers; a click (or a tap: a finger
 * has no hover) pins, so the sign stays and its link can be reached. Pure: the engine feeds it.
 */
export interface SightState {
  hovered: string | null;
  pinned: string | null;
  /** when the pointer left the hovered sight for open ground (it is held a moment), else null */
  leftAt: number | null;
  /**
   * A sight held lit by the page (a round of Guess the building), whatever the pointer does:
   * while there is one, nothing else lights up and nothing lets it go but the page. Absent: none.
   */
  held?: string | null;
}

/**
 * How long a sight stays lit after the pointer leaves it for open ground (ms): crossing the
 * street between two towers does not flash the whole map.
 */
export const HOLD_MS = 150;

/**
 * The pointer is over this sight at `now` (null: over none). Another sight takes over at once;
 * open ground lets the last one go only once it has been open ground for HOLD_MS. Unchanged
 * state comes back as it was.
 */
export function hover(s: SightState, id: string | null, now = 0): SightState {
  if (s.held) return s;
  if (id !== null)
    return s.hovered === id && s.leftAt === null ? s : { ...s, hovered: id, leftAt: null };
  if (s.hovered === null) return s;
  if (s.leftAt === null) return { ...s, leftAt: now };
  return now - s.leftAt >= HOLD_MS ? { ...s, hovered: null, leftAt: null } : s;
}

/** The mouse left the map: nothing is hovered, at once. */
export function leave(s: SightState): SightState {
  if (s.held) return s;
  return s.hovered === null ? s : { ...s, hovered: null, leftAt: null };
}

/** A click or a tap on this sight (null: on none). Pressing the pinned sight again lets it go. */
export function press(s: SightState, id: string | null): SightState {
  if (s.held) return s;
  const pinned = id === null || id === s.pinned ? null : id;
  return pinned === s.pinned ? s : { ...s, pinned };
}

/** A finger's tap: a press, and the end of any hover a mouse left behind (a finger has none). */
export function tap(s: SightState, id: string | null): SightState {
  if (s.held) return s;
  return press(leave(s), id);
}

/** Esc or the sign's close button. */
export function release(s: SightState): SightState {
  if (s.held) return s;
  return s.pinned === null ? s : { ...s, pinned: null };
}

/**
 * The view moved: a sight now wholly off screen lets go, pinned or hovered, so the map is not
 * left dimmed with nothing lit on it. Unchanged state comes back as it was.
 */
export function keepInView(s: SightState, inView: (id: string) => boolean): SightState {
  if (s.held) return s;
  const pinned = s.pinned !== null && !inView(s.pinned) ? null : s.pinned;
  const hoverGone = s.hovered !== null && !inView(s.hovered);
  if (pinned === s.pinned && !hoverGone) return s;
  return hoverGone ? { hovered: null, pinned, leftAt: null } : { ...s, pinned };
}

/** What is lit: the pinned sight over the hovered one. */
export function shown(s: SightState): { id: string; pinned: boolean } | null {
  if (s.held) return { id: s.held, pinned: true };
  if (s.pinned !== null) return { id: s.pinned, pinned: true };
  if (s.hovered !== null) return { id: s.hovered, pinned: false };
  return null;
}

/**
 * The page holds this sight lit (null: lets go). Whatever was hovered or pinned is dropped, so
 * when the hold ends nothing is lit.
 */
export function hold(s: SightState, id: string | null): SightState {
  if ((s.held ?? null) === id && s.hovered === null && s.pinned === null) return s;
  return { hovered: null, pinned: null, leftAt: null, held: id };
}
