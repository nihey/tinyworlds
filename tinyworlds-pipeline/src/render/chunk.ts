import { hash2, mix } from "../scene/hash.js";
import { F_FLOATING, F_NO_OUTLINE, G, G_COUNT, isWater, PAINT_RANK, Pattern, Roof } from "../scene/kinds.js";
import { groundColor, type GroundContext } from "./ground.js";
import {
  idx,
  R,
  RAMP_COUNT,
  S_DEEP,
  S_HALF,
  S_HIGH,
  S_LIT,
  S_SHADE,
  SHADES,
  TRANSPARENT,
} from "./palette.js";
import { fillEllipse, fillPolygon, fillQuad, ringArea2 } from "./raster.js";
import type { Scene } from "./scene.js";
import { TREE_FOREST, TREE_PARK, TREE_SCRUB, TREE_STREET, treeRamp, treeSprite } from "./sprites.js";

/**
 * Renders one rectangle of the map.
 *
 * The picture is built the way a model-maker would build the city:
 *
 *   1. ground     every pixel gets a kind (water, pavement, park, road…)
 *   2. heights    footprints are stamped into a height map, then swept away from the sun, which
 *                 turns it into "how high the shadow reaches here"
 *   3. volumes    walls and roofs are drawn into a height buffer: in this projection the surface
 *                 a pixel shows is simply the highest one along its line of sight
 *   4. finish     ground textures, cast shadows, outlines and highlights, then the fog
 *
 * Everything is integer pixels and palette indices. There is no anti-aliasing anywhere.
 */

export interface ChunkJob {
  /** Rectangle to render, map px. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** Feature ids to consider. Ground and lines must be in paint order. */
  ground: Uint32Array;
  lines: Uint32Array;
  /** Volumes that may show in the rectangle. */
  vols: Uint32Array;
  /** Volumes that may cast a shadow into it (a superset of `vols`). */
  casters: Uint32Array;
  trees: Uint32Array;
  cables: Uint32Array;
  /** How far left of the rectangle shadow casters reach, and how far below it visible volumes stand. */
  marginLeft: number;
  marginDown: number;
  /** False when the rectangle lies entirely inside the city: skips every fog test. */
  foggy: boolean;
  /**
   * Keep only what `vols` draw, everything else transparent: one structure on its own, with
   * the shadows `casters` throw on it, as the tiles show it but with nothing in front of it.
   */
  alone?: boolean;
}

/** Sun from the west-south-west: shadows fall straight to the right on screen. */
export const SUN_BEARING = 254;
/** Px of height a shadow loses per px it travels: 1 means a shadow as long as the thing is tall. */
export const SUN_DROP = 1.05;
/** Ground context kept around a rectangle: shoreline distance, scattered trees. */
export const PAD = 48;
/** Screen context kept around a rectangle: outlines look one pixel past the edge. */
const EDGE = 2;

const F_GROUND = 0;
const F_ROOF = 1;
const F_SHAPED = 2;
const F_WALL_LIT = 3;
const F_WALL_HALF = 4;
const F_WALL_SHADE = 5;
const F_TREE = 6;

const LINE_BRIDGE = 1;

// what a tree-scatter lattice cell holds, by ground kind (chance out of 256)
const TREE_CHANCE = new Uint8Array(G_COUNT);
TREE_CHANCE[G.Forest] = 235;
TREE_CHANCE[G.Park] = 64;
TREE_CHANCE[G.Cemetery] = 36;
TREE_CHANCE[G.Scrub] = 46;
TREE_CHANCE[G.Garden] = 40;
TREE_CHANCE[G.Lawn] = 9;
TREE_CHANCE[G.Fairway] = 5;
TREE_CHANCE[G.Wetland] = 10;
TREE_CHANCE[G.Steppe] = 5;
TREE_CHANCE[G.Meadow] = 6;
const CELL_X = 9;
const CELL_Y = 5;

/** Kinds a mapped tree may stand on. */
const TREE_OK = new Uint8Array(G_COUNT).fill(1);
for (const kind of [
  G.Water,
  G.Lake,
  G.Pool,
  G.Road,
  G.RoadMajor,
  G.Highway,
  G.Runway,
  G.Taxiway,
  G.Rail,
  G.Service,
  G.Court,
  G.CourtGreen,
  G.Track,
  G.Cobble,
  G.DirtRoad,
])
  TREE_OK[kind] = 0;

