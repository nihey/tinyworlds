import type { RoadNode, StreetEdge } from "./cell";
import { phaseOf, signal } from "./lights";
import { headingOf, lineOf, pointOn } from "./roads";

/**
 * The traffic signals you can see: a post at each way into a crossing with lights, at the
 * right-hand corner before the crossing, its lamps facing the cars that come, showing the phase
 * they stop by (the traffic's own rule: `phaseOf` of the node's bearing and the heading they
 * arrive with). No three.js.
 */

/** How far out from the kerb's line a post stands, m. */
const KERB_OUT = 0.6;

export interface SignalPost {
  e: number;
  n: number;
  z: number;
  /** the way its lamps face (towards the cars coming), radians from north clockwise */
  yaw: number;
  phase: 0 | 1;
}

/** Which lamp is lit at time t for a phase: 0 the red (top), 1 the yellow, 2 the green. */
export function lampLit(t: number, phase: 0 | 1): 0 | 1 | 2 {
  const s = signal(t, phase);
  return s === "red" ? 0 : s === "yellow" ? 1 : 2;
}

/**
 * The posts of a node with lights: one for each street cars arrive by (a one-way street leaving
 * it has none), `setback(edge)` metres back from the node along it (where its lanes stop), beside
 * its right-hand kerb.
 */
export function signalPosts(
  node: RoadNode,
  streets: Iterable<StreetEdge>,
  setback: (edge: StreetEdge) => number,
): SignalPost[] {
  const out: SignalPost[] = [];
  if (!node.lights) return out;
  for (const edge of streets) {
    if (edge.a === edge.b || (edge.a !== node.id && edge.b !== node.id)) continue;
    // traffic arriving at the node runs a to b when the node is b
    const forward = edge.b === node.id;
    if (forward ? edge.ow === -1 : edge.ow === 1) continue;
    const line = lineOf(edge, forward);
    const p = pointOn(line, Math.max(0, line.len - setback(edge)), edge.width / 2 + KERB_OUT);
    const arrive = headingOf(line, true);
    out.push({
      e: p.e,
      n: p.n,
      z: p.z,
      yaw: arrive + Math.PI,
      phase: phaseOf(node.bearing, arrive),
    });
  }
  return out;
}
