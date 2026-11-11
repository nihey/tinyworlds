/**
 * Which sight is lit, and whether it is pinned. The mouse hovers; a click (or a tap: a finger
 * has no hover) pins, so the sign stays and its link can be reached. Pure: the engine feeds it.
 */
export interface SightState {
  hovered: string | null;
  pinned: string | null;
}

/** The pointer is over this sight now (null: over none). Unchanged state comes back as it was. */
export function hover(s: SightState, id: string | null): SightState {
  return s.hovered === id ? s : { ...s, hovered: id };
}

/** A click or a tap on this sight (null: on none). Pressing the pinned sight again lets it go. */
export function press(s: SightState, id: string | null): SightState {
  const pinned = id === null || id === s.pinned ? null : id;
  return pinned === s.pinned ? s : { ...s, pinned };
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