// palette index → the same material one step lighter / darker / in cast shadow
const PALETTE_SIZE = RAMP_COUNT * SHADES;
const LIGHTER = new Uint16Array(PALETTE_SIZE);
const DARKER = new Uint16Array(PALETTE_SIZE);
const SHADOWED = new Uint16Array(PALETTE_SIZE);
for (let c = 0; c < PALETTE_SIZE; c++) {
  const shade = c % SHADES;
  const ramp = c - shade;
  LIGHTER[c] = ramp + Math.min(SHADES - 1, shade + 1);
  DARKER[c] = ramp + Math.max(0, shade - 1);
  SHADOWED[c] = ramp + (shade >= S_LIT ? shade - 2 : shade === S_HALF ? S_SHADE : shade);
}

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20,
  62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

export class ChunkRenderer {
  private readonly scene: Scene;
  private readonly sunP: number;
  private readonly sunQ: number;

  // ground space
  private gk = new Uint8Array(0);
  private gh = new Uint16Array(0);
  private wd = new Uint8Array(0);
  private gx0 = 0;
  private gy0 = 0;
  private GW = 0;
  private GH = 0;

  // screen space
  private col = new Uint16Array(0);
  private hb = new Int16Array(0);
  private obj = new Int32Array(0);
  private face = new Uint8Array(0);
  private sx0 = 0;
  private sy0 = 0;
  private SW = 0;
  private SH = 0;

  private scratch = new Float64Array(256);
  private scatter: number[] = [];

  constructor(scene: Scene) {
    this.scene = scene;
    const rel = ((SUN_BEARING - scene.geo.betaDeg) * Math.PI) / 180;
    this.sunP = Math.cos(rel);
    this.sunQ = Math.sin(rel);
  }

  render(job: ChunkJob): Uint16Array {
    this.allocate(job);
    this.paintGround(job);
    this.paintLines(job);
    this.shoreDistance();
    this.stampHeights(job);
    this.drawVolumes(job);
    this.drawCables(job);
    this.drawTrees(job);
    return this.finish(job);
  }

  // -------------------------------------------------------------------------------------------

  private allocate(job: ChunkJob): void {
    const left = Math.max(PAD, Math.ceil(job.marginLeft));
    const down = PAD + Math.ceil(job.marginDown);
    this.gx0 = job.x0 - left;
    this.gy0 = job.y0 - PAD;
    this.GW = job.w + left + PAD;
    this.GH = job.h + PAD + down;
    const gn = this.GW * this.GH;
    if (this.gk.length < gn) {
      this.gk = new Uint8Array(gn);
      this.gh = new Uint16Array(gn);
      this.wd = new Uint8Array(gn);
    }
    this.gk.fill(G.Water, 0, gn);
    this.gh.fill(0, 0, gn);

    this.sx0 = job.x0 - EDGE;
    this.sy0 = job.y0 - EDGE;
    this.SW = job.w + EDGE * 2;
    this.SH = job.h + EDGE * 2;
    const sn = this.SW * this.SH;
    if (this.col.length < sn) {
      this.col = new Uint16Array(sn);
      this.hb = new Int16Array(sn);
      this.obj = new Int32Array(sn);
      this.face = new Uint8Array(sn);
    }
    this.hb.fill(0, 0, sn);
    this.obj.fill(0, 0, sn);
    this.face.fill(F_GROUND, 0, sn);
  }

  // ---- 1. ground ------------------------------------------------------------------------------

  private paintGround(job: ChunkJob): void {
    const { ground } = this.scene;
    const { gk, GW, GH, gx0, gy0 } = this;
    for (let n = 0; n < job.ground.length; n++) {
      const f = job.ground[n];
      const kind = ground.kind[f];
      // land, lakes and piers go anywhere; everything else lies on land and never spills into the sea
      const anywhere = kind === G.Land || kind === G.Lake || kind === G.Pool || kind === G.Pier;
      fillPolygon(
        ground.xy,
        ground.vertStart,
        ground.ringStart[f],
        ground.ringStart[f + 1],
        gx0,
        gy0,
        GW,
        GH,
        (y, a, b) => {
          const row = y * GW;
          if (anywhere) gk.fill(kind, row + a, row + b);
          else for (let i = row + a; i < row + b; i++) if (gk[i] !== G.Water) gk[i] = kind;
        },
      );
    }
  }

