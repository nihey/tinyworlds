import type { ElevatedWay, Volume, WalkCell } from "../cell";
import { CELL } from "../geo";
import type { WalkIndex } from "../walk-index";
import { WalkWorld } from "../world";

/** A square with nothing in it, all land; `parts` fills in what a test needs. */
export function makeCell(i: number, j: number, parts: Partial<WalkCell> = {}): WalkCell {
  return {
    i,
    j,
    key: `${i}_${j}`,
    volumes: [],
    ground: [],
    ways: [],
    trees: new Float32Array(0),
    cables: [],
    mask: { mode: 0, bits: null },
    shore: null,
    nodes: [],
    streets: [],
    walks: [],
    elevated: [],
    moorings: [],
    ...parts,
  };
}

/** A rectangular building in world metres, from `base` to `top`. */
export function boxVolume(
  e0: number,
  n0: number,
  e1: number,
  n1: number,
  base = 0,
  top = 30,
): Volume {
  return {
    rings: [Float32Array.of(e0, n0, e1, n0, e1, n1, e0, n1)],
    base,
    top,
    roofH: 0,
    roofShape: 0,
    wall: 0,
    roof: 0,
    glass: 0,
    pattern: 0,
    flags: 0,
    seed: 1,
    box: [e0, n0, e1, n1],
  };
}

/** An elevated way through [e, n, z] points. */
export function deckWay(pts: [number, number, number][], width = 10, kind = 0): ElevatedWay {
  return {
    kind,
    width,
    pts: Float32Array.from(pts.flat()),
    own: Uint8Array.from(pts.map(() => 1)),
  };
}

/** A mixed mask whose water is the rectangle [e0, e1) × [n0, n1) in world metres (inside square i, j). */
export function waterRect(i: number, j: number, e0: number, n0: number, e1: number, n1: number) {
  const bits = new Uint8Array(1250);
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) {
      const e = i * CELL + x * 2 + 1;
      const n = j * CELL + y * 2 + 1;
      if (e >= e0 && e < e1 && n >= n0 && n < n1)
        bits[(x + 100 * y) >> 3] |= 1 << ((x + 100 * y) & 7);
    }
  return { mode: 2 as const, bits };
}

/** A world made of these squares. */
export function worldOf(...cells: WalkCell[]): WalkWorld {
  const w = new WalkWorld({} as WalkIndex);
  for (const c of cells) w.add(c);
  return w;
}

/** `count` empty squares in a row eastwards from (0, 0): open land (or water) to drive (or sail) far along. */
export function strip(count: number, parts: Partial<WalkCell> = {}): WalkCell[] {
  return Array.from({ length: count }, (_, i) => makeCell(i, 0, parts));
}
