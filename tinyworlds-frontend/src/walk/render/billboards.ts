import { isMapDeck, type Volume, type WalkCell } from "../cell";
import { CELL, lonLatToEN, type WalkGeo } from "../geo";
import { clamp, mix } from "../math";
import { DEEP, HIGH, LIT, OUTLINE, SHADE } from "./palette";
import { inRings } from "./shore";

/**
 * Billboards: where a world says (`World.billboards`, New York's Times Square), the walls that
 * face the street carry screens of animated pixel art, generic and wordless (no brands, no
 * letters or digits: nothing to translate). This is where they go and what each shows, from the
 * data alone, so they are the same every visit; `billboard-mesh.ts` draws them and
 * `billboard-material.ts` is their shader. No three.js here.
 */

/** An area whose street-facing walls carry billboards: world metres east and north, its radius. */
export interface BillboardArea {
  e: number;
  n: number;
  r: number;
}

/** The world's areas (lon/lat, metres) in the walk's metres. */
export function billboardAreas(
  geo: WalkGeo,
  areas: readonly { lon: number; lat: number; radius: number }[] | undefined,
): BillboardArea[] {
  return (areas ?? [])
    .filter((a) => Number.isFinite(a.lon) && Number.isFinite(a.lat) && a.radius > 0)
    .map((a) => {
      const [e, n] = lonLatToEN(geo, a.lon, a.lat);
      return { e, n, r: a.radius };
    });
}

/** Whether square (i, j) reaches into any of the areas. */
export function squareInAreas(
  i: number,
  j: number,
  areas: readonly BillboardArea[],
  side = CELL,
): boolean {
  return areas.some((a) => {
    const de = a.e - clamp(a.e, i * side, (i + 1) * side);
    const dn = a.n - clamp(a.n, j * side, (j + 1) * side);
    return de * de + dn * dn < a.r * a.r;
  });
}

// ---- where they go

/** A wall shorter than this, m, carries none. */
export const WALL_MIN = 8;
/** A wall longer than this is taken in pieces about this long, each with its own screens. */
export const WALL_PIECE = 36;
/** Only volumes that stand on the street (base at most this, m) and are tall (top at least this). */
export const BASE_MAX = 6;
export const TOP_MIN = 15;
/** Screens hang from this height, m, up to their wall's top less `TOP_MARGIN`, and never above `PANEL_CEIL`. */
export const PANEL_FLOOR = 6;
export const TOP_MARGIN = 2;
export const PANEL_CEIL = 60;
/**
 * A wall faces open ground when its probes, from this far out to that far (m), meet no volume
 * rising to the screens: a party wall or a light well meets one at once, a street does not.
 * Not further: Manhattan's side streets are 18 m from front to front, so a longer probe would
 * meet the building across the street and leave every side street bare.
 */
export const PROBE_NEAR = 3;
export const PROBE_FAR = 15;
const PROBE_STEP = 2;
/** Where along the wall the probes go out from. */
const PROBES = [0.2, 0.5, 0.8];
/** A screen's face stands this far off its wall, m. */
export const GAP = 0.3;
/** One LED pixel of a screen, m: sizes are whole numbers of them (in steps of two). */
export const TEXEL = 0.25;
/** At most this many screens in an area, shared out among its squares by how much of it each holds. */
export const MAX_PANELS = 120;
/** The smallest screen, m. */
const MIN_W = 3;
const MIN_H = 2.5;

/** One screen on a wall. */
export interface Panel {
  /** the middle of its foot on the wall's line, world metres */
  e: number;
  n: number;
  /** its bottom, m above the land */
  z: number;
  /** the wall's outward normal */
  ne: number;
  nn: number;
  /** width and height, m: whole texels, in steps of half a metre */
  w: number;
  h: number;
  screen: Screen;
}

const unit = (h: number) => (h & 0xffff) / 0x10000;
const snap = (m: number) => Math.round(m * 2) / 2;
const snapDown = (m: number) => Math.floor(m * 2) / 2;