  private paintLines(job: ChunkJob): void {
    const { lines, geo } = this.scene;
    const { gk, GW, GH, gx0, gy0 } = this;
    const k = geo.k;
    for (let n = 0; n < job.lines.length; n++) {
      const f = job.lines[n];
      const kind = lines.kind[f];
      const half = lines.width[f] / 2;
      const rank = PAINT_RANK[kind];
      const overWater = (lines.flags[f] & LINE_BRIDGE) !== 0 || kind === G.Pier || kind === G.Lake;
      const span = (y: number, a: number, b: number): void => {
        const row = y * GW;
        if (overWater) gk.fill(kind, row + a, row + b);
        else
          for (let i = row + a; i < row + b; i++) {
            const under = gk[i];
            if (under !== G.Water && under !== G.Lake && PAINT_RANK[under] < rank) gk[i] = kind;
          }
      };
      // a ground circle of this radius is an ellipse twice as wide as it is tall
      const rx = half * k * Math.SQRT2;
      const v0 = lines.vertStart[f];
      const v1 = lines.vertStart[f + 1];
      let ax = lines.xy[v0 * 2] - gx0;
      let ay = lines.xy[v0 * 2 + 1] - gy0;
      for (let v = v0 + 1; v < v1; v++) {
        const bx = lines.xy[v * 2] - gx0;
        const by = lines.xy[v * 2 + 1] - gy0;
        const dx = bx - ax;
        const dy = by - ay;
        // the segment in metres, to offset it sideways by a true half-width
        const dp = (dx / 2 - dy) / k;
        const dq = (dx / 2 + dy) / k;
        const len = Math.hypot(dp, dq);
        if (len > 1e-6) {
          const np = (-dq / len) * half;
          const nq = (dp / len) * half;
          const ox = (np + nq) * k;
          const oy = ((nq - np) * k) / 2;
          fillQuad(ax + ox, ay + oy, bx + ox, by + oy, bx - ox, by - oy, ax - ox, ay - oy, GW, GH, span);
          if (rx >= 1.5 && v + 1 < v1) fillEllipse(bx, by, rx, rx / 2, GW, GH, span);
        }
        ax = bx;
        ay = by;
      }
    }
  }

  /** Chamfer distance (in fifths of a px, capped) from every water pixel to the nearest dry one. */
  private shoreDistance(): void {
    const { gk, wd, GW, GH } = this;
    const n = GW * GH;
    const CAP = 200;
    for (let i = 0; i < n; i++) wd[i] = isWater(gk[i]) ? CAP : 0;
    for (let y = 1; y < GH; y++) {
      for (let x = 1; x < GW - 1; x++) {
        const i = y * GW + x;
        let d = wd[i];
        if (d === 0) continue;
        if (wd[i - 1] + 5 < d) d = wd[i - 1] + 5;
        if (wd[i - GW] + 5 < d) d = wd[i - GW] + 5;
        if (wd[i - GW - 1] + 7 < d) d = wd[i - GW - 1] + 7;
        if (wd[i - GW + 1] + 7 < d) d = wd[i - GW + 1] + 7;
        wd[i] = d;
      }
    }
    for (let y = GH - 2; y >= 0; y--) {
      for (let x = GW - 2; x >= 1; x--) {
        const i = y * GW + x;
        let d = wd[i];
        if (d === 0) continue;
        if (wd[i + 1] + 5 < d) d = wd[i + 1] + 5;
        if (wd[i + GW] + 5 < d) d = wd[i + GW] + 5;
        if (wd[i + GW + 1] + 7 < d) d = wd[i + GW + 1] + 7;
        if (wd[i + GW - 1] + 7 < d) d = wd[i + GW - 1] + 7;
        wd[i] = d;
      }
    }
  }

  // ---- 2. heights and shadows -----------------------------------------------------------------

