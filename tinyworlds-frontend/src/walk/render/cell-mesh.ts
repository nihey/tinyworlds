import * as THREE from "three";
import { isMapDeck, type ElevatedWay, type GroundWay, type Volume, type WalkCell } from "../cell";
import { cellExists, type WalkIndex } from "../walk-index";
import { deckAt, JOIN_HEIGHT, PARAPET_HEIGHT, type WalkWorld } from "../world";
import {
  columnSide,
  cutTo,
  deckGeometry,
  directionAt,
  reachOf,
  SLAB_DEPTH,
  streetsBelow,
  type Box,
  type DeckSpan,
} from "./deck-mesh";
import { TREE_RAMPS, type WalkMaterials } from "./materials";
import {
  DEEP,
  G,
  groundPaint,
  HALF,
  HIGH,
  isWaterKind,
  LIT,
  SHADE,
  SHADES,
  type Palette,
} from "./palette";
import { groundKindAt, maskTexture, shoreFace, shoreSegments } from "./shore";

/**
 * One square of the walk as three.js meshes, ported from the spike's `buildCell`: its
 * buildings (walls with the map's windows, roofs), its ground and ways painted in the map's
 * rank order, the shore's edge, the decks of its elevated ways, its trees and cables, and the
 * edge of the data where the city ends. Everything is merged by material, one mesh each, in
 * metres from the square's south-west corner (x east, y up, z south), the group placed there.
 */

export interface MeshContext {
  palette: Palette;
  materials: WalkMaterials;
  index: WalkIndex;
  /** The squares loaded so far: where the water is, under a column near a square's edge too. */
  world: WalkWorld;
}

/** Draw order: the water first, then the ground (painted, then its depth), then the rest. */
export const ORDER_WATER = -200;
const ORDER_GROUND = -100;
const ORDER_GROUND_DEPTH = -90;
const ORDER_TREES = 1;

/** The water's surface, metres under the land (the simulation's too). */
export const WATER_SURFACE = -0.6;
/** A shore's edge stands from a little under the water up to the land. */
const SHORE_FOOT = WATER_SURFACE - 0.3;
/** How high the data's edge stands: above anything a camera looks at. */
const EDGE_TOP = 1000;
/** A parapet's thickness, metres. */
const PARAPET_THICK = 0.3;
/** The roadway sits this far over the way (and is drawn forward in depth), so it shows over the ground where a ramp comes down. */
const ROADWAY_LIFT = 0.02;

/** The pipeline's `mix` (scene/hash.ts). */
function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Vertices, triangles and named attributes, grown as a square is built, then one geometry. */
class Buf {
  pos: number[] = [];
  idx: number[] = [];
  private data: number[][];
  constructor(private readonly attrs: readonly (readonly [string, number])[]) {
    this.data = attrs.map(() => []);
  }
  get count(): number {
    return this.pos.length / 3;
  }
  /** One vertex at (x, y, z) local, its attributes' values in the order given to the constructor. */
  v(x: number, y: number, z: number, values: readonly number[]): number {
    this.pos.push(x, y, z);
    let at = 0;
    for (let a = 0; a < this.attrs.length; a++) {
      const size = this.attrs[a][1];
      for (let s = 0; s < size; s++) this.data[a].push(values[at++]);
    }
    return this.count - 1;
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }
  geometry(): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    this.attrs.forEach(([name, size], a) =>
      g.setAttribute(name, new THREE.Float32BufferAttribute(this.data[a], size)),
    );
    g.setIndex(this.idx);
    return g;
  }
}

const FLAT_ATTRS = [
  ["paint", 4],
  ["lane", 2],
  ["along", 1],
] as const;
const WALL_ATTRS = [
  ["uvm", 2],
  ["look", 4],
  ["dims", 4],
] as const;