/** How many screens square (i, j) may hold: its share of each area's `MAX_PANELS`, by area. */
export function squareBudget(
  i: number,
  j: number,
  areas: readonly BillboardArea[],
  side = CELL,
): number {
  const N = 32;
  let budget = 0;
  for (const a of areas) {
    let inside = 0;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const e = (i + (x + 0.5) / N) * side;
        const n = (j + (y + 0.5) / N) * side;
        if ((e - a.e) ** 2 + (n - a.n) ** 2 <= a.r * a.r) inside++;
      }
    const share = ((inside / (N * N)) * side * side) / (Math.PI * a.r * a.r);
    budget += Math.floor(MAX_PANELS * share);
  }
  return budget;
}

/** Volumes in 10 m buckets, for the probes. */
class Buckets {
  private readonly map = new Map<number, Volume[]>();
  constructor(volumes: readonly Volume[]) {
    for (const v of volumes) {
      const [e0, n0, e1, n1] = v.box;
      for (let y = Math.floor(n0 / 10); y <= Math.floor(n1 / 10); y++)
        for (let x = Math.floor(e0 / 10); x <= Math.floor(e1 / 10); x++) {
          const k = x * 100003 + y;
          let list = this.map.get(k);
          if (!list) this.map.set(k, (list = []));
          list.push(v);
        }
    }
  }
  /** Whether (e, n) is inside any of them. */
  hit(e: number, n: number): boolean {
    const list = this.map.get(Math.floor(e / 10) * 100003 + Math.floor(n / 10));
    if (!list) return false;
    for (const v of list) {
      const [e0, n0, e1, n1] = v.box;
      if (e < e0 || e > e1 || n < n0 || n > n1) continue;
      if (inRings(v.rings, e, n)) return true;
    }
    return false;
  }
}

interface Wall {
  ae: number;
  an: number;
  be: number;
  bn: number;
  L: number;
  ne: number;
  nn: number;
  top: number;
  hash: number;
  /** its middle's distance from its area's centre, as a share of the radius */
  rel: number;
  order: number;
}

function signedArea(r: Float32Array): number {
  let a = 0;
  const k = r.length / 2;
  for (let i = 0, j = k - 1; i < k; j = i++) a += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
  return a / 2;
}

/**
 * The screens on square `cell`'s buildings inside the areas. `near` holds every volume of the
 * square and of the squares round it (what stands within `PROBE_FAR` of its walls), so the answer
 * is the data's alone: the same whatever else is loaded, the same every visit.
 *
 * A wall carries screens when it is at least `WALL_MIN` long, its volume stands on the street
 * (base ≤ `BASE_MAX`) and is tall (top ≥ `TOP_MIN`), its middle is in an area, and it faces open
 * ground: probes from three points along it, `PROBE_NEAR` to `PROBE_FAR` out along its outward
 * normal, meet no volume rising to the screens' height, and the middle one ends inside the area.
 * Walls near an area's centre are taken first and more often, with more and bigger screens
 * (one to three stacked up the wall, 60 to 90% of its width, 1:1 to 3:1), until the square's
 * share of the area's `MAX_PANELS` is used.
 */
