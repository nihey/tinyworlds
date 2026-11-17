import type { WalkCell } from "./cell";
import { CELL } from "./geo";
import { clamp } from "./math";
import { cellExists, type WalkIndex } from "./walk-index";
import type { WalkWorld } from "./world";

/**
 * The walk's minimap: the streets round you in the bottom-left corner, centred on you and turned
 * with you (the way you face is up), zoomed out the faster you go. Just the streets: each
 * square's street lines at their real width (the major classes a touch brighter, the elevated
 * ways in their own tone over them), its water from its mask, the land the sign's dark, you an
 * arrow in the accent and a tick on the rim where north is. No labels, no other marks.
 *
 * It is pixel art: drawn small and shown at two (or so) screen pixels a pixel, every pixel one
 * of a few tones, never a blend. A pixel is a line's where its middle is within half the line's
 * width of it (`rasterSegments`, row by row; the higher layer where two meet), else the water or
 * the land its square's mask says under its middle. The pixels are written straight into the
 * picture: no antialiasing to undo, and nothing read back from the canvas.
 *
 * A square's lines are cut and flattened once (`squareSegments`, world metres) and kept while it
 * is loaded; a drawing takes them through the transform, for the squares within reach only.
 * No three.js, no React.
 */

/** Metres across the minimap standing still, on foot or swimming. */
export const SPAN_NEAR = 150;
/** Metres across it at `SPAN_SPEED` and over. */
export const SPAN_FAR = 450;
/** m/s at which it is zoomed out all the way. */
export const SPAN_SPEED = 30;
/** Seconds the zoom takes to go most of the way (1 − 1/e) to a new speed's. */
const SPAN_EASE = 0.6;
/** Street classes up to this one (motorway, trunk, primary, secondary) are major. */
export const MAJOR_CLASS = 3;
/** A line is never drawn thinner than this, minimap px: so a lane far out does not break into dots. */
const MIN_LINE = 1.2;
/** Metres a street's half-width may reach past the minimap's corner: squares this far out are drawn too. */
const REACH_SPARE = 20;
/** The mask: so many cells a side per square. */
const MASK = 100;

/** How many metres across the minimap shows at `speed` m/s: 150 still, out to 450 at 30 and over. */
export function minimapSpan(speed: number): number {
  const s = Number.isFinite(speed) ? clamp(Math.abs(speed) / SPAN_SPEED, 0, 1) : 0;
  return SPAN_NEAR + (SPAN_FAR - SPAN_NEAR) * s;
}

/** The span eased towards `target` over `dt` s; at once under reduced motion (or the first time). */
export function easeSpan(current: number, target: number, dt: number, reduced: boolean): number {
  if (reduced || !Number.isFinite(current) || !Number.isFinite(dt)) return target;
  return target + (current - target) * Math.exp(-Math.max(0, dt) / SPAN_EASE);
}

/** Where you are and which way you face: radians from north, clockwise. */
export interface Facing {
  e: number;
  n: number;
  yaw: number;
}

/** A canvas transform, as `setTransform(a, b, c, d, e, f)` takes it. */
export type Affine = readonly [number, number, number, number, number, number];

/**
 * World metres (east, north) to minimap px (x right, y down) of a minimap `size` px across that
 * shows `span` m: you at its centre, the way you face straight up.
 */
export function minimapTransform(at: Facing, span: number, size: number): Affine {
  const s = size / span;
  const sin = Math.sin(at.yaw);
  const cos = Math.cos(at.yaw);
  const c = size / 2;
  return [
    s * cos,
    -s * sin,
    -s * sin,
    -s * cos,
    c - s * (cos * at.e - sin * at.n),
    c + s * (sin * at.e + cos * at.n),
  ];
}

/** A point through a transform. */
export function applyAffine(m: Affine, e: number, n: number): [number, number] {
  return [m[0] * e + m[2] * n + m[4], m[1] * e + m[3] * n + m[5]];
}

export type Edge = "top" | "right" | "bottom" | "left";