  private stampHeights(job: ChunkJob): void {
    const { vol, trees } = this.scene;
    const { gh, gk, GW, GH, gx0, gy0 } = this;

    for (let n = 0; n < job.casters.length; n++) {
      const v = job.casters[n];
      if (job.foggy && !this.volumeVisible(v)) continue;
      const shaped = vol.roofShape[v] === Roof.Pyramid || vol.roofShape[v] === Roof.Dome;
      if (vol.flags[v] & F_FLOATING) {
        // a deck in the air: lay its shadow on the ground where the sun throws it, and nowhere else
        const reach = Math.round(vol.top[v] / SUN_DROP);
        fillPolygon(
          vol.xy,
          vol.vertStart,
          vol.ringStart[v],
          vol.ringStart[v + 1],
          gx0 - reach,
          gy0,
          GW,
          GH,
          (y, a, b) => {
            const row = y * GW;
            for (let i = row + a; i < row + b; i++) if (gh[i] < 12) gh[i] = 12;
          },
        );
        continue;
      }
      const h8 = Math.min(65535, Math.round((vol.top[v] + vol.roofH[v] * (shaped ? 0.5 : 1)) * 8));
      fillPolygon(
        vol.xy,
        vol.vertStart,
        vol.ringStart[v],
        vol.ringStart[v + 1],
        gx0,
        gy0,
        GW,
        GH,
        (y, a, b) => {
          const row = y * GW;
          for (let i = row + a; i < row + b; i++) if (gh[i] < h8) gh[i] = h8;
        },
      );
    }

    // trees: the mapped ones, then one per lattice cell wherever the ground calls for them
    const scatter = this.scatter;
    scatter.length = 0;
    for (let n = 0; n < job.trees.length; n++) {
      const t = job.trees[n];
      const x = Math.round(trees.xy[t * 2]);
      const y = Math.round(trees.xy[t * 2 + 1]);
      const gx = x - gx0;
      const gy = y - gy0;
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
      const i = gy * GW + gx;
      if (gh[i] !== 0 || !TREE_OK[gk[i]]) continue;
      const kind = gk[i];
      scatter.push(
        x,
        y,
        mix(trees.kind[t], t),
        kind === G.Park || kind === G.Forest || kind === G.Lawn ? TREE_PARK : TREE_STREET,
      );
    }
    const cx0 = Math.floor((job.x0 - 16) / CELL_X);
    const cx1 = Math.ceil((job.x0 + job.w + 16) / CELL_X);
    const cy0 = Math.floor((job.y0 - 8) / CELL_Y);
    const cy1 = Math.ceil((job.y0 + job.h + 24) / CELL_Y);
    for (let cy = cy0; cy < cy1; cy++) {
      for (let cx = cx0; cx < cx1; cx++) {
        const h = hash2(cx, cy);
        const x = cx * CELL_X + (h & 7);
        const y = cy * CELL_Y + ((h >>> 3) & 3);
        const gx = x - gx0;
        const gy = y - gy0;
        if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
        const i = gy * GW + gx;
        const chance = TREE_CHANCE[gk[i]];
        if (chance === 0 || ((h >>> 8) & 255) >= chance || gh[i] !== 0) continue;
        const kind = gk[i];
        scatter.push(
          x,
          y,
          h >>> 16,
          kind === G.Forest
            ? TREE_FOREST
            : kind === G.Scrub || kind === G.Wetland || kind === G.Garden || kind === G.Steppe
              ? TREE_SCRUB
              : TREE_PARK,
        );
      }
    }
    // trees cast a little shadow too
    for (let n = 0; n < scatter.length; n += 4) {
      const r = treeSprite(scatter[n + 3], scatter[n + 2]).r;
      const tall = r * 14;
      fillEllipse(scatter[n] - gx0 + 0.5, scatter[n + 1] - gy0 + 0.5, r * 0.8, r * 0.4, GW, GH, (y, a, b) => {
        const row = y * GW;
        for (let i = row + a; i < row + b; i++) if (gh[i] < tall) gh[i] = tall;
      });
    }

    // sweep away from the sun: each pixel learns how high the shadow stands above it
    const drop = Math.round(SUN_DROP * 8);
    for (let y = 0; y < GH; y++) {
      let s = 0;
      const end = (y + 1) * GW;
      for (let i = y * GW; i < end; i++) {
        s -= drop;
        const v = gh[i];
        if (v >= s) s = v;
        else gh[i] = s;
      }
    }
  }

  // ---- fog --------------------------------------------------------------------------------------

  /** Distance from the city (metres) at a ground position in map px. */
  private fogDistance(x: number, y: number): number {
    const { fog, geo } = this.scene;
    const sum = x / geo.k;
    const diff = (2 * y) / geo.k;
    const fx = ((sum - diff) / 2 - fog.p0) / fog.cell - 0.5;
    const fy = ((sum + diff) / 2 - fog.q0) / fog.cell - 0.5;
    const gx = Math.floor(fx);
    const gy = Math.floor(fy);
    if (gx < 0 || gy < 0 || gx >= fog.cols - 1 || gy >= fog.rows - 1) return 1e9;
    const tx = fx - gx;
    const ty = fy - gy;
    const i = gy * fog.cols + gx;
    const a = fog.d[i] + (fog.d[i + 1] - fog.d[i]) * tx;
    const b = fog.d[i + fog.cols] + (fog.d[i + fog.cols + 1] - fog.d[i + fog.cols]) * tx;
    return a + (b - a) * ty;
  }

  /** Buildings thin out before the ground does, so none is left standing on nothing. */
  private volumeVisible(v: number): boolean {
    const { vol, fog } = this.scene;
    const d = this.fogDistance(vol.center[v * 2], vol.center[v * 2 + 1]);
    if (d <= fog.start) return true;
    const cut = fog.start + (mix(vol.seed[v], 31) / 4294967296) * (fog.end - fog.start) * 0.6;
    return d < cut;
  }

  // ---- 3. volumes -----------------------------------------------------------------------------

  private drawVolumes(job: ChunkJob): void {
    for (let n = 0; n < job.vols.length; n++) {
      const v = job.vols[n];
      if (job.foggy && !this.volumeVisible(v)) continue;
      this.drawVolume(v);
    }
  }