export function placeBillboards(
  cell: WalkCell,
  near: readonly Volume[],
  areas: readonly BillboardArea[],
  side = CELL,
): Panel[] {
  if (areas.length === 0) return [];
  const budget = squareBudget(cell.i, cell.j, areas, side);
  if (budget <= 0) return [];
  const blockers = new Buckets(near.filter((v) => !isMapDeck(v) && v.top > PANEL_FLOOR));
  const areaOf = (e: number, n: number) => {
    let best: BillboardArea | null = null;
    let rel = Infinity;
    for (const a of areas) {
      const d = Math.hypot(e - a.e, n - a.n) / a.r;
      if (d <= 1 && d < rel) {
        best = a;
        rel = d;
      }
    }
    return best ? { area: best, rel } : null;
  };

  const walls: Wall[] = [];
  for (const v of cell.volumes) {
    if (isMapDeck(v) || v.base > BASE_MAX || v.top < TOP_MIN) continue;
    v.rings.forEach((r, ri) => {
      if (r.length < 6) return;
      const orient = Math.sign(signedArea(r)) * (ri === 0 ? 1 : -1);
      for (const run of straightWalls(r)) {
        const { ae, an, be, bn } = run;
        const L = Math.hypot(be - ae, bn - an);
        if (L < WALL_MIN) continue;
        // the outward normal of a counter-clockwise ring is (dn, −de), as the walls are drawn
        const ne = (orient * (bn - an)) / L;
        const nn = (orient * -(be - ae)) / L;
        const pieces = Math.max(1, Math.round(L / WALL_PIECE));
        for (let p = 0; p < pieces; p++) {
          const t0 = p / pieces;
          const t1 = (p + 1) / pieces;
          const w: Wall = {
            ae: ae + (be - ae) * t0,
            an: an + (bn - an) * t0,
            be: ae + (be - ae) * t1,
            bn: an + (bn - an) * t1,
            L: L / pieces,
            ne,
            nn,
            top: v.top,
            hash: mix(mix(mix(v.seed >>> 0, ri), run.k), p),
            rel: 0,
            order: 0,
          };
          const at = areaOf((w.ae + w.be) / 2, (w.an + w.bn) / 2);
          if (!at) continue;
          // nearer the centre: taken more often, and first
          if (unit(mix(w.hash, 7)) > 1 - 0.55 * at.rel * at.rel) continue;
          if (!facesOpen(w, at.area, blockers)) continue;
          w.rel = at.rel;
          w.order = at.rel + 0.35 * unit(w.hash);
          walls.push(w);
        }
      }
    });
  }
  walls.sort((x, y) => x.order - y.order || x.hash - y.hash);

  const out: Panel[] = [];
  for (const w of walls) {
    for (const p of panelsOn(w)) {
      if (out.length >= budget) return out;
      out.push(p);
    }
  }
  return out;
}

/** Edges of a ring that turn less than this, radians, are one wall; and none of their corners strays further than `RUN_SAG` m off it. */
const RUN_TURN = (12 * Math.PI) / 180;
const RUN_SAG = 0.6;

/**
 * A ring's straight walls: its edges run together where they go on (nearly) straight, as a
 * footprint traced in short pieces has them. Each with the index of its first edge (`k`).
 */
export function straightWalls(
  r: Float32Array,
): { ae: number; an: number; be: number; bn: number; k: number }[] {
  const count = r.length / 2;
  if (count < 3) return [];
  const dir = (a: number) => {
    const b = (a + 1) % count;
    return Math.atan2(r[b * 2 + 1] - r[a * 2 + 1], r[b * 2] - r[a * 2]);
  };
  const turn = (x: number, y: number) => Math.abs(Math.atan2(Math.sin(y - x), Math.cos(y - x)));
  // start at a corner, so no run is cut where the ring happens to begin
  let start = 0;
  for (let a = 0; a < count; a++)
    if (turn(dir((a + count - 1) % count), dir(a)) >= RUN_TURN) {
      start = a;
      break;
    }
  const out: { ae: number; an: number; be: number; bn: number; k: number }[] = [];
  let a = start;
  let done = 0;
  while (done < count) {
    const first = a;
    const d0 = dir(a);
    let last = a;
    done++;
    // take the next edges while they go on the same way and the corners stay on the line
    while (done < count) {
      const next = (last + 1) % count;
      if (turn(d0, dir(next)) >= RUN_TURN) break;
      const end = (next + 1) % count;
      const ae = r[first * 2];
      const an = r[first * 2 + 1];
      const de = r[end * 2] - ae;
      const dn = r[end * 2 + 1] - an;
      const len = Math.hypot(de, dn);
      let straight = len > 0;
      for (let q = (first + 1) % count; straight && q !== end; q = (q + 1) % count)
        straight = Math.abs(((r[q * 2] - ae) * dn - (r[q * 2 + 1] - an) * de) / len) <= RUN_SAG;
      if (!straight) break;
      last = next;
      done++;
    }
    const b = (last + 1) % count;
    out.push({ ae: r[first * 2], an: r[first * 2 + 1], be: r[b * 2], bn: r[b * 2 + 1], k: first });
    a = b;
  }
  return out;
}

