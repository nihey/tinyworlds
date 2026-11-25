/**
 * The traffic lights: one cycle for the whole city, every node in step. Phase 0 runs along a
 * node's bearing (its widest street), phase 1 across it, half a cycle later; a node's cars and
 * its people read the same clock, so a crosswalk's "walk" and the cars it crosses never meet.
 */

/** Seconds of one whole cycle. */
export const CYCLE = 34;
/** Seconds of green, then of yellow, at the start of a phase's turn; red for the rest. */
export const GREEN = 13;
export const YELLOW = 3;

export type Signal = "green" | "yellow" | "red";

/** Where in its own cycle a phase is at time t, seconds from 0 to CYCLE. */
function within(t: number, phase: 0 | 1): number {
  const x = (t - (phase === 1 ? CYCLE / 2 : 0)) % CYCLE;
  return x < 0 ? x + CYCLE : x;
}

/** The light a phase shows at time t (seconds): green on [0, 13), yellow [13, 16), red [16, 34); phase 1 17 s later. */
export function signal(t: number, phase: 0 | 1): Signal {
  const x = within(t, phase);
  return x < GREEN ? "green" : x < GREEN + YELLOW ? "yellow" : "red";
}

/** Seconds of green left for a phase at time t; 0 on yellow and red. */
export function greenLeft(t: number, phase: 0 | 1): number {
  const x = within(t, phase);
  return x < GREEN ? GREEN - x : 0;
}

/**
 * The phase a way into a lights node runs with: along (0) when its heading at the node is within
 * 45° of the node's bearing, either way round (bearings are modulo π), else across (1). Headings
 * and bearings are radians from north, clockwise.
 */
export function phaseOf(bearing: number, heading: number): 0 | 1 {
  let d = (heading - bearing) % Math.PI;
  if (d < 0) d += Math.PI;
  return Math.min(d, Math.PI - d) <= Math.PI / 4 ? 0 : 1;
}
