import type { ElevatedWay, RoadNode, StreetEdge, Volume, WalkCell } from "../cell";
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

/** A street node: no lights, no tunnel, bearing 0, unless `opts` says. */
export function roadNode(id: number, e: number, n: number, opts: Partial<RoadNode> = {}): RoadNode {
  return { id, e, n, z: 0, lights: false, portal: false, bearing: 0, ...opts };
}

/** A street from node a to node b through [e, n] (or [e, n, z]) points: two-way, residential, 10 m wide unless `opts` says. */
export function streetEdge(
  a: number,
  b: number,
  pts: number[][],
  opts: Partial<StreetEdge> = {},
): StreetEdge {
  const flat = Float32Array.from(pts.flatMap(([e, n, z = 0]) => [e, n, z]));
  let length = 0;
  for (let q = 3; q < flat.length; q += 3)
    length += Math.hypot(flat[q] - flat[q - 3], flat[q + 1] - flat[q - 2]);
  return {
    key: `${a}-${b}`,
    a,
    b,
    cls: 5,
    link: false,
    ow: 0,
    elevated: false,
    width: 10,
    pts: flat,
    length,
    ...opts,
  };
}

/** The squares these streets touch, as the pipeline files them: each with every street that touches it and the nodes those end at. */
export function fileStreets(nodes: RoadNode[], streets: StreetEdge[]): WalkCell[] {
  const byId = new Map(nodes.map((nd) => [nd.id, nd]));
  const cells = new Map<string, WalkCell>();
  for (const s of streets) {
    const keys = new Set<string>();
    const p = s.pts;
    for (let q = 3; q < p.length; q += 3) {
      const len = Math.hypot(p[q] - p[q - 3], p[q + 1] - p[q - 2]);
      const steps = Math.max(1, Math.ceil(len / 2));
      for (let k = 0; k <= steps; k++) {
        const e = p[q - 3] + ((p[q] - p[q - 3]) * k) / steps;
        const n = p[q - 2] + ((p[q + 1] - p[q - 2]) * k) / steps;
        keys.add(`${Math.floor(e / CELL)}_${Math.floor(n / CELL)}`);
      }
    }
    for (const key of keys) {
      let c = cells.get(key);
      if (!c) {
        const [i, j] = key.split("_").map(Number);
        cells.set(key, (c = makeCell(i, j)));
      }
      c.streets.push(s);
      for (const id of [s.a, s.b]) {
        const nd = byId.get(id);
        if (nd && !c.nodes.includes(nd)) c.nodes.push(nd);
      }
    }
  }
  return [...cells.values()];
}

/** These squares and, empty, every square round them that is not among them: so that what stands round a street is all in. */
export function ringed(cells: WalkCell[]): WalkCell[] {
  const have = new Set(cells.map((c) => c.key));
  const out = [...cells];
  for (const c of cells)
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const key = `${c.i + di}_${c.j + dj}`;
        if (have.has(key)) continue;
        have.add(key);
        out.push(makeCell(c.i + di, c.j + dj));
      }
  return out;
}
