/**
 * Scanline polygon fill, even-odd rule, sampled at pixel centres. No anti-aliasing, ever: a pixel
 * is in or out. Two polygons that share an edge cover every pixel along it exactly once.
 *
 * Spans are reported through a callback as (row, firstColumn, endColumn) with endColumn exclusive,
 * already clipped to the target.
 */
export type SpanFn = (y: number, x0: number, x1: number) => void;

let cap = 1024;
let eRow0 = new Int32Array(cap);
let eRow1 = new Int32Array(cap);
let eX = new Float64Array(cap);
let eSlope = new Float64Array(cap);
let eKey = new Float64Array(cap);
let active = new Int32Array(cap);
let xs = new Float64Array(cap);

function ensure(n: number): void {
  if (n <= cap) return;
  while (cap < n) cap *= 2;
  eRow0 = new Int32Array(cap);
  eRow1 = new Int32Array(cap);
  eX = new Float64Array(cap);
  eSlope = new Float64Array(cap);
  eKey = new Float64Array(cap);
  active = new Int32Array(cap);
  xs = new Float64Array(cap);
}

/**
 * @param xy        flat vertex coordinates
 * @param vertStart vertStart[r] .. vertStart[r + 1] are ring r's vertices (indices into xy / 2)
 * @param ring0     first ring of the polygon
 * @param ring1     one past its last ring
 * @param offX      subtracted from x to get target columns
 * @param offY      subtracted from y to get target rows
 * @param w         target width (spans are clipped to it)
 * @param h         target height
 */
export function fillPolygon(
  xy: ArrayLike<number>,
  vertStart: ArrayLike<number>,
  ring0: number,
  ring1: number,
  offX: number,
  offY: number,
  w: number,
  h: number,
  span: SpanFn,
): void {
  ensure(vertStart[ring1] - vertStart[ring0] + (ring1 - ring0));
  let n = 0;
  let rowMin = h;
  let rowMax = -1;

  for (let r = ring0; r < ring1; r++) {
    const v0 = vertStart[r];
    const v1 = vertStart[r + 1];
    if (v1 - v0 < 3) continue;
    let ax = xy[(v1 - 1) * 2] - offX;
    let ay = xy[(v1 - 1) * 2 + 1] - offY;
    for (let v = v0; v < v1; v++) {
      const bx = xy[v * 2] - offX;
      const by = xy[v * 2 + 1] - offY;
      if (ay !== by) {
        const top = ay < by;
        const y0 = top ? ay : by;
        const y1 = top ? by : ay;
        // rows whose centre lies in [y0, y1)
        let row0 = Math.ceil(y0 - 0.5);
        let row1 = Math.ceil(y1 - 0.5) - 1;
        if (row1 >= 0 && row0 < h && row0 <= row1) {
          const slope = (bx - ax) / (by - ay);
          const xTop = top ? ax : bx;
          if (row0 < 0) row0 = 0;
          if (row1 >= h) row1 = h - 1;
          eRow0[n] = row0;
          eRow1[n] = row1;
          eX[n] = xTop + (row0 + 0.5 - y0) * slope;
          eSlope[n] = slope;
          n++;
          if (row0 < rowMin) rowMin = row0;
          if (row1 > rowMax) rowMax = row1;
        }
      }
      ax = bx;
      ay = by;
    }
  }
  if (n === 0) return;

  // order edges by first row: pack (row0, index) into one sortable number
  for (let i = 0; i < n; i++) eKey[i] = eRow0[i] * 4194304 + i;
  const keys = eKey.subarray(0, n);
  if (n > 1) keys.sort();

  let next = 0;
  let nActive = 0;
  for (let y = rowMin; y <= rowMax; y++) {
    while (next < n && keys[next] < (y + 1) * 4194304) {
      active[nActive++] = keys[next] % 4194304;
      next++;
    }
    let m = 0;
    let keep = 0;
    for (let a = 0; a < nActive; a++) {
      const e = active[a];
      if (eRow1[e] < y) continue;
      active[keep++] = e;
      xs[m++] = eX[e] + (y - eRow0[e]) * eSlope[e];
    }
    nActive = keep;
    if (m < 2) continue;
    if (m === 2) {
      if (xs[0] > xs[1]) {
        const t = xs[0];
        xs[0] = xs[1];
        xs[1] = t;
      }
    } else if (m <= 24) {
      for (let i = 1; i < m; i++) {
        const v = xs[i];
        let j = i - 1;
        while (j >= 0 && xs[j] > v) {
          xs[j + 1] = xs[j];
          j--;
        }
        xs[j + 1] = v;
      }
    } else {
      xs.subarray(0, m).sort();
    }
    for (let i = 0; i + 1 < m; i += 2) {
      let c0 = Math.ceil(xs[i] - 0.5);
      let c1 = Math.ceil(xs[i + 1] - 0.5);
      if (c0 < 0) c0 = 0;
      if (c1 > w) c1 = w;
      if (c0 < c1) span(y, c0, c1);
    }
  }
}

const quadXY = new Float64Array(8);
const quadStart = [0, 4];

/** Fill a convex quadrilateral given its four corners in order. */
export function fillQuad(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  w: number,
  h: number,
  span: SpanFn,
): void {
  quadXY[0] = x0;
  quadXY[1] = y0;
  quadXY[2] = x1;
  quadXY[3] = y1;
  quadXY[4] = x2;
  quadXY[5] = y2;
  quadXY[6] = x3;
  quadXY[7] = y3;
  fillPolygon(quadXY, quadStart, 0, 1, 0, 0, w, h, span);
}

/** Fill an axis-aligned ellipse (a ground circle seen in 2:1 projection has ry = rx / 2). */
export function fillEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  w: number,
  h: number,
  span: SpanFn,
): void {
  if (rx <= 0 || ry <= 0) return;
  let row0 = Math.ceil(cy - ry - 0.5);
  let row1 = Math.ceil(cy + ry - 0.5) - 1;
  if (row0 < 0) row0 = 0;
  if (row1 >= h) row1 = h - 1;
  for (let y = row0; y <= row1; y++) {
    const t = (y + 0.5 - cy) / ry;
    const half = rx * Math.sqrt(Math.max(0, 1 - t * t));
    let c0 = Math.ceil(cx - half - 0.5);
    let c1 = Math.ceil(cx + half - 0.5);
    if (c0 < 0) c0 = 0;
    if (c1 > w) c1 = w;
    if (c0 < c1) span(y, c0, c1);
  }
}

/** Twice the signed area of a ring: positive when it runs clockwise on screen (y down). */
export function ringArea2(xy: ArrayLike<number>, v0: number, v1: number): number {
  let sum = 0;
  let ax = xy[(v1 - 1) * 2];
  let ay = xy[(v1 - 1) * 2 + 1];
  for (let v = v0; v < v1; v++) {
    const bx = xy[v * 2];
    const by = xy[v * 2 + 1];
    sum += ax * by - bx * ay;
    ax = bx;
    ay = by;
  }
  return sum;
}
