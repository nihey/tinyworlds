import type { Polygons } from "../cities/types.js";
import { CITY } from "../config.js";
import type { Projection } from "../projection.js";
import { fillPolygon } from "../render/raster.js";

/**
 * How far every point is from the city, on a coarse grid in street-grid metres. The map is kept
 * out to `start` metres from the city and dissolves into nothing by `end` (both set per city):
 * in New York the near shore of New Jersey shows, the rest of it does not.
 */
export interface FogGrid {
  /** Grid origin and cell size, metres in (uptown, crosstown) space. */
  p0: number;
  q0: number;
  cell: number;
  cols: number;
  rows: number;
  /** Distance to the nearest city land, metres. 0 on it. */
  d: Float32Array;
}

export const FOG = { start: CITY.fog.start, end: CITY.fog.end, cell: 25 } as const;

/** Exact Euclidean distance transform (Felzenszwalb & Huttenlocher), in cells. */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e12;
  const out = new Float32Array(w * h);
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const dist = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  const pass = (len: number): void => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s: number;
      for (;;) {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s > z[k]) break;
        k--;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      dist[q] = (q - p) * (q - p) + f[p];
    }
  };

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = mask[y * w + x] ? 0 : INF;
    pass(h);
    for (let y = 0; y < h; y++) out[y * w + x] = dist[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    pass(w);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(dist[x]);
  }
  return out;
}

/** Grid extents that hold a set of projected points with room for the fog around them. */
function gridAround(pMin: number, pMax: number, qMin: number, qMax: number): Omit<FogGrid, "d"> {
  const { cell } = FOG;
  const pad = FOG.end + 20 * cell;
  const p0 = Math.floor((pMin - pad) / cell) * cell;
  const q0 = Math.floor((qMin - pad) / cell) * cell;
  return {
    p0,
    q0,
    cell,
    cols: Math.ceil((pMax + pad - p0) / cell),
    rows: Math.ceil((qMax + pad - q0) / cell),
  };
}

interface Raster extends Omit<FogGrid, "d"> {
  mask: Uint8Array;
}

/** Marks the cells of a fog grid that lon/lat polygons cover. */
function paint(polygons: Polygons, proj: Projection, grid: Omit<FogGrid, "d">, mask: Uint8Array): void {
  const { p0, q0, cell, cols, rows } = grid;
  for (const rings of polygons) {
    const xy: number[] = [];
    const starts = [0];
    for (const ring of rings) {
      for (const [lon, lat] of ring) {
        const [p, q] = proj.toGrid(lon, lat);
        xy.push((p - p0) / cell, (q - q0) / cell);
      }
      starts.push(xy.length / 2);
    }
    fillPolygon(xy, starts, 0, rings.length, 0, 0, cols, rows, (y, x0, x1) =>
      mask.fill(1, y * cols + x0, y * cols + x1),
    );
  }
}

/** Lon/lat polygons → a 0/1 raster on a fog grid sized to hold them. */
export function rasterize(polygons: Polygons, proj: Projection): Raster {
  let pMin = Infinity;
  let pMax = -Infinity;
  let qMin = Infinity;
  let qMax = -Infinity;
  const projected = polygons.map((rings) =>
    rings.map((ring) =>
      ring.map(([lon, lat]) => {
        const [p, q] = proj.toGrid(lon, lat);
        if (p < pMin) pMin = p;
        if (p > pMax) pMax = p;
        if (q < qMin) qMin = q;
        if (q > qMax) qMax = q;
        return [p, q] as const;
      }),
    ),
  );
  const grid = gridAround(pMin, pMax, qMin, qMax);
  const { p0, q0, cell, cols, rows } = grid;
  const mask = new Uint8Array(cols * rows);
  for (const rings of projected) {
    const xy: number[] = [];
    const starts = [0];
    for (const ring of rings) {
      for (const [p, q] of ring) xy.push((p - p0) / cell, (q - q0) / cell);
      starts.push(xy.length / 2);
    }
    fillPolygon(xy, starts, 0, rings.length, 0, 0, cols, rows, (y, x0, x1) =>
      mask.fill(1, y * cols + x0, y * cols + x1),
    );
  }
  return { ...grid, mask };
}

/** The fog around whatever the mask marks as city. */
export function fogFromMask(raster: Raster): FogGrid {
  const { mask, ...grid } = raster;
  const d = distanceTransform(mask, grid.cols, grid.rows);
  for (let i = 0; i < d.length; i++) d[i] *= grid.cell;
  return { ...grid, d };
}

/** The fog around a set of lon/lat polygons: the city is exactly what they cover. */
export function buildFog(polygons: Polygons, proj: Projection): FogGrid {
  return fogFromMask(rasterize(polygons, proj));
}