/** Whether a wall's probes meet nothing, and the middle one ends inside its area. */
function facesOpen(w: Wall, area: BillboardArea, blockers: Buckets): boolean {
  for (const f of PROBES) {
    const e = w.ae + (w.be - w.ae) * f;
    const n = w.an + (w.bn - w.an) * f;
    for (let d = PROBE_NEAR; d <= PROBE_FAR; d += PROBE_STEP)
      if (blockers.hit(e + w.ne * d, n + w.nn * d)) return false;
  }
  const me = (w.ae + w.be) / 2 + w.ne * PROBE_FAR;
  const mn = (w.an + w.bn) / 2 + w.nn * PROBE_FAR;
  return Math.hypot(me - area.e, mn - area.n) <= area.r;
}

/** One to three screens stacked up a wall, from `PANEL_FLOOR`, each with its own width and shape. */
function panelsOn(w: Wall): Panel[] {
  const ceil = Math.min(w.top - TOP_MARGIN, PANEL_CEIL);
  // two or three near the centre, one or two further out, one at the edge
  const r = mix(w.hash, 1);
  const count = w.rel < 0.5 ? 2 + (r % 2) : w.rel < 0.85 ? 1 + (r % 2) : 1;
  const out: Panel[] = [];
  let z = PANEL_FLOOR + snap(unit(mix(w.hash, 2)) * 1.5);
  for (let s = 0; s < count; s++) {
    const hs = mix(w.hash, 10 + s);
    // bigger near the centre: 90% of the wall there, 60% at the edge
    const share = clamp(0.9 - 0.2 * w.rel - 0.1 * unit(hs), 0.6, 0.9);
    let width = snap(w.L * share);
    const aspect = 1 + 2 * unit(mix(hs, 1));
    let height = snap(width / aspect);
    const room = ceil - z;
    if (room < MIN_H) break;
    if (height > room) {
      // too little wall left above: the lowest screen takes what there is, as wide as 3:1 lets
      // it; one above it would come out narrower than the wall's 60%, and is left out
      height = snapDown(room);
      width = Math.min(width, snapDown(3 * height));
      if (s > 0 && width < 0.6 * w.L) break;
    }
    if (width < MIN_W || height < MIN_H) break;
    // anywhere along the wall that its width leaves, by hash
    const slack = w.L - width;
    const t = (width / 2 + slack * (0.5 + (unit(mix(hs, 2)) - 0.5) * 0.8)) / w.L;
    out.push({
      e: w.ae + (w.be - w.ae) * t,
      n: w.an + (w.bn - w.an) * t,
      z,
      ne: w.ne,
      nn: w.nn,
      w: width,
      h: height,
      screen: screenOf(mix(hs, 3)),
    });
    z += height + snap(1 + unit(mix(hs, 4)) * 1.5);
  }
  return out;
}

// ---- what they show

/**
 * What a screen shows: 0 a flat field with a big pictogram; 1 a ticker, a band of coloured
 * blocks scrolling under a field; 2 bands of colour sweeping across (diagonal, upright or rings);
 * 3 a pictogram blinking or pulsing between two palettes.
 */
export const TEMPLATES = ["picture", "ticker", "bands", "blink"] as const;
export type Template = 0 | 1 | 2 | 3;

export interface Screen {
  template: Template;
  /** which of `PICTOGRAMS` */
  picto: number;
  /** a template's own variety: the bands' direction, the blink's kind, the ticker's place */
  variant: number;
  /** whole seconds its loops run ahead, so neighbours are out of step */
  phase: number;
  /** its colour schemes, indices into `SCHEMES` (the second: what it blinks to, more bands) */
  a: number;
  b: number;
  /** for its own patterns (the ticker's blocks) */
  seed: number;
}

/** A palette colour by ramp name and shade. */
export type Tone = readonly [string, number];