  private drawVolume(v: number): void {
    const { vol, geo } = this.scene;
    const { sx0, sy0, SW, SH, col, hb, obj, face } = this;
    const k = geo.k;
    const shape = vol.roofShape[v];
    const roofH = vol.roofH[v];
    const Hb = Math.round(vol.base[v]);
    // a pitched roof is drawn as a two-tone lid on walls that run the full height
    const Ht = Math.max(Hb + 1, Math.round(vol.top[v] + (shape === Roof.Pitched ? roofH : 0)));
    const wallH = Ht - Hb;
    const id = v + 1;
    const seed = vol.seed[v];
    const wallRamp = vol.wall[v];
    const glassRamp = vol.glass[v];
    const pattern: number = vol.pattern[v];
    const ring0 = vol.ringStart[v];
    const ring1 = vol.ringStart[v + 1];
    const xy = vol.xy;

    // floors and bays in px: integers, so windows land on the pixel grid
    const F = pattern === Pattern.Curtain ? 6 : 8;
    const bayM =
      pattern === Pattern.Curtain
        ? 2
        : pattern === Pattern.Sparse
          ? 6
          : pattern === Pattern.Tall
            ? 4
            : pattern === Pattern.House
              ? 3.6
              : 3;
    const tallEnough = wallH >= 3 * F;

    for (let r = ring0; r < ring1; r++) {
      const v0 = vol.vertStart[r];
      const v1 = vol.vertStart[r + 1];
      if (v1 - v0 < 3) continue;
      // outer rings show the walls that face down-screen; holes show the opposite ones
      const orient = (ringArea2(xy, v0, v1) > 0 ? 1 : -1) * (r === ring0 ? 1 : -1);
      let ax = xy[(v1 - 1) * 2];
      let ay = xy[(v1 - 1) * 2 + 1];
      for (let vi = v0; vi < v1; vi++) {
        const bx = xy[vi * 2];
        const by = xy[vi * 2 + 1];
        const dx = bx - ax;
        const dy = by - ay;
        if (orient * dx < 0) {
          // facing the camera: light it by its true compass direction
          const dp = (dx / 2 - dy) / k;
          const dq = (dx / 2 + dy) / k;
          const lenM = Math.hypot(dp, dq);
          const light = (orient * (dq * this.sunP - dp * this.sunQ)) / (lenM || 1);
          const tone = light > 0.25 ? S_LIT : light > -0.25 ? S_HALF : S_SHADE;
          const faceCode = tone === S_LIT ? F_WALL_LIT : tone === S_HALF ? F_WALL_HALF : F_WALL_SHADE;
          const wallC = idx(wallRamp, tone);
          const wallHi = idx(wallRamp, tone + 1);
          const wallLo = idx(wallRamp, tone - 1);
          const winC = idx(glassRamp, tone === S_LIT ? S_SHADE : S_DEEP);
          const winHi = idx(glassRamp, tone === S_LIT ? S_LIT : S_SHADE);

          const xl = dx < 0 ? bx : ax;
          const yl = dx < 0 ? by : ay;
          const xr = dx < 0 ? ax : bx;
          const slope = dy / dx;
          const cFirst = Math.ceil(xl - 0.5);
          const cEnd = Math.ceil(xr - 0.5);
          const lenPx = cEnd - cFirst;
          if (lenPx > 0) {
            const pxPerM = lenPx / (lenM || 1);
            let B = Math.round(bayM * pxPerM);
            if (pxPerM < 0.9 || B < 4) B = 0;
            else if (B > 14) B = 14;
            const bays = B > 0 ? Math.floor((lenPx - 1) / B) : 0;
            const margin = B > 0 ? (lenPx - bays * B + 1) >> 1 : 0;
            const c0 = Math.max(cFirst, sx0);
            const c1 = Math.min(cEnd, sx0 + SW);
            for (let c = c0; c < c1; c++) {
              const gy = yl + (c + 0.5 - xl) * slope;
              const baseRow = Math.ceil(gy - 0.5);
              const rTop = Math.max(baseRow - Ht, sy0);
              const rEnd = Math.min(baseRow - Hb, sy0 + SH);
              if (rTop >= rEnd) continue;
              const u = c - cFirst - margin;
              const inBay = B > 0 && u >= 0 && u < bays * B;
              const bi = inBay ? (u / B) | 0 : -1;
              const ub = inBay ? u - bi * B : -1;
              let i = (rTop - sy0) * SW + (c - sx0);
              for (let row = rTop; row < rEnd; row++, i += SW) {
                const H = baseRow - row;
                if (H < hb[i]) continue;
                const vv = H - Hb - 1; // rows above the foot of the wall
                let colour = wallC;
                if (vv === wallH - 1 && wallH >= 4) colour = wallHi;
                else {
                  switch (pattern) {
                    case Pattern.Punched: {
                      if (vv === wallH - 2 && tallEnough) colour = wallLo;
                      else if (ub >= 0) {
                        if (tallEnough && vv < F - 1) {
                          // shopfront: glass between piers under a signboard
                          if (vv === F - 2) colour = wallLo;
                          else if (ub > 0 && vv > 0) colour = winC;
                        } else {
                          const vf = vv % F;
                          if (vf >= 2 && vf < F - 2 && ub >= 2 && ub < B - 1)
                            colour = vf === F - 3 && (mix(seed + bi, (vv / F) | 0) & 7) === 0 ? winHi : winC;
                        }
                      }
                      break;
                    }
                    case Pattern.Ribbon: {
                      const vf = vv % F;
                      if (vv === wallH - 2 && tallEnough) colour = wallLo;
                      else if (vf >= 3 && vf < F - 1 && !(ub === 0 && bi % 3 === 0) && bi >= 0) colour = winC;
                      break;
                    }
                    case Pattern.Curtain: {
                      const vf = vv % F;
                      if (ub < 0 || vf === 0 || ub === 0) colour = wallLo;
                      else {
                        const fi = (vv / F) | 0;
                        const pane = mix(seed ^ (bi * 131), fi) & 15;
                        // a diagonal streak of sky, a few bright panes, a few dark ones
                        if ((bi + fi * 2 + (seed & 63)) % 19 < 4 || pane === 0) colour = wallHi;
                        else if (pane === 1) colour = wallLo;
                      }
                      break;
                    }
                    case Pattern.Sparse: {
                      const vf = vv % F;
                      if (
                        ub >= 2 &&
                        ub < B - 2 &&
                        vf >= 3 &&
                        vf < F - 1 &&
                        (mix(seed + bi * 7, (vv / F) | 0) & 3) === 0
                      )
                        colour = winC;
                      break;
                    }
                    case Pattern.House: {
                      const vf = vv % F;
                      if (bi === 0 && vv < 5 && ub >= 2 && ub < 4) colour = idx(R.brownstone, tone - 1);
                      else if (ub >= 2 && ub < B - 2 && vf >= 3 && vf < F - 1 && !(bi === 0 && vv < F))
                        colour = winC;
                      break;
                    }
                    case Pattern.Tall: {
                      if (ub >= 2 && ub < B - 2 && vv >= 3 && vv < wallH - 4)
                        colour = (vv & 7) === 7 ? wallLo : winC;
                      break;
                    }
                    default:
                      break;
                  }
                }
                col[i] = colour;
                hb[i] = H;
                obj[i] = id;
                face[i] = faceCode;
              }
            }
          }
        }
        ax = bx;
        ay = by;
      }
    }

    // ---- the roof
    const roofRamp = vol.roof[v];
    if (shape === Roof.Pyramid || shape === Roof.Dome) {
      this.drawTaperedRoof(v, Ht, roofH, shape, id);
      return;
    }
    const lit = idx(roofRamp, S_LIT);
    if (shape === Roof.Pitched) {
      // which side of the ridge a pixel is on, measured in true metres from the centre
      const rx = vol.ridge[v * 2];
      const ry = vol.ridge[v * 2 + 1];
      const rp = rx / 2 - ry;
      const rq = rx / 2 + ry;
      const rl = Math.hypot(rp, rq) || 1;
      const np = rq / rl;
      const nq = -rp / rl;
      const sunny = np * this.sunP + nq * this.sunQ > 0 ? 1 : -1;
      const a = ((np + nq) / (2 * k)) * sunny;
      const b = ((nq - np) / k) * sunny;
      const cx = vol.center[v * 2];
      const cy = vol.center[v * 2 + 1];
      const half = idx(roofRamp, S_HALF);
      const ridge = idx(roofRamp, S_HIGH);
      fillPolygon(xy, vol.vertStart, ring0, ring1, sx0, sy0 + Ht, SW, SH, (y, x0, x1) => {
        let i = y * SW + x0;
        const wy = y + sy0 + Ht + 0.5 - cy;
        for (let x = x0; x < x1; x++, i++) {
          if (Ht < hb[i]) continue;
          const side = a * (x + sx0 + 0.5 - cx) + b * wy;
          col[i] = side > 0.35 ? lit : side < -0.35 ? half : ridge;
          hb[i] = Ht;
          obj[i] = id;
          face[i] = F_ROOF;
        }
      });
      return;
    }
    fillPolygon(xy, vol.vertStart, ring0, ring1, sx0, sy0 + Ht, SW, SH, (y, x0, x1) => {
      let i = y * SW + x0;
      for (let x = x0; x < x1; x++, i++) {
        if (Ht < hb[i]) continue;
        col[i] = lit;
        hb[i] = Ht;
        obj[i] = id;
        face[i] = F_ROOF;
      }
    });
  }