/** Builds one square. Free it with `disposeCellMeshes`. */
export function buildCellMeshes(cell: WalkCell, ctx: MeshContext): THREE.Group {
  const { palette, materials, index, world } = ctx;
  const side = index.cell;
  const oe = cell.i * side;
  const on = cell.j * side;
  const sun = (index.sunDeg * Math.PI) / 180;
  const sunE = Math.sin(sun);
  const sunN = Math.cos(sun);
  /** A face's tone by its outward normal (e, n): lit, half or shade. */
  const toneOf = (ne: number, nn: number) => {
    const light = ne * sunE + nn * sunN;
    return light > 0.25 ? LIT : light > -0.25 ? HALF : SHADE;
  };
  const inSquare = (e: number, n: number) => e >= oe && e < oe + side && n >= on && n < on + side;

  const walls = new Buf(WALL_ATTRS);
  const roofs = new Buf(FLAT_ATTRS);
  const decks = new Buf(FLAT_ATTRS);
  const ground = new Buf(FLAT_ATTRS);
  const flatValues = (paint: readonly number[], across = 0, width = 0, along = 0) => [
    paint[0],
    paint[1],
    paint[2],
    paint[3],
    across,
    width,
    along,
  ];

  /**
   * A wall from (ae, an) to (be, bn), world metres, its foot and top at each end, in a wall
   * ramp and glass ramp with a pattern and seed (`look`, as a volume has them) and a tone (the
   * shade its wall colour takes: `toneOf` its outward normal, or darker for the shore).
   */
  const wall = (
    ae: number,
    an: number,
    aFoot: number,
    aTop: number,
    be: number,
    bn: number,
    bFoot: number,
    bTop: number,
    ramp: number,
    glass: number,
    pattern: number,
    seed: number,
    tone: number,
  ) => {
    const L = Math.hypot(be - ae, bn - an);
    if (L < 0.05) return;
    const H = Math.max(aTop - aFoot, bTop - bFoot);
    if (H < 0.01) return;
    const look = [ramp, glass, pattern, seed & 0xffff];
    const dims = [L, H, tone, seed >>> 16];
    const ax = ae - oe;
    const az = -(an - on);
    const bx = be - oe;
    const bz = -(bn - on);
    const v0 = walls.v(ax, aFoot, az, [0, 0, ...look, ...dims]);
    walls.v(bx, bFoot, bz, [L, 0, ...look, ...dims]);
    walls.v(bx, bTop, bz, [L, bTop - bFoot, ...look, ...dims]);
    walls.v(ax, aTop, az, [0, aTop - aFoot, ...look, ...dims]);
    walls.quad(v0, v0 + 1, v0 + 2, v0 + 3);
  };

  /** Rings (world metres, outer first) laid flat at height h into a buffer, with one paint. */
  const flat = (buf: Buf, rings: Float32Array[], h: number, paint: readonly number[]) => {
    const toV = (r: Float32Array) => {
      const out: THREE.Vector2[] = [];
      for (let k = 0; k < r.length; k += 2) out.push(new THREE.Vector2(r[k] - oe, r[k + 1] - on));
      return out;
    };
    if (rings.length === 0) return;
    const contour = toV(rings[0]);
    if (contour.length < 3) return;
    const holes = rings
      .slice(1)
      .map(toV)
      .filter((r) => r.length >= 3);
    let faces: number[][];
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    } catch {
      return;
    }
    const all = contour.concat(...holes);
    const base = buf.count;
    const values = flatValues(paint);
    for (const p of all) buf.v(p.x, h, -p.y, values);
    for (const f of faces) buf.idx.push(base + f[0], base + f[1], base + f[2]);
  };

  /** A flat quad through four world points (e, n, z), with a paint. */
  const flatQuad = (buf: Buf, pts: number[][], paint: readonly number[]) => {
    const values = flatValues(paint);
    const v0 = buf.count;
    for (const [e, n, z] of pts) buf.v(e - oe, z, -(n - on), values);
    buf.quad(v0, v0 + 1, v0 + 2, v0 + 3);
  };

  /**
   * A ribbon of a way's true width from (ae, an) to (be, bn), square ends reaching past both
   * ends by up to half a half-width so pieces overlap at the joins; z at either end.
   */
  const ribbon = (
    buf: Buf,
    ae: number,
    an: number,
    az: number,
    be: number,
    bn: number,
    bz: number,
    width: number,
    paint: readonly number[],
    along: number,
    reach: number,
  ) => {
    const de = be - ae;
    const dn = bn - an;
    const L = Math.hypot(de, dn);
    if (L < 0.01) return;
    const hw = width / 2;
    const ue = de / L;
    const un = dn / L;
    const pe = -un * hw;
    const pn = ue * hw;
    const x0e = ae - ue * reach - oe;
    const x0n = an - un * reach - on;
    const x1e = be + ue * reach - oe;
    const x1n = bn + un * reach - on;
    const a0 = along - reach;
    const a1 = along + L + reach;
    const v0 = buf.v(x0e + pe, az, -(x0n + pn), flatValues(paint, -1, width, a0));
    buf.v(x0e - pe, az, -(x0n - pn), flatValues(paint, 1, width, a0));
    buf.v(x1e - pe, bz, -(x1n - pn), flatValues(paint, 1, width, a1));
    buf.v(x1e + pe, bz, -(x1n + pn), flatValues(paint, -1, width, a1));
    buf.quad(v0, v0 + 1, v0 + 2, v0 + 3);
  };

  // ---- buildings (not the map's deck pieces: every elevated way has the walk's own roadway)
  for (const v of cell.volumes) if (!isMapDeck(v)) buildVolume(v);

  function buildVolume(v: Volume) {
    const wallTop = v.roofShape === 1 ? v.top + v.roofH : v.top;
    v.rings.forEach((r, ri) => {
      const k = r.length / 2;
      if (k < 3) return;
      const orient = Math.sign(signedArea(r)) * (ri === 0 ? 1 : -1);
      for (let a = 0; a < k; a++) {
        const b = (a + 1) % k;
        const ae = r[a * 2];
        const an = r[a * 2 + 1];
        const be = r[b * 2];
        const bn = r[b * 2 + 1];
        const L = Math.hypot(be - ae, bn - an);
        if (L < 0.05) continue;
        // the outward normal of a counter-clockwise ring is (dn, −de)
        const ne = (orient * (bn - an)) / L;
        const nn = (orient * -(be - ae)) / L;
        wall(
          ae,
          an,
          v.base,
          wallTop,
          be,
          bn,
          v.base,
          wallTop,
          v.wall,
          v.glass,
          v.pattern,
          v.seed,
          toneOf(ne, nn),
        );
      }
    });
    const roofPaint = [v.roof * SHADES + LIT, v.roof * SHADES + HALF, 0.06, 0];
    const outer = v.rings[0];
    if ((v.roofShape === 2 || v.roofShape === 3) && v.roofH > 0.5 && outer && outer.length >= 6)
      taperedRoof(v, outer);
    else flat(roofs, v.rings, wallTop, roofPaint);
    // anything standing on nothing has an underside, in its walls' deep shade
    if (v.base > 0.3) {
      const under = v.wall * SHADES + DEEP;
      flat(roofs, v.rings, v.base, [under, under, 0, 0]);
    }
  }

  /** A spire (to a point) or a dome (in bands), each face toned by the sun. */
  function taperedRoof(v: Volume, r: Float32Array) {
    const k = r.length / 2;
    let ce = 0;
    let cn = 0;
    for (let a = 0; a < k; a++) {
      ce += r[a * 2];
      cn += r[a * 2 + 1];
    }
    ce /= k;
    cn /= k;
    const bands = v.roofShape === 3 ? 4 : 1;
    const ring = (f: number) => {
      const scale = v.roofShape === 3 ? Math.sqrt(Math.max(0, 1 - f * f)) : 1 - f;
      return { scale, h: v.top + v.roofH * f };
    };
    for (let band = 0; band < bands; band++) {
      const lo = ring(band / bands);
      const hi = ring((band + 1) / bands);
      for (let a = 0; a < k; a++) {
        const b = (a + 1) % k;
        const ae = r[a * 2];
        const an = r[a * 2 + 1];
        const be = r[b * 2];
        const bn = r[b * 2 + 1];
        // the face leans out the way its edge's midpoint lies from the middle
        const me = (ae + be) / 2 - ce;
        const mn = (an + bn) / 2 - cn;
        const ml = Math.hypot(me, mn) || 1;
        const tone = toneOf(me / ml, mn / ml);
        const paint = [v.roof * SHADES + tone, v.roof * SHADES + tone, 0, 0];
        const at = (e: number, n: number, s: { scale: number; h: number }) => [
          ce + (e - ce) * s.scale,
          cn + (n - cn) * s.scale,
          s.h,
        ];
        flatQuad(roofs, [at(ae, an, lo), at(be, bn, lo), at(be, bn, hi), at(ae, an, hi)], paint);
      }
    }
  }

  // ---- ground: an underlay of pavement, then every polygon and way in the map's paint order,
  // cut where the mask is water so the water below shows; then the ground's depth
  const group = new THREE.Group();
  group.position.set(oe, 0, -on);
  const disposables: { dispose(): void }[] = [];
  let mask: THREE.DataTexture | null = null;
  if (cell.mask.mode !== 1) {
    if (cell.mask.mode === 2) {
      mask = maskTexture(cell.mask.bits!);
      disposables.push(mask);
    }
    flatQuad(
      ground,
      [
        [oe, on, 0],
        [oe + side, on, 0],
        [oe + side, on + side, 0],
        [oe, on + side, 0],
      ],
      groundPaint(palette, G.Land),
    );
    const rank = index.paintRank;
    const items: { rank: number; order: number; draw: () => void }[] = [];
    for (const g of cell.ground) {
      if (isWaterKind(g.kind)) continue;
      items.push({
        rank: rank[g.kind] ?? g.kind,
        order: g.order,
        draw: () => flat(ground, g.rings, 0, groundPaint(palette, g.kind)),
      });
    }
    for (const w of cell.ways)
      items.push({
        rank: (rank[w.kind] ?? w.kind) + 0.25,
        order: w.order,
        draw: () => groundWay(w),
      });
    items.sort((a, b) => a.rank - b.rank || a.order - b.order);
    for (const it of items) it.draw();
  }

  function groundWay(w: GroundWay) {
    const paint = groundPaint(palette, w.kind);
    const p = w.pts;
    let along = 0;
    for (let k = 2; k + 1 < p.length; k += 2) {
      const L = Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
      ribbon(ground, p[k - 2], p[k - 1], 0, p[k], p[k + 1], 0, w.width, paint, along, w.width / 4);
      along += L;
    }
  }

  // ---- the shore's edge: quay stone along paved land and piers, a bank elsewhere
  if (cell.mask.mode === 2) shoreEdge(cell, cell.mask.bits!);

  function shoreEdge(c: WalkCell, bits: Uint8Array) {
    const kindAt = groundKindAt(c, index.paintRank);
    for (const [ae, an, be, bn] of shoreSegments(bits, side)) {
      // land lies to the left of each segment, the water to its right
      const L = Math.hypot(be - ae, bn - an);
      const ne = (bn - an) / L;
      const nn = -(be - ae) / L;
      const kind = kindAt(oe + (ae + be) / 2 - ne * 1.5, on + (an + bn) / 2 - nn * 1.5);
      const { ramp, shade } = shoreFace(palette, kind, toneOf(ne, nn));
      wall(
        oe + ae,
        on + an,
        SHORE_FOOT,
        0,
        oe + be,
        on + bn,
        SHORE_FOOT,
        0,
        ramp,
        ramp,
        0,
        0,
        shade,
      );
    }
  }

  // ---- elevated ways: what holds them up where the map has nothing, parapets, the roadway
  const concrete = palette.ramp("concrete");
  const underStreet = streetsBelow(cell.streets);
  const under = (e: number, n: number) => world.isWater(e, n) || underStreet(e, n);
  const square = [oe, on, oe + side, on + side] as const;
  for (const way of cell.elevated) buildDeck(way);

  function buildDeck(way: ElevatedWay) {
    // a parapet opens where it runs inside another way's strip at about its height (as the
    // walls the simulation uses do); the other ways are asked only along the stretch of this
    // one that reaches the square, cut to what lies near it, which answers the same there
    const reach = reachOf(way, square);
    if (!reach) return;
    const others: { o: ElevatedWay; b: Box }[] = [];
    for (const o of cell.elevated) {
      if (o === way) continue;
      const near = cutTo(o, reach);
      if (near) others.push({ o: near, b: reachOf(near, reach) ?? reach });
    }
    const open =
      others.length === 0
        ? undefined
        : (e: number, n: number, z: number) =>
            others.some(({ o, b }) => {
              if (e < b[0] || e > b[2] || n < b[1] || n > b[3]) return false;
              const oz = deckAt(o, e, n);
              return oz !== null && Math.abs(oz - z) <= JOIN_HEIGHT;
            });
    const g = deckGeometry(way, under, { open, within: square });
    const mid = (s: DeckSpan) => inSquare((s.e0 + s.e1) / 2, (s.n0 + s.n1) / 2);
    const hw = way.width / 2;
    const roadPaint = groundPaint(
      palette,
      way.kind === 1 ? G.Path : way.kind === 2 ? G.Rail : way.width >= 14 ? G.Highway : G.Road,
    );

    for (const s of g.surface) {
      if (!mid(s)) continue;
      ribbon(
        decks,
        s.e0,
        s.n0,
        s.z0 + ROADWAY_LIFT,
        s.e1,
        s.n1,
        s.z1 + ROADWAY_LIFT,
        way.width,
        roadPaint,
        s.along,
        Math.min(hw / 2, 2),
      );
    }

    const underside = concrete * SHADES + DEEP;
    for (const s of g.slab) {
      if (!mid(s)) continue;
      const L = Math.hypot(s.e1 - s.e0, s.n1 - s.n0);
      if (L < 1e-6) continue;
      const le = -(s.n1 - s.n0) / L;
      const ln = (s.e1 - s.e0) / L;
      const aFoot = Math.max(0, s.z0 - SLAB_DEPTH);
      const bFoot = Math.max(0, s.z1 - SLAB_DEPTH);
      for (const sd of [1, -1]) {
        const oe2 = le * hw * sd;
        const on2 = ln * hw * sd;
        wall(
          s.e0 + oe2,
          s.n0 + on2,
          aFoot,
          s.z0,
          s.e1 + oe2,
          s.n1 + on2,
          bFoot,
          s.z1,
          concrete,
          concrete,
          0,
          0,
          toneOf(le * sd, ln * sd),
        );
      }
      if (Math.max(s.z0, s.z1) > SLAB_DEPTH + 0.05)
        flatQuad(
          roofs,
          [
            [s.e0 + le * hw, s.n0 + ln * hw, aFoot],
            [s.e1 + le * hw, s.n1 + ln * hw, bFoot],
            [s.e1 - le * hw, s.n1 - ln * hw, bFoot],
            [s.e0 - le * hw, s.n0 - ln * hw, aFoot],
          ],
          [underside, underside, 0, 0],
        );
    }

    const top = concrete * SHADES + HIGH;
    const t = PARAPET_THICK / 2;
    for (const s of g.parapets) {
      if (!mid(s)) continue;
      const L = Math.hypot(s.e1 - s.e0, s.n1 - s.n0);
      if (L < 1e-6) continue;
      const le = -(s.n1 - s.n0) / L;
      const ln = (s.e1 - s.e0) / L;
      const a1 = s.z0 + PARAPET_HEIGHT;
      const b1 = s.z1 + PARAPET_HEIGHT;
      for (const sd of [1, -1])
        wall(
          s.e0 + le * t * sd,
          s.n0 + ln * t * sd,
          s.z0,
          a1,
          s.e1 + le * t * sd,
          s.n1 + ln * t * sd,
          s.z1,
          b1,
          concrete,
          concrete,
          0,
          0,
          toneOf(le * sd, ln * sd),
        );
      flatQuad(
        roofs,
        [
          [s.e0 + le * t, s.n0 + ln * t, a1],
          [s.e1 + le * t, s.n1 + ln * t, b1],
          [s.e1 - le * t, s.n1 - ln * t, b1],
          [s.e0 - le * t, s.n0 - ln * t, a1],
        ],
        [top, top, 0, 0],
      );
    }

    const half = columnSide(way.width) / 2;
    for (const [e, n, h] of g.columns) {
      if (!inSquare(e, n) || h < 0.2) continue;
      const [ue, un] = directionAt(way, e, n);
      const corner = (a: number, b: number) => [e + ue * a - un * b, n + un * a + ue * b];
      const cs = [
        corner(half, half),
        corner(-half, half),
        corner(-half, -half),
        corner(half, -half),
      ];
      for (let q = 0; q < 4; q++) {
        const [ae, an] = cs[q];
        const [be, bn] = cs[(q + 1) % 4];
        const L = Math.hypot(be - ae, bn - an);
        wall(
          ae,
          an,
          0,
          h,
          be,
          bn,
          0,
          h,
          concrete,
          concrete,
          0,
          0,
          toneOf((bn - an) / L, -(be - ae) / L),
        );
      }
    }
  }

  // ---- the edge of the data: a wall in the fog on every side with no square beyond
  const edges = new Buf([]);
  const sides: [number, number, number, number, number, number][] = [
    [-1, 0, 0, 0, 0, side],
    [1, 0, side, 0, side, side],
    [0, -1, 0, 0, side, 0],
    [0, 1, 0, side, side, side],
  ];
  for (const [di, dj, x0, y0, x1, y1] of sides) {
    if (cellExists(index, cell.i + di, cell.j + dj)) continue;
    const v0 = edges.v(x0, -2, -y0, []);
    edges.v(x1, -2, -y1, []);
    edges.v(x1, EDGE_TOP, -y1, []);
    edges.v(x0, EDGE_TOP, -y0, []);
    edges.quad(v0, v0 + 1, v0 + 2, v0 + 3);
  }

  // ---- meshes
  const add = (geometry: THREE.BufferGeometry | null, material: THREE.Material, order = 0) => {
    if (!geometry) return null;
    disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    return mesh;
  };
  const groundGeometry = ground.geometry();
  if (groundGeometry) {
    const { colour, depth } = materials.ground(mask);
    disposables.push(colour, depth);
    add(groundGeometry, colour, ORDER_GROUND);
    const plate = new THREE.PlaneGeometry(side, side);
    plate.rotateX(-Math.PI / 2);
    plate.translate(side / 2, 0, -side / 2);
    for (const [name, size] of FLAT_ATTRS)
      plate.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(4 * size), size));
    add(plate, depth, ORDER_GROUND_DEPTH);
  }
  add(walls.geometry(), materials.wall);
  add(roofs.geometry(), materials.roof);
  add(decks.geometry(), materials.deck);
  add(edges.geometry(), materials.edge);
  addTrees(cell, ctx, group, disposables);
  addCables(cell, ctx, group, disposables);
  group.userData.disposables = disposables;
  return group;
}