/**
 * Colour schemes, each [field, figure, accent, dark], from the palette's bright ramps (taxi
 * yellow, the reds, blues, greens, pinks and oranges, white) and its darks: every pixel of a
 * screen is one of these, exactly.
 */
export const SCHEMES: readonly (readonly [Tone, Tone, Tone, Tone])[] = [
  [
    ["taxi", LIT],
    ["carBlack", OUTLINE],
    ["carRed", LIT],
    ["carBlack", DEEP],
  ],
  [
    ["carRed", LIT],
    ["carWhite", HIGH],
    ["taxi", HIGH],
    ["carRed", OUTLINE],
  ],
  [
    ["carBlue", LIT],
    ["carWhite", HIGH],
    ["pool", HIGH],
    ["carBlue", OUTLINE],
  ],
  [
    ["ipePink", LIT],
    ["carWhite", HIGH],
    ["carRed", LIT],
    ["ipePink", OUTLINE],
  ],
  [
    ["courtGreen", LIT],
    ["taxi", HIGH],
    ["carWhite", HIGH],
    ["courtGreen", OUTLINE],
  ],
  [
    ["carBlack", DEEP],
    ["pool", LIT],
    ["ipePink", HIGH],
    ["carBlack", OUTLINE],
  ],
  [
    ["flamboyant", LIT],
    ["taxi", HIGH],
    ["carWhite", HIGH],
    ["flamboyant", OUTLINE],
  ],
  [
    ["ferryOrange", LIT],
    ["carWhite", HIGH],
    ["carBlue", LIT],
    ["ferryOrange", OUTLINE],
  ],
  [
    ["glassDark", DEEP],
    ["taxi", HIGH],
    ["carRed", LIT],
    ["carBlack", OUTLINE],
  ],
  [
    ["carWhite", HIGH],
    ["carRed", LIT],
    ["carBlue", LIT],
    ["carBlack", DEEP],
  ],
  [
    ["pool", LIT],
    ["carBlue", DEEP],
    ["carWhite", HIGH],
    ["carBlue", OUTLINE],
  ],
  [
    ["carBlack", OUTLINE],
    ["ipePink", HIGH],
    ["taxi", LIT],
    ["carBlack", DEEP],
  ],
  [
    ["court", LIT],
    ["carWhite", HIGH],
    ["taxi", HIGH],
    ["court", OUTLINE],
  ],
  [
    ["carBlack", DEEP],
    ["lawn", HIGH],
    ["taxi", HIGH],
    ["carBlack", OUTLINE],
  ],
  [
    ["ipeYellow", LIT],
    ["carBlue", SHADE],
    ["flamboyant", LIT],
    ["carBlue", OUTLINE],
  ],
  [
    ["carRed", HIGH],
    ["carBlack", DEEP],
    ["carWhite", HIGH],
    ["carRed", OUTLINE],
  ],
];

/** The frame round every screen and its housing: the palette's darkest. */
export const FRAME: Tone = ["carBlack", OUTLINE];
export const HOUSING: Tone = ["carBlack", DEEP];

/** What a screen shows, from a hash: the same hash, the same screen. */
export function screenOf(hash: number): Screen {
  const h = hash >>> 0;
  // the field and the blink a little more often than the ticker and the bands
  const t = h % 20;
  const template: Template = t < 6 ? 0 : t < 10 ? 1 : t < 15 ? 2 : 3;
  const g = mix(h, 0x51);
  const a = g % SCHEMES.length;
  // the second scheme is always another one
  const b = (a + 1 + ((g >>> 8) % (SCHEMES.length - 1))) % SCHEMES.length;
  return {
    template,
    picto: (g >>> 16) % PICTOGRAMS.length,
    variant: (g >>> 24) % 3,
    phase: mix(h, 0x52) % 12,
    a,
    b,
    seed: mix(h, 0x53) & 0xffff,
  };
}

/**
 * The pictograms, 16 × 16, drawn here: "#" the figure, "+" its second colour, "." the field.
 * Generic things a city's screens show (no logos, no letters or digits): a star, theatre masks,
 * music, a film clapper, a cup, a sneaker, a heart, a lightning bolt.
 */