  /** Spires and domes: the footprint drawn again and again, shrinking as it climbs. */
  private drawTaperedRoof(v: number, Ht: number, roofH: number, shape: number, id: number): void {
    const { vol } = this.scene;
    const { sx0, sy0, SW, SH, col, hb, obj, face } = this;
    const v0 = vol.vertStart[vol.ringStart[v]];
    const v1 = vol.vertStart[vol.ringStart[v] + 1];
    const n = v1 - v0;
    if (this.scratch.length < n * 2) this.scratch = new Float64Array(n * 2);
    const pts = this.scratch;
    const starts = [0, n];
    const cx = vol.center[v * 2];
    const cy = vol.center[v * 2 + 1];
    const steps = Math.max(1, Math.round(roofH));
    const roofRamp = vol.roof[v];
    const lit = idx(roofRamp, S_LIT);
    const half = idx(roofRamp, S_HALF);
    const shade = idx(roofRamp, S_SHADE);
    for (let t = 0; t <= steps; t++) {
      const f = t / steps;
      const scale = shape === Roof.Dome ? Math.sqrt(Math.max(0, 1 - f * f)) : 1 - f;
      if (scale <= 0.001 && t > 0) break;
      for (let j = 0; j < n; j++) {
        pts[j * 2] = cx + (vol.xy[(v0 + j) * 2] - cx) * scale;
        pts[j * 2 + 1] = cy + (vol.xy[(v0 + j) * 2 + 1] - cy) * scale;
      }
      const H = Ht + t;
      const mid = cx - sx0;
      fillPolygon(pts, starts, 0, 1, sx0, sy0 + H, SW, SH, (y, x0, x1) => {
        let i = y * SW + x0;
        for (let x = x0; x < x1; x++, i++) {
          if (H < hb[i]) continue;
          // lit from the left: the near-left flank catches the sun
          col[i] = x + 0.5 < mid - 0.5 ? lit : x + 0.5 > mid + 0.5 ? shade : half;
          hb[i] = H;
          obj[i] = id;
          face[i] = F_SHAPED;
        }
      });
    }
  }