/** Where north is on the rim of a minimap `size` px across, `inset` px in from its edge, and on which edge, when you face `yaw`. */
export function northTick(
  yaw: number,
  size: number,
  inset: number,
): { x: number; y: number; edge: Edge } {
  const dx = -Math.sin(yaw);
  const dy = -Math.cos(yaw);
  const t = (size / 2 - inset) / Math.max(Math.abs(dx), Math.abs(dy));
  const edge: Edge =
    Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? "top" : "bottom") : dx > 0 ? "right" : "left";
  return { x: size / 2 + dx * t, y: size / 2 + dy * t, edge };
}

/** A stretch of street as a square gives it. */
export interface MiniWay {
  /** [e, n, e, n, …] in world metres, all inside its square */
  pts: Float32Array;
  width: number;
  major: boolean;
  elevated: boolean;
}

/**
 * A polyline (`stride` numbers a vertex, east and north first) clipped to the rectangle
 * [e0, e1] × [n0, n1]: the runs of it inside, as [e, n, …] (Liang–Barsky, segment by segment).
 */
export function clipPolyline(
  pts: ArrayLike<number>,
  stride: number,
  e0: number,
  n0: number,
  e1: number,
  n1: number,
): Float32Array[] {
  const runs: Float32Array[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 4) runs.push(Float32Array.from(run));
    run = [];
  };
  let open = false;
  for (let q = stride; q + 1 < pts.length; q += stride) {
    const ax = pts[q - stride];
    const ay = pts[q - stride + 1];
    const dx = pts[q] - ax;
    const dy = pts[q + 1] - ay;
    let t0 = 0;
    let t1 = 1;
    let inside = true;
    const edges: [number, number][] = [
      [-dx, ax - e0],
      [dx, e1 - ax],
      [-dy, ay - n0],
      [dy, n1 - ay],
    ];
    for (const [p, r] of edges) {
      if (p === 0) {
        if (r < 0) inside = false;
      } else {
        const t = r / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
      if (!inside || t0 > t1) {
        inside = false;
        break;
      }
    }
    if (!inside) {
      flush();
      open = false;
      continue;
    }
    if (!open || t0 > 0) {
      flush();
      run.push(ax + t0 * dx, ay + t0 * dy);
    }
    run.push(ax + t1 * dx, ay + t1 * dy);
    open = t1 >= 1;
    if (!open) flush();
  }
  flush();
  return runs;
}

/**
 * A square's streets, each cut to the square (a street is filed in every square it touches, so
 * each draws only its own stretch): at their width, major or not, elevated or not.
 */
export function squareWays(cell: WalkCell, side = CELL): MiniWay[] {
  const e0 = cell.i * side;
  const n0 = cell.j * side;
  const out: MiniWay[] = [];
  for (const s of cell.streets) {
    const major = s.cls <= MAJOR_CLASS;
    for (const pts of clipPolyline(s.pts, 3, e0, n0, e0 + side, n0 + side))
      out.push({ pts, width: s.width, major, elevated: s.elevated });
  }
  return out;
}

/** Numbers a segment: e0, n0, e1, n1, width, layer. */
export const SEG = 6;
/** Layers, the higher drawn over the lower (0: no line). */
export const STREET = 1;
export const MAJOR = 2;
export const ELEVATED = 3;

/** A square's streets as flat segments in world metres (`SEG` numbers each), cut to the square. */
export function squareSegments(cell: WalkCell, side = CELL): Float32Array {
  const ways = squareWays(cell, side);
  let count = 0;
  for (const w of ways) count += w.pts.length / 2 - 1;
  const out = new Float32Array(count * SEG);
  let o = 0;
  for (const w of ways) {
    const layer = w.elevated ? ELEVATED : w.major ? MAJOR : STREET;
    for (let q = 2; q < w.pts.length; q += 2) {
      out[o++] = w.pts[q - 2];
      out[o++] = w.pts[q - 1];
      out[o++] = w.pts[q];
      out[o++] = w.pts[q + 1];
      out[o++] = w.width;
      out[o++] = layer;
    }
  }
  return out;
}