/** Frees what `buildCellMeshes` made: its geometries, its own materials and its mask. */
export function disposeCellMeshes(group: THREE.Group): void {
  const list = group.userData.disposables as { dispose(): void }[] | undefined;
  if (list) for (const d of list) d.dispose();
  group.userData.disposables = [];
  group.clear();
}

function signedArea(r: Float32Array): number {
  let a = 0;
  const k = r.length / 2;
  for (let i = 0, j = k - 1; i < k; j = i++) a += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
  return a / 2;
}

/** Trees as upright billboards, one instanced mesh: each a crown kind from the map's leaf ramps. */
function addTrees(
  cell: WalkCell,
  ctx: MeshContext,
  group: THREE.Group,
  disposables: { dispose(): void }[],
) {
  const t = cell.trees;
  const count = t.length / 3;
  if (count === 0) return;
  const oe = cell.i * ctx.index.cell;
  const on = cell.j * ctx.index.cell;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3),
  );
  geometry.setAttribute(
    "corner",
    new THREE.Float32BufferAttribute([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const offset = new Float32Array(count * 3);
  const look = new Float32Array(count * 2);
  for (let k = 0; k < count; k++) {
    const e = t[k * 3];
    const n = t[k * 3 + 1];
    const kind = t[k * 3 + 2];
    offset[k * 3] = e - oe;
    offset[k * 3 + 1] = 0;
    offset[k * 3 + 2] = -(n - on);
    const h = mix(kind, mix(Math.round(e * 10), Math.round(n * 10)));
    look[k * 2] = 7 + ((h & 1023) / 1024) * 4;
    look[k * 2 + 1] = crownKind((h >>> 10) % 200);
  }
  geometry.setAttribute("offset", new THREE.InstancedBufferAttribute(offset, 3));
  geometry.setAttribute("look", new THREE.InstancedBufferAttribute(look, 2));
  geometry.instanceCount = count;
  const side = ctx.index.cell;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(side / 2, 6, -side / 2),
    side * 0.75,
  );
  disposables.push(geometry);
  const mesh = new THREE.Mesh(geometry, ctx.materials.tree);
  mesh.renderOrder = ORDER_TREES;
  mesh.matrixAutoUpdate = false;
  group.add(mesh);
}

/** The map's temperate share of leaf colours (`treeRamp`), as an index into `TREE_RAMPS`. */
function crownKind(r: number): number {
  if (r < 78) return TREE_RAMPS.indexOf("leaf");
  if (r < 124) return TREE_RAMPS.indexOf("leafLight");
  if (r < 189) return TREE_RAMPS.indexOf("leafDark");
  if (r < 197) return TREE_RAMPS.indexOf("leafAutumn");
  return TREE_RAMPS.indexOf("leafRed");
}

/** Cables and truss members as thin lines in their steel (`drawCables` in `render/chunk.ts`). */
function addCables(
  cell: WalkCell,
  ctx: MeshContext,
  group: THREE.Group,
  disposables: { dispose(): void }[],
) {
  if (cell.cables.length === 0) return;
  const oe = cell.i * ctx.index.cell;
  const on = cell.j * ctx.index.cell;
  const steel = ctx.palette.ramp("steel");
  const tan = ctx.palette.ramp("tan");
  const pos: number[] = [];
  const colour: number[] = [];
  for (const c of cell.cables) {
    const truss = c.kind >= 2;
    const main = c.kind === 0 || c.kind === 2;
    const idx = (truss ? tan : steel) * SHADES + (main ? DEEP : SHADE);
    const p = c.pts;
    for (let q = 3; q < p.length; q += 3) {
      pos.push(p[q - 3] - oe, p[q - 1], -(p[q - 2] - on), p[q] - oe, p[q + 2], -(p[q + 1] - on));
      colour.push(idx, idx);
    }
  }
  if (pos.length === 0) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("colour", new THREE.Float32BufferAttribute(colour, 1));
  disposables.push(geometry);
  const lines = new THREE.LineSegments(geometry, ctx.materials.cable);
  lines.matrixAutoUpdate = false;
  group.add(lines);
}