  /** Bridge cables and truss members: thin 3D lines, hidden by whatever stands in front of them. */
  private drawCables(job: ChunkJob): void {
    const { cab } = this.scene;
    const { sx0, sy0, SW, SH, col, hb, obj, face } = this;
    for (let n = 0; n < job.cables.length; n++) {
      const c = job.cables[n];
      // 0 a main cable, 1 a suspender: bare steel, a pixel across. 2 a truss chord, 3 a lesser
      // truss member: painted steel with some body to it, so a truss does not fade away from afar.
      const truss = cab.kind[c] >= 2;
      const main = cab.kind[c] === 0 || cab.kind[c] === 2;
      const colour = idx(truss ? R.tan : R.steel, main ? S_DEEP : S_SHADE);
      const across = truss ? 2 : 1;
      const down = (main ? 2 : 1) + (truss ? 1 : 0);
      for (let v = cab.start[c]; v + 1 < cab.start[c + 1]; v++) {
        const x0 = cab.xyz[v * 3];
        const g0 = cab.xyz[v * 3 + 1];
        const h0 = cab.xyz[v * 3 + 2];
        const x1 = cab.xyz[v * 3 + 3];
        const g1 = cab.xyz[v * 3 + 4];
        const h1 = cab.xyz[v * 3 + 5];
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(g1 - h1 - (g0 - h0)))));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const H = Math.round(h0 + (h1 - h0) * t);
          const px = Math.round(x0 + (x1 - x0) * t) - sx0;
          const py = Math.round(g0 + (g1 - g0) * t) - H - sy0;
          for (let thick = 0; thick < down * across; thick++) {
            const x = px + (thick % across);
            const y = py + Math.floor(thick / across);
            if (x < 0 || y < 0 || x >= SW || y >= SH) continue;
            const i = y * SW + x;
            if (H < hb[i]) continue;
            col[i] = colour;
            hb[i] = H;
            obj[i] = -2;
            face[i] = F_SHAPED;
          }
        }
      }
    }
  }

  // ---- trees ----------------------------------------------------------------------------------

  private drawTrees(job: ChunkJob): void {
    const { scatter, sx0, sy0, SW, SH, col, hb, obj, face } = this;
    for (let n = 0; n < scatter.length; n += 4) {
      const x = scatter[n];
      const y = scatter[n + 1];
      const seed = scatter[n + 2];
      if (job.foggy) {
        const { fog } = this.scene;
        const d = this.fogDistance(x, y);
        if (d > fog.start && d >= fog.start + ((seed & 1023) / 1024) * (fog.end - fog.start) * 0.6) continue;
      }
      const sprite = treeSprite(scatter[n + 3], seed);
      const ramp = treeRamp(seed >>> 5, this.scene.flora);
      const left = x - sprite.anchorX - sx0;
      const top = y - sprite.h + 1 - sy0;
      for (let r = 0; r < sprite.h; r++) {
        const py = top + r;
        if (py < 0 || py >= SH) continue;
        const H = sprite.h - r;
        for (let c = 0; c < sprite.w; c++) {
          const code = sprite.px[r * sprite.w + c];
          if (code === 0) continue;
          const px = left + c;
          if (px < 0 || px >= SW) continue;
          const i = py * SW + px;
          if (H < hb[i]) continue;
          col[i] =
            code === 4
              ? idx(R.trunk, S_SHADE)
              : idx(ramp, code === 1 ? S_HIGH : code === 2 ? S_LIT : S_SHADE);
          hb[i] = H;
          obj[i] = -1;
          face[i] = F_TREE;
        }
      }
    }
  }

  // ---- 4. finish ------------------------------------------------------------------------------

  private finish(job: ChunkJob): Uint16Array {
    const { col, hb, obj, face, SW, gk, gh, wd, GW, gx0, gy0, sx0, sy0 } = this;
    const { fog, vol } = this.scene;
    const out = new Uint16Array(job.w * job.h);
    const ctx: GroundContext = { gk, wd, GW };
    const fogSpan = fog.end - fog.start;
    const clip = this.scene.clip;

    for (let y = 0; y < job.h; y++) {
      const my = job.y0 + y;
      let i = (my - sy0) * SW + (job.x0 - sx0);
      let o = y * job.w;
      for (let x = 0; x < job.w; x++, i++, o++) {
        const mx = job.x0 + x;
        // a framed world stops dead at its rectangle
        if (clip && (mx < clip.minX || mx >= clip.maxX || my < clip.minY || my >= clip.maxY)) {
          out[o] = TRANSPARENT;
          continue;
        }
        const H = hb[i];
        const who = obj[i];
        if (job.alone && who <= 0) {
          out[o] = TRANSPARENT;
          continue;
        }
        // where on the ground this surface stands
        const gi = (my + H - gy0) * GW + (mx - gx0);
        let c: number;

        if (who === 0) {
          if (job.foggy) {
            // the ground dissolves through an ordered dither, with a slow wobble so the edge is not a clean curve
            const d = this.fogDistance(mx + 0.5, my + 0.5);
            if (d > fog.start) {
              const wobble = (valueNoise(mx / 420, my / 210) - 0.5) * 700;
              const cut = fog.start + ((BAYER8[(my & 7) * 8 + (mx & 7)] + 0.5) / 64) * fogSpan;
              if (d + wobble >= cut) {
                out[o] = TRANSPARENT;
                continue;
              }
            }
          }
          c = groundColor(ctx, gk[gi], mx, my, gi);
          if (gh[gi] > 6) c = SHADOWED[c];
        } else if (who === -2) {
          c = col[i];
        } else if (who < 0) {
          c = col[i];
          if (gh[gi - 3] > H * 8 + 160) c = SHADOWED[c];
        } else {
          c = col[i];
          const f = face[i];
          if (f === F_ROOF) {
            if (gh[gi] > H * 8 + 12) c = SHADOWED[c];
          } else if (f === F_WALL_LIT || f === F_WALL_HALF) {
            // step off the wall towards the sun before asking, or the wall shades itself
            if (gh[gi + GW - 2] > H * 8 + 12) c = SHADOWED[c];
          }
          // edges: a light lip where a roof meets its own wall, a dark line wherever this object
          // stands in front of something lower
          const below = i + SW;
          const lf = i - 1;
          const rt = i + 1;
          const up = i - SW;
          if (vol.flags[who - 1] & F_NO_OUTLINE) {
            // deck pieces run into one another: no lips or lines between them
          } else if (f === F_ROOF && obj[below] === who && face[below] !== F_ROOF) c = LIGHTER[c];
          else if (
            (obj[lf] !== who && hb[lf] < H) ||
            (obj[rt] !== who && hb[rt] < H) ||
            (obj[up] !== who && hb[up] < H)
          )
            c = DARKER[c];
          else if (f === F_ROOF && ((obj[lf] !== who && hb[lf] === H) || (obj[up] !== who && hb[up] === H)))
            c = DARKER[c];
        }
        out[o] = c;
      }
    }
    return out;
  }
}

/** Smooth 2D value noise in [0, 1]. */
export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(xi, yi) / 4294967296;
  const b = hash2(xi + 1, yi) / 4294967296;
  const c = hash2(xi, yi + 1) / 4294967296;
  const d = hash2(xi + 1, yi + 1) / 4294967296;
  return a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sy;
}