/**
 * Segments into `code` (`size` × `size`, a byte a pixel, row by row): a pixel whose middle lies
 * within half a segment's width of it (`least` minimap px across at the least, so a lane far out
 * does not break into dots) takes the segment's layer, unless it has a higher one. `m` takes
 * world metres to minimap px. A segment with its round ends is a capsule: each row it crosses
 * is one run of pixels, found from its two end discs and the band between them.
 */
export function rasterSegments(
  code: Uint8Array,
  size: number,
  m: Affine,
  segs: Float32Array,
  least: number,
): void {
  const scale = Math.hypot(m[0], m[1]);
  for (let s = 0; s + SEG <= segs.length; s += SEG) {
    const ax = m[0] * segs[s] + m[2] * segs[s + 1] + m[4];
    const ay = m[1] * segs[s] + m[3] * segs[s + 1] + m[5];
    const bx = m[0] * segs[s + 2] + m[2] * segs[s + 3] + m[4];
    const by = m[1] * segs[s + 2] + m[3] * segs[s + 3] + m[5];
    const r = Math.max(segs[s + 4] * scale, least) / 2;
    if (Math.max(ax, bx) + r < 0 || Math.min(ax, bx) - r > size) continue;
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by) + r));
    if (y0 > y1) continue;
    const layer = segs[s + 5];
    const len = Math.hypot(bx - ax, by - ay);
    const ux = len > 1e-9 ? (bx - ax) / len : 0;
    const uy = len > 1e-9 ? (by - ay) / len : 0;
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5;
      let lo = Infinity;
      let hi = -Infinity;
      // the end discs
      let h = r * r - (yc - ay) * (yc - ay);
      if (h >= 0) {
        h = Math.sqrt(h);
        lo = ax - h;
        hi = ax + h;
      }
      h = r * r - (yc - by) * (yc - by);
      if (h >= 0) {
        h = Math.sqrt(h);
        lo = Math.min(lo, bx - h);
        hi = Math.max(hi, bx + h);
      }
      // the band between: for (x, yc), 0 ≤ along ≤ len and |across| ≤ r
      if (len > 1e-9) {
        let a = -Infinity;
        let b = Infinity;
        const along = (yc - ay) * uy;
        if (Math.abs(ux) > 1e-9) {
          const p = ax - along / ux;
          const q = ax + (len - along) / ux;
          a = Math.max(a, Math.min(p, q));
          b = Math.min(b, Math.max(p, q));
        } else if (along < 0 || along > len) a = Infinity;
        const across = (yc - ay) * ux;
        if (Math.abs(uy) > 1e-9) {
          const p = ax + (across - r) / uy;
          const q = ax + (across + r) / uy;
          a = Math.max(a, Math.min(p, q));
          b = Math.min(b, Math.max(p, q));
        } else if (Math.abs(across) > r) a = Infinity;
        if (a <= b) {
          lo = Math.min(lo, a);
          hi = Math.max(hi, b);
        }
      }
      if (!(lo <= hi)) continue;
      const x0 = Math.max(0, Math.ceil(lo - 0.5));
      const x1 = Math.min(size - 1, Math.floor(hi - 0.5));
      for (let x = x0, o = y * size + x0; x <= x1; x++, o++) if (code[o] < layer) code[o] = layer;
    }
  }
}

/** Whether the point (e, n), in square `cell`, is water by the square's mask (2 m cells). */
export function maskWater(cell: WalkCell, e: number, n: number, side = CELL): boolean {
  const { mode, bits } = cell.mask;
  if (mode === 1) return true;
  if (mode !== 2 || !bits) return false;
  const step = side / MASK;
  const x = clamp(Math.floor((e - cell.i * side) / step), 0, MASK - 1);
  const y = clamp(Math.floor((n - cell.j * side) / step), 0, MASK - 1);
  const idx = x + MASK * y;
  return ((bits[idx >> 3] >> (idx & 7)) & 1) === 1;
}

/**
 * Whether a square with no file is open water on the minimap, as the walk lays the open water:
 * past the edge of the data, water unless a loaded square beside it is all land (where the data
 * ends inland the city ends there, not in a sea).
 */