export const PICTOGRAMS: readonly { name: string; rows: readonly string[] }[] = [
  {
    name: "star",
    rows: [
      ".......##.......",
      ".......##.......",
      "......####......",
      "......####......",
      ".....######.....",
      "################",
      ".######++######.",
      "...####++####...",
      "....########....",
      "....########....",
      "...##########...",
      "...####..####...",
      "..####....####..",
      "..###......###..",
      ".###........###.",
      ".##..........##.",
    ],
  },
  {
    name: "masks",
    rows: [
      ".#######........",
      "#########.......",
      "#..###..#.......",
      "#..###..#.......",
      "#########.......",
      "#########.......",
      "#.#####.#++++++.",
      "##.....+++++++++",
      ".##...#+..+++..+",
      "..#####++..+..++",
      ".......+++++++++",
      ".......+++++++++",
      ".......++.....++",
      ".......+.+++++.+",
      "........+++++++.",
      ".........+++++..",
    ],
  },
  {
    name: "music",
    rows: [
      "................",
      ".....##########.",
      ".....##########.",
      ".....##......##.",
      ".....##......##.",
      ".....##......##.",
      ".....##......##.",
      ".....##......##.",
      ".....##......##.",
      ".....##......##.",
      "..#####...#####.",
      ".######..######.",
      "######..######..",
      "######..######..",
      ".####....####...",
      "................",
    ],
  },
  {
    name: "clapper",
    rows: [
      "............##++",
      "........##++##++",
      "....##++##++....",
      "##++##++........",
      "##++............",
      "................",
      "################",
      "++##++##++##++##",
      "################",
      "################",
      "################",
      "################",
      "################",
      "################",
      "################",
      "................",
    ],
  },
  {
    name: "cup",
    rows: [
      "....+...+...+...",
      "...+...+...+....",
      "....+...+...+...",
      "...+...+...+....",
      "................",
      ".###########....",
      ".###########++..",
      ".###########..+.",
      ".###########..+.",
      ".###########..+.",
      ".###########++..",
      "..#########.....",
      "...#######......",
      "................",
      "++++++++++++++..",
      ".++++++++++++...",
    ],
  },
  {
    name: "sneaker",
    rows: [
      "................",
      "................",
      "................",
      ".####...........",
      ".#..##..........",
      ".#...##.........",
      ".##...#+........",
      ".###...#+.......",
      ".####...#+#.....",
      ".#####...#+###..",
      ".##############.",
      "################",
      "################",
      "++++++++++++++++",
      ".++++++++++++++.",
      "................",
    ],
  },
  {
    name: "heart",
    rows: [
      "................",
      "..####....####..",
      ".######..######.",
      "################",
      "##+#############",
      "#++#############",
      "################",
      "################",
      ".##############.",
      "..############..",
      "...##########...",
      "....########....",
      ".....######.....",
      "......####......",
      ".......##.......",
      "................",
    ],
  },
  {
    name: "bolt",
    rows: [
      ".........######.",
      "........######..",
      ".......######...",
      "......######....",
      ".....######.....",
      "....##########..",
      "...##########...",
      "..##########....",
      "......+####.....",
      ".....+####......",
      "....+####.......",
      "...+###.........",
      "..+##...........",
      ".+#.............",
      "+...............",
      "................",
    ],
  },
];

/** A pictogram's pixel: 0 the field, 1 the figure, 2 its second colour (x right, y down from the top). */
export function pictogramAt(k: number, x: number, y: number): 0 | 1 | 2 {
  const c = PICTOGRAMS[k]?.rows[y]?.[x];
  return c === "#" ? 1 : c === "+" ? 2 : 0;
}

/** The pictograms as bytes, 16 wide and 16 high each, one under the other from the top: 0, 1 or 2. */
export function pictogramBytes(): Uint8Array {
  const out = new Uint8Array(16 * 16 * PICTOGRAMS.length);
  for (let k = 0; k < PICTOGRAMS.length; k++)
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) out[(k * 16 + y) * 16 + x] = pictogramAt(k, x, y);
  return out;
}
