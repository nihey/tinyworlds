/**
 * Where bridge decks stay up.
 *
 * A deck's height comes from the water under it: it climbs as it leaves the shore (`deckHeight`
 * in build.ts). Taken point by point, that brings a bridge down onto every piece of land it
 * merely passes over, an island in the middle of a river included. A bridge only comes down
 * where it ends, so the heights are settled here for each bridge as a whole.
 */

/** One mapped piece of a bridge, as it is laid: step by step from one end to the other. */
export interface DeckRun {
  /** The joints at its two ends. Pieces that share a joint are one bridge. */
  a: number;
  b: number;
  /** The deck's height (metres) at each step from `a` to `b`. */
  h: number[];
}

/**
 * Hold the decks up where a bridge only passes over land: between two crossings it stays at the
 * lower of their crests instead of dipping to the ground.
 *
 * The ground is where a bridge stops: a joint that only one piece reaches. From any step, the
 * deck is as high as the lowest crest it must get over on its way to the ground, whichever way
 * it goes. So a ramp down to an island still lets the bridge land there, an ordinary bridge is
 * left as it is, and no deck is ever lowered.
 *
 * Changes the heights in place and returns how many steps were raised.
 */
export function holdDecks(runs: DeckRun[]): number {
  const index = new Map<number, number>();
  const at = (joint: number): number => {
    let i = index.get(joint);
    if (i === undefined) {
      i = index.size;
      index.set(joint, i);
    }
    return i;
  };
  const ends = runs.map((r): [number, number] => [at(r.a), at(r.b)]);
  const n = index.size;
  const reached = new Uint32Array(n);
  for (const [a, b] of ends) {
    reached[a]++;
    reached[b]++;
  }

  // `pass[j]`: the lowest crest between joint j and the ground. Found by joining the pieces
  // lowest crest first: a group of joints learns its pass when it first joins one that is grounded.
  const pass = new Float64Array(n).fill(Infinity);
  const root = Int32Array.from({ length: n }, (_, j) => j);
  const members: number[][] = Array.from({ length: n }, (_, j) => [j]);
  const grounded = new Uint8Array(n);
  for (let j = 0; j < n; j++)
    if (reached[j] === 1) {
      grounded[j] = 1;
      pass[j] = 0;
    }
  const crest = runs.map((r) => r.h.reduce((top, h) => Math.max(top, h), 0));
  const lowestFirst = runs.map((_, i) => i).sort((x, y) => crest[x] - crest[y]);
  for (const i of lowestFirst) {
    let big = root[ends[i][0]];
    let small = root[ends[i][1]];
    if (big === small) continue;
    if (members[big].length < members[small].length) [big, small] = [small, big];
    if (grounded[big] !== grounded[small])
      for (const j of members[grounded[big] ? small : big]) pass[j] = crest[i];
    for (const j of members[small]) {
      root[j] = big;
      members[big].push(j);
    }
    members[small] = [];
    grounded[big] |= grounded[small];
  }
  // bridges that come down nowhere (a ring) have nothing to be held up from
  for (let j = 0; j < n; j++) if (pass[j] === Infinity) pass[j] = 0;

  let raised = 0;
  runs.forEach((r, i) => {
    const steps = r.h.length;
    const viaA = pass[ends[i][0]];
    const viaB = pass[ends[i][1]];
    // the highest point from each step on to the end of the piece
    const ahead = new Float64Array(steps + 1);
    for (let s = steps - 1; s >= 0; s--) ahead[s] = Math.max(ahead[s + 1], r.h[s]);
    let behind = 0;
    for (let s = 0; s < steps; s++) {
      behind = Math.max(behind, r.h[s]);
      const held = Math.min(Math.max(behind, viaA), Math.max(ahead[s], viaB));
      if (held > r.h[s] + 1e-9) raised++;
      r.h[s] = held;
    }
  });
  return raised;
}

/** A piece of a bridge as a path: how long it is, and how far along it each of its steps lies. */
export interface DeckPath {
  a: number;
  b: number;
  /** Its length from `a` to `b`, metres. */
  length: number;
  /** The distance from `a` to the middle of each step. */
  at: number[];
}

/**
 * How far every step is, travelling along the bridges, from the nearest marked step: across the
 * joints, whichever way is shorter. With nothing marked it measures to the ground instead, which
 * is where a bridge stops (a joint that only one piece reaches). Infinity where no way leads.
 */
export function distanceAlong(paths: DeckPath[], marked?: boolean[][]): number[][] {
  const index = new Map<number, number>();
  const at = (joint: number): number => {
    let i = index.get(joint);
    if (i === undefined) {
      i = index.size;
      index.set(joint, i);
    }
    return i;
  };
  const ends = paths.map((path): [number, number] => [at(path.a), at(path.b)]);
  const n = index.size;

  // how far each joint is from the nearest of what is measured to
  const reach = new Float64Array(n).fill(Infinity);
  if (marked) {
    paths.forEach((path, i) => {
      const first = marked[i].indexOf(true);
      if (first < 0) return;
      const last = marked[i].lastIndexOf(true);
      reach[ends[i][0]] = Math.min(reach[ends[i][0]], path.at[first]);
      reach[ends[i][1]] = Math.min(reach[ends[i][1]], path.length - path.at[last]);
    });
  } else {
    const reached = new Uint32Array(n);
    for (const [a, b] of ends) {
      reached[a]++;
      reached[b]++;
    }
    for (let j = 0; j < n; j++) if (reached[j] === 1) reach[j] = 0;
  }
  // from joint to joint along the pieces, until no shorter way turns up
  for (let shorter = true; shorter;) {
    shorter = false;
    for (let i = 0; i < paths.length; i++) {
      const [a, b] = ends[i];
      const length = paths[i].length;
      if (reach[a] + length < reach[b]) {
        reach[b] = reach[a] + length;
        shorter = true;
      }
      if (reach[b] + length < reach[a]) {
        reach[a] = reach[b] + length;
        shorter = true;
      }
    }
  }

  return paths.map((path, i) => {
    const [a, b] = ends[i];
    const out = path.at.map((s) => Math.min(reach[a] + s, reach[b] + path.length - s));
    if (marked) {
      // and to the marked steps of the piece itself
      let seen = -Infinity;
      for (let s = 0; s < out.length; s++) {
        if (marked[i][s]) seen = path.at[s];
        out[s] = Math.min(out[s], path.at[s] - seen);
      }
      seen = Infinity;
      for (let s = out.length - 1; s >= 0; s--) {
        if (marked[i][s]) seen = path.at[s];
        out[s] = Math.min(out[s], seen - path.at[s]);
      }
    }
    return out;
  });
}
