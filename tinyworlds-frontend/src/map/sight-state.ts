/**
 * Which sight is lit, and whether it is pinned. The mouse hovers; a click (or a tap: a finger
 * has no hover) pins, so the sign stays and its link can be reached. Pure: the engine feeds it.
 */
export interface SightState {
  hovered: string | null;
  pinned: string | null;
  /** when the pointer left the hovered sight for open ground (it is held a moment), else null */
  leftAt: number | null;
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
  if (id !== null)
    return s.hovered === id && s.leftAt === null ? s : { ...s, hovered: id, leftAt: null };
  if (s.hovered === null) return s;
  if (s.leftAt === null) return { ...s, leftAt: now };
  return now - s.leftAt >= HOLD_MS ? { ...s, hovered: null, leftAt: null } : s;
}

/** The mouse left the map: nothing is hovered, at once. */
export function leave(s: SightState): SightState {
  return s.hovered === null ? s : { ...s, hovered: null, leftAt: null };
}

/** A click or a tap on this sight (null: on none). Pressing the pinned sight again lets it go. */
export function press(s: SightState, id: string | null): SightState {
  const pinned = id === null || id === s.pinned ? null : id;
  return pinned === s.pinned ? s : { ...s, pinned };
}

/** A finger's tap: a press, and the end of any hover a mouse left behind (a finger has none). */
export function tap(s: SightState, id: string | null): SightState {
  return press(leave(s), id);
}

/** Esc or the sign's close button. */
export function release(s: SightState): SightState {
  return s.pinned === null ? s : { ...s, pinned: null };
}

/** What is lit: the pinned sight over the hovered one. */
export function shown(s: SightState): { id: string; pinned: boolean } | null {
  if (s.pinned !== null) return { id: s.pinned, pinned: true };
  if (s.hovered !== null) return { id: s.hovered, pinned: false };
  return null;
}