export function offDataWater(
  i: number,
  j: number,
  exists: (i: number, j: number) => boolean,
  dry: (i: number, j: number) => boolean,
): boolean {
  if (exists(i, j)) return false;
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) if (dry(i + di, j + dj)) return false;
  return true;
}

// ---- drawing ------------------------------------------------------------------------------

/** The minimap's tones, as CSS hex colours. */
export interface MinimapTones {
  land: string;
  water: string;
  street: string;
  major: string;
  elevated: string;
  /** you: the world's accent */
  you: string;
  /** the outline of you */
  ink: string;
  north: string;
}

/** A layer's tone: none (the mask says), the streets, the major ones, the elevated ways. */
const LAYER_TONE: (keyof MinimapTones | null)[] = [null, "street", "major", "elevated"];

/** You: an arrow pointing up (the way you face), in the accent with an ink outline. */
const ARROW = [
  "...k...",
  "..kAk..",
  "..kAk..",
  ".kAAAk.",
  ".kAAAk.",
  "kAAAAAk",
  "kAAkAAk",
  "kk...kk",
];
/** Pixels of the sign's dark round the map: the rim the north tick stands on. */
export const RIM = 3;
/** North: a little triangle in the rim, pointing out (this one on the top edge). */
const TICK = ["..N..", ".NNN.", "NNNNN"];
/** The tick keeps this far from a corner along its edge, pixels: the sign's corners are rounded. */
const TICK_CORNER = 7.5;
/** Closer than this (metres, or metres across) and this (radians) to the last drawing is the same. */
const STILL = 0.05;
const STILL_YAW = 0.002;
/** At most this many squares' segments are made in one drawing, the nearest first (a square
 * takes some 0.02 ms): so the squares that come in together as the walk opens do not make one
 * drawing slow. */
const BUILD_EACH = 6;

/** A sprite turned a quarter clockwise. */
const turn = (rows: string[]): string[] =>
  Array.from({ length: rows[0].length }, (_, c) =>
    Array.from({ length: rows.length }, (_, r) => rows[rows.length - 1 - r][c]).join(""),
  );
const TICKS: Record<Edge, string[]> = (() => {
  const right = turn(TICK);
  const bottom = turn(right);
  return { top: TICK, right, bottom, left: turn(bottom) };
})();

/** An opaque pixel as one 32-bit number in the platform's byte order (the picture's bytes are
 * red, green, blue, alpha). */
const LITTLE = new Uint8Array(Uint32Array.of(1).buffer)[0] === 1;
const pack = (r: number, g: number, b: number): number =>
  (LITTLE ? (255 << 24) | (b << 16) | (g << 8) | r : (r << 24) | (g << 16) | (b << 8) | 255) >>> 0;

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  const v = Number.parseInt(full, 16);
  return Number.isFinite(v) ? [(v >> 16) & 255, (v >> 8) & 255, v & 255] : [0, 0, 0];
}

/**
 * Draws the minimap on a small canvas (one canvas pixel a minimap pixel; the page scales it up
 * without smoothing). A square's segments are made the first time it is within reach and let go
 * once the world has let it go. A drawing takes the segments of the squares within reach to the
 * pixels, gives every pixel its tone (the water read from the masks where no line is), adds you
 * and the north tick, and puts the picture on the canvas.
 */