/** One building, as the built-up test sees it: where it stands and how much ground it covers. */
export interface Footprint {
  lon: number;
  lat: number;
  /** m² */
  area: number;
}

/** Side of the blocks the built-up test works in, in fog cells (4 × 25 m = a hectare). */
const BLOCK = 4;
/** A hectare is built-up when buildings cover at least this share of it… */
const BUILT_SHARE = 0.05;
/** …and it is city, not a farmstead, when this many of the 25 hectares around it are built-up too. */
const BUILT_NEIGHBOURS = 6;

/**
 * The fog around the built-up part of an area. For a municipality that is mostly farmland the
 * legal limits would make a map of fields, so the city is taken to be where the buildings are:
 * hectares with real building cover that have built-up neighbours, inside `limits`. Whatever
 * that leaves cut off from the part holding the origin (a lone factory, another village) is
 * dropped, so the map stays in one piece.
 */
export function buildFogBuiltUp(
  limits: Polygons,
  footprints: Iterable<Footprint>,
  proj: Projection,
  parks: Polygons = [],
): FogGrid {
  const raster = rasterize(limits, proj);
  const { p0, q0, cell, cols, rows, mask } = raster;
  const bc = Math.ceil(cols / BLOCK);
  const br = Math.ceil(rows / BLOCK);
  const cover = new Float32Array(bc * br);
  for (const f of footprints) {
    const [p, q] = proj.toGrid(f.lon, f.lat);
    const bx = Math.floor((p - p0) / cell / BLOCK);
    const by = Math.floor((q - q0) / cell / BLOCK);
    if (bx >= 0 && by >= 0 && bx < bc && by < br) cover[by * bc + bx] += f.area;
  }
  const blockArea = (cell * BLOCK) ** 2;
  const built = new Uint8Array(bc * br);
  for (let i = 0; i < built.length; i++) built[i] = cover[i] >= blockArea * BUILT_SHARE ? 1 : 0;
  const city = new Uint8Array(cols * rows);
  for (let by = 0; by < br; by++) {
    for (let bx = 0; bx < bc; bx++) {
      if (!built[by * bc + bx]) continue;
      let near = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = bx + dx;
          const y = by + dy;
          if (x >= 0 && y >= 0 && x < bc && y < br) near += built[y * bc + x];
        }
      }
      if (near < BUILT_NEIGHBOURS) continue;
      for (let y = by * BLOCK; y < Math.min(rows, (by + 1) * BLOCK); y++)
        for (let x = bx * BLOCK; x < Math.min(cols, (bx + 1) * BLOCK); x++)
          city[y * cols + x] = mask[y * cols + x];
    }
  }

  // a park too big to have buildings near its middle is still city, not a hole in the map
  if (parks.length > 0) {
    const park = new Uint8Array(cols * rows);
    paint(parks, proj, raster, park);
    for (let i = 0; i < city.length; i++) if (park[i]) city[i] = mask[i];
  }

  const fog = fogFromMask({ p0, q0, cell, cols, rows, mask: city });
  // keep the one piece of map that holds the origin
  const reach = new Uint8Array(cols * rows);
  const ox = Math.floor((0 - p0) / cell);
  const oy = Math.floor((0 - q0) / cell);
  const stack: number[] = [];
  const visit = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    const i = y * cols + x;
    if (reach[i] || fog.d[i] >= FOG.end) return;
    reach[i] = 1;
    stack.push(i);
  };
  visit(ox, oy);
  if (stack.length === 0) throw new Error("the city's origin is not in its built-up area");
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % cols;
    const y = (i - x) / cols;
    visit(x - 1, y);
    visit(x + 1, y);
    visit(x, y - 1);
    visit(x, y + 1);
  }
  for (let i = 0; i < fog.d.length; i++) if (!reach[i]) fog.d[i] = Math.max(fog.d[i], FOG.end + cell);
  return fog;
}

/** Distance to the city at a point in grid metres; far outside the grid counts as very far. */
export function fogAt(fog: FogGrid, p: number, q: number): number {
  const fx = (p - fog.p0) / fog.cell - 0.5;
  const fy = (q - fog.q0) / fog.cell - 0.5;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  if (x < 0 || y < 0 || x >= fog.cols - 1 || y >= fog.rows - 1) return 1e9;
  const tx = fx - x;
  const ty = fy - y;
  const i = y * fog.cols + x;
  const a = fog.d[i] + (fog.d[i + 1] - fog.d[i]) * tx;
  const b = fog.d[i + fog.cols] + (fog.d[i + fog.cols + 1] - fog.d[i + fog.cols]) * tx;
  return a + (b - a) * ty;
}
