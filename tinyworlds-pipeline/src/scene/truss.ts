/**
 * The steel of a cantilever bridge, in elevation.
 *
 * Towers stand in a row; from the top of each the upper chord sweeps down towards the middle of
 * the spans beside it, steeply first and then flattening, and the deck runs level underneath. In
 * between, the truss is posts at every panel point, crossed braces, and lesser chords where it is
 * deep enough to need tiers. Everything here is (station along the bridge, height) in metres; the
 * scene builder stands one of these on each side of the roadway.
 */

/** An anchor arm reaches this share of the span beside it past an outer tower. */
const ARM = 0.42;
/** The length of a panel, roughly. */
const BAY = 15;
/** The height of a tier of braces. */
const TIER = 24;
/** How deep the truss still is where the top chord is lowest. */
const SHALLOW = 14;
/** How fast the top chord flattens on its way out from a tower. */
const SWEEP = 1.8;

export interface TrussSpec {
  /** Where the towers stand along the bridge, ascending. */
  towers: number[];
  /** The tops of the towers. */
  top: number;
  /** The level of the deck. */
  deck: number;
}

export interface Truss {
  /** Where the steel begins and ends. */
  from: number;
  to: number;
  /** The height of the top chord at a station (the deck's, outside the steel). */
  topAt(s: number): number;
  /** The panel points, the towers and both ends among them. */
  panels: number[];
  /** The top chord and the bottom one: flat [s0, z0, s1, z1, …] paths. */
  chords: number[][];
  /** Posts, braces and the lesser chords: [s0, z0, s1, z1] each. */
  members: number[][];
}

export function cantileverTruss({ towers, top, deck }: TrussSpec): Truss {
  const last = towers.length - 1;
  const from = towers[0] - ARM * (towers[1] - towers[0]);
  const to = towers[last] + ARM * (towers[last] - towers[last - 1]);
  // an arm reaches half the longest span: there the chord is at its lowest
  let reach = 0;
  for (let i = 1; i <= last; i++) reach = Math.max(reach, (towers[i] - towers[i - 1]) / 2);

  const topAt = (s: number): number => {
    if (s < from || s > to) return deck;
    let out = Infinity;
    for (const tower of towers) out = Math.min(out, Math.abs(s - tower));
    return deck + SHALLOW + (top - deck - SHALLOW) * Math.max(0, 1 - out / reach) ** SWEEP;
  };

  // panels: each arm and each span cut into equal bays
  const panels: number[] = [];
  const stops = [from, ...towers, to];
  for (let i = 0; i + 1 < stops.length; i++) {
    const bays = Math.max(1, Math.round((stops[i + 1] - stops[i]) / BAY));
    for (let b = i === 0 ? 0 : 1; b <= bays; b++)
      panels.push(b === bays ? stops[i + 1] : stops[i] + ((stops[i + 1] - stops[i]) * b) / bays);
  }

  const upper: number[] = [];
  for (const s of panels) upper.push(s, topAt(s));
  const chords = [upper, [from, deck, to, deck]];

  const members: number[][] = [];
  for (const s of panels) members.push([s, deck, s, topAt(s)]);
  for (let i = 0; i + 1 < panels.length; i++) {
    const s0 = panels[i];
    const s1 = panels[i + 1];
    const t0 = topAt(s0);
    const t1 = topAt(s1);
    for (let floor = deck; floor < Math.max(t0, t1) - 3; floor += TIER) {
      const ceiling = floor + TIER;
      // the bay's corners in this tier: its roof is the tier above, or the chord where that is lower
      const left = Math.min(t0, ceiling);
      const right = Math.min(t1, ceiling);
      // a brace needs its foot under the chord too: where the chord has already come down below
      // this tier on one side, the chord itself closes the bay
      if (left - floor >= 3 && t1 >= floor) members.push([s0, left, s1, floor]);
      if (right - floor >= 3 && t0 >= floor) members.push([s0, floor, s1, right]);
      // the lesser chord along the top of the tier, as far as the top chord is still above it
      if (t0 > ceiling + 1 && t1 > ceiling + 1) members.push([s0, ceiling, s1, ceiling]);
      else if (t0 > ceiling + 1 || t1 > ceiling + 1) {
        const meets = s0 + ((s1 - s0) * (ceiling - t0)) / (t1 - t0);
        const tall = t0 > t1 ? s0 : s1;
        if (Math.abs(meets - tall) > 1) members.push([tall, ceiling, meets, ceiling]);
      }
    }
  }

  return { from, to, topAt, panels, chords, members };
}