export class MinimapDrawer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tones: Record<keyof MinimapTones, [number, number, number]>;
  /** the same, as a pixel of the picture's 32-bit view */
  private readonly packed: Record<keyof MinimapTones, number>;
  private readonly kept = new Map<
    string,
    { cell: WalkCell; segs: Float32Array | null; seen: number }
  >();
  private round = 0;
  private code = new Uint8Array(0);
  private image: ImageData | null = null;
  /** what the picture on the canvas was drawn for: the same again is not drawn again */
  private drawn: { at: Facing; span: number; size: number; squares: number; near: number } | null =
    null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: WalkWorld,
    tones: MinimapTones,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.tones = Object.fromEntries(Object.entries(tones).map(([k, v]) => [k, rgbOf(v)])) as Record<
      keyof MinimapTones,
      [number, number, number]
    >;
    this.packed = Object.fromEntries(
      Object.entries(this.tones).map(([k, [r, g, b]]) => [k, pack(r, g, b)]),
    ) as Record<keyof MinimapTones, number>;
  }

  /** How many squares are kept (for checks). */
  get squaresKept(): number {
    return this.kept.size;
  }

  draw(at: Facing, span: number): void {
    const size = this.canvas.width;
    if (size < 3 || !(span > 0)) return;
    if (!this.image || this.image.width !== size) {
      this.image = this.ctx.createImageData(size, size);
      this.code = new Uint8Array(size * size);
    }
    const reach = (span / 2) * Math.SQRT2 + REACH_SPARE;
    const { near, fresh } = this.near(at, reach);
    // standing still, with the same squares in: the picture is as it was
    const was = this.drawn;
    if (
      was &&
      !fresh &&
      was.size === size &&
      was.squares === this.kept.size &&
      was.near === near.length &&
      Math.abs(was.at.e - at.e) < STILL &&
      Math.abs(was.at.n - at.n) < STILL &&
      Math.abs(was.at.yaw - at.yaw) < STILL_YAW &&
      Math.abs(was.span - span) < STILL
    )
      return;
    this.drawn = { at: { ...at }, span, size, squares: this.kept.size, near: near.length };
    const { code, image } = this;
    code.fill(0);
    const m = minimapTransform(at, span, size);
    // the streets, the major ones over them, the elevated ways over all
    for (const segs of near) rasterSegments(code, size, m, segs, MIN_LINE);

    // every pixel its tone: a line's, else the water or the land under its middle; the rim the
    // sign's dark. A pixel is written whole, as one 32-bit number
    const pixels = new Uint32Array(image.data.buffer);
    const table = LAYER_TONE.map((name) => (name ? this.packed[name] : 0));
    const { land, water } = this.packed;
    const wet = this.wetAround(at, reach);
    // minimap px back to world metres: (e, n) of a pixel's middle, and the step to the next
    const det = m[0] * m[3] - m[1] * m[2];
    const stepE = m[3] / det;
    const stepN = -m[1] / det;
    for (let y = 0, p = 0; y < size; y++) {
      if (y < RIM || y >= size - RIM) {
        pixels.fill(land, p, p + size);
        p += size;
        continue;
      }
      const dx = 0.5 - m[4];
      const dy = y + 0.5 - m[5];
      let e = (m[3] * dx - m[2] * dy) / det;
      let n = (-m[1] * dx + m[0] * dy) / det;
      for (let x = 0; x < size; x++, p++, e += stepE, n += stepN) {
        const c = code[p];
        pixels[p] =
          x < RIM || x >= size - RIM ? land : c !== 0 ? table[c] : wet(e, n) ? water : land;
      }
    }
    const px = image.data;
    const mid = Math.floor(size / 2);
    this.stamp(px, size, ARROW, mid - 3, mid - 4);
    const tick = northTick(at.yaw, size, RIM / 2);
    const along = (v: number) => clamp(v, TICK_CORNER, size - TICK_CORNER);
    const tx = tick.edge === "top" || tick.edge === "bottom" ? along(tick.x) : tick.x;
    const ty = tick.edge === "left" || tick.edge === "right" ? along(tick.y) : tick.y;
    const glyph = TICKS[tick.edge];
    this.stamp(
      px,
      size,
      glyph,
      Math.round(tx - glyph[0].length / 2),
      Math.round(ty - glyph.length / 2),
    );
    this.ctx.putImageData(image, 0, 0);
  }

  /**
   * The segments of the squares within `reach` m of you, and whether any were made just now. A
   * square's are made the first time it is in reach, a few a drawing, the nearest first; a square
   * the world has let go is let go.
   */
  private near(at: Facing, reach: number): { near: Float32Array[]; fresh: boolean } {
    const side = CELL;
    const round = ++this.round;
    const within: { d: number; k: { cell: WalkCell; segs: Float32Array | null } }[] = [];
    for (const cell of this.world.cells()) {
      let k = this.kept.get(cell.key);
      if (!k || k.cell !== cell) this.kept.set(cell.key, (k = { cell, segs: null, seen: round }));
      k.seen = round;
      const de = Math.max(cell.i * side - at.e, 0, at.e - (cell.i + 1) * side);
      const dn = Math.max(cell.j * side - at.n, 0, at.n - (cell.j + 1) * side);
      const d = de * de + dn * dn;
      if (d <= reach * reach) within.push({ d, k });
    }
    for (const [key, k] of this.kept) if (k.seen !== round) this.kept.delete(key);
    within.sort((a, b) => a.d - b.d);
    let built = 0;
    const out: Float32Array[] = [];
    for (const { k } of within) {
      if (!k.segs && built < BUILD_EACH) {
        k.segs = squareSegments(k.cell);
        built++;
      }
      if (k.segs) out.push(k.segs);
    }
    return { near: out, fresh: built > 0 };
  }

  /**
   * Whether a point within `reach` m of you is water: by its square's mask where the square is
   * in, open water past the edge of the data (`offDataWater`), land where a square is still on
   * its way. The squares round you are looked at once a drawing, not once a pixel.
   */
  private wetAround(at: Facing, reach: number): (e: number, n: number) => boolean {
    const side = CELL;
    const i0 = Math.floor((at.e - reach) / side);
    const j0 = Math.floor((at.n - reach) / side);
    const cols = Math.floor((at.e + reach) / side) - i0 + 1;
    const rows = Math.floor((at.n + reach) / side) - j0 + 1;
    const ix: WalkIndex = this.world.index;
    const exists = (i: number, j: number) => cellExists(ix, i, j);
    const dry = (i: number, j: number) => this.kept.get(`${i}_${j}`)?.cell.mask.mode === 0;
    // per square: false land, true all water, else the square whose mask says
    const squares: (boolean | WalkCell)[] = [];
    for (let j = j0; j < j0 + rows; j++)
      for (let i = i0; i < i0 + cols; i++) {
        const k = this.kept.get(`${i}_${j}`);
        squares.push(
          k
            ? k.cell.mask.mode === 2
              ? k.cell
              : k.cell.mask.mode === 1
            : offDataWater(i, j, exists, dry),
        );
      }
    return (e, n) => {
      const i = Math.floor(e / side) - i0;
      const j = Math.floor(n / side) - j0;
      if (i < 0 || j < 0 || i >= cols || j >= rows) return false;
      const w = squares[i + j * cols];
      return typeof w === "boolean" ? w : maskWater(w, e, n, side);
    };
  }

  /** A sprite's pixels into the picture, its top-left at (x0, y0): A you, N north, k ink. */
  private stamp(px: Uint8ClampedArray, size: number, rows: string[], x0: number, y0: number): void {
    const by: Record<string, [number, number, number]> = {
      A: this.tones.you,
      N: this.tones.north,
      k: this.tones.ink,
    };
    for (let r = 0; r < rows.length; r++)
      for (let c = 0; c < rows[r].length; c++) {
        const t = by[rows[r][c]];
        const x = x0 + c;
        const y = y0 + r;
        if (!t || x < 0 || y < 0 || x >= size || y >= size) continue;
        const o = (y * size + x) * 4;
        px[o] = t[0];
        px[o + 1] = t[1];
        px[o + 2] = t[2];
      }
  }
}

/** The palette's colour of a ramp and shade, as CSS hex, or `fallback` where the palette lacks the ramp. */
export function paletteHex(ix: WalkIndex, ramp: string, shade: number, fallback: string): string {
  const id = ix.palette.names.indexOf(ramp);
  const c = (id * 6 + shade) * 3;
  if (id < 0 || c + 2 >= ix.palette.rgb.length) return fallback;
  return `#${[0, 1, 2].map((k) => ix.palette.rgb[c + k].toString(16).padStart(2, "0")).join("")}`;
}
