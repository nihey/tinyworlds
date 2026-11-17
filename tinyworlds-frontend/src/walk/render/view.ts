import * as THREE from "three";
import type { WalkCell } from "../cell";
import { cellExists, type WalkIndex } from "../walk-index";
import { WalkWorld } from "../world";
import {
  buildCellMeshes,
  disposeCellMeshes,
  ORDER_WATER,
  WATER_SURFACE,
  type MeshContext,
} from "./cell-mesh";
import { makeMaterials, SKY, type WalkMaterials } from "./materials";
import { makePalette, type Palette } from "./palette";

/**
 * The walk's view: a three.js renderer drawing at a fraction of the screen's resolution and
 * scaled up without smoothing (big pixels, like the map's), the sky and the fog, the water under
 * everything, and the squares streamed in around the camera. Reached only by dynamic import.
 */

/**
 * Squares whose middle is within this many squares of the camera's square are loaded: the
 * spec's 3, and half a square more as the spike had it, so nothing pops in under thin fog.
 */
export const LOAD_RADIUS = 3.5;
/** Beyond this many they are let go (out of the scene and out of `world`). */
export const UNLOAD_RADIUS = 4.5;
/** Squares asked for at once. */
export const MAX_LOADING = 6;
/** Seconds before a square that failed is asked for again. */
export const RETRY_AFTER = 10;
/** Pixel size: screen pixels per pixel drawn. */
export const PIXEL_MIN = 1;
export const PIXEL_MAX = 6;
export const PIXEL_DEFAULT = 3;

const keyOf = (i: number, j: number) => `${i}_${j}`;

interface Slot<T> {
  i: number;
  j: number;
  state: "loading" | "ready" | "failed";
  cell: WalkCell | null;
  retryAt: number;
  /** What the view made of it once it is in. */
  shown: T | null;
  /** What stands in for it since it failed: kept while it is asked again, until it is shown. */
  fog: T | null;
}

export interface StreamHooks<T> {
  /** What stands where a square failed to load or to be shown, until it is shown or let go. */
  failed(i: number, j: number): T;
  /** Lets go of what the view made of a square. */
  drop(shown: T): void;
}

/**
 * Which squares are wanted, asked for, in, failed, and let go: no three.js. Distances are
 * Euclidean between square indices (the camera's square to each square), in squares.
 */
export class SquareStream<T> {
  readonly world: WalkWorld;
  private slots = new Map<string, Slot<T>>();
  private loading = 0;
  private clock = 0;
  private alive = true;

  constructor(
    private readonly ix: WalkIndex,
    private readonly load: (i: number, j: number) => Promise<WalkCell>,
    private readonly hooks: StreamHooks<T>,
  ) {
    this.world = new WalkWorld(ix);
  }

  /** Lets go of what is far from (e, n), asks for what is near, nearest first; `dt` runs the retry clock. */
  update(dt: number, e: number, n: number): void {
    this.clock += Math.max(0, dt);
    const ci = Math.floor(e / this.ix.cell);
    const cj = Math.floor(n / this.ix.cell);
    if (!Number.isFinite(ci) || !Number.isFinite(cj)) return;

    for (const [key, slot] of this.slots)
      if (Math.hypot(slot.i - ci, slot.j - cj) > UNLOAD_RADIUS) this.forget(key, slot);

    if (this.loading >= MAX_LOADING) return;
    // the camera's square's centre, for ties between squares as far by index
    const ce = (ci + 0.5) * this.ix.cell;
    const cn = (cj + 0.5) * this.ix.cell;
    const want: [number, number, number][] = [];
    const r = Math.floor(LOAD_RADIUS);
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        const d = Math.hypot(di, dj);
        if (d > LOAD_RADIUS) continue;
        const i = ci + di;
        const j = cj + dj;
        const slot = this.slots.get(keyOf(i, j));
        if (slot && !(slot.state === "failed" && slot.retryAt <= this.clock)) continue;
        if (!cellExists(this.ix, i, j)) continue;
        const tie =
          Math.hypot((i + 0.5) * this.ix.cell - e, (j + 0.5) * this.ix.cell - n) -
          Math.hypot(ce - e, cn - n);
        want.push([d + tie * 1e-6, i, j]);
      }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, i, j] of want) {
      if (this.loading >= MAX_LOADING) break;
      this.ask(i, j);
    }
  }

  /** The nearest square that is in but not yet shown, or null. */
  next(e: number, n: number): WalkCell | null {
    let best: WalkCell | null = null;
    let bestD = Infinity;
    for (const slot of this.slots.values()) {
      if (slot.state !== "ready" || slot.shown !== null) continue;
      const d = Math.hypot((slot.i + 0.5) * this.ix.cell - e, (slot.j + 0.5) * this.ix.cell - n);
      if (d < bestD) {
        bestD = d;
        best = slot.cell;
      }
    }
    return best;
  }

  /** Records what the view made of a square that is in. */
  show(cell: WalkCell, shown: T): void {
    const slot = this.slots.get(cell.key);
    if (!slot || slot.cell !== cell) {
      this.hooks.drop(shown);
      return;
    }
    if (slot.shown !== null) this.hooks.drop(slot.shown);
    if (slot.fog !== null) this.hooks.drop(slot.fog);
    slot.fog = null;
    slot.shown = shown;
  }

  /**
   * A square that came in but could not be shown (its meshes failed): out of `world` (a wall),
   * fog in its place, asked again after `RETRY_AFTER`, as if it had failed to load.
   */
  reject(cell: WalkCell): void {
    const slot = this.slots.get(cell.key);
    if (!slot || slot.cell !== cell) return;
    if (slot.state === "ready") this.world.remove(cell.key);
    if (slot.shown !== null) this.hooks.drop(slot.shown);
    slot.shown = null;
    slot.cell = null;
    this.fail(slot);
  }

  /** How many squares are in, asked for, and failed. */
  counts(): { ready: number; loading: number; failed: number } {
    let ready = 0;
    let failed = 0;
    for (const s of this.slots.values()) {
      if (s.state === "ready") ready++;
      else if (s.state === "failed") failed++;
    }
    return { ready, loading: this.loading, failed };
  }

  dispose(): void {
    this.alive = false;
    for (const [key, slot] of this.slots) this.forget(key, slot);
  }

  private ask(i: number, j: number): void {
    const key = keyOf(i, j);
    const old = this.slots.get(key);
    if (old?.shown) this.hooks.drop(old.shown);
    // a square asked again keeps its fog until what comes in is shown
    const slot: Slot<T> = {
      i,
      j,
      state: "loading",
      cell: null,
      retryAt: 0,
      shown: null,
      fog: old?.fog ?? null,
    };
    this.slots.set(key, slot);
    this.loading++;
    let promise: Promise<WalkCell>;
    try {
      promise = this.load(i, j);
    } catch (err) {
      promise = Promise.reject(err);
    }
    promise.then(
      (cell) => {
        this.loading--;
        if (!this.alive || this.slots.get(key) !== slot) return;
        if (cell.i !== i || cell.j !== j) return this.fail(slot);
        slot.state = "ready";
        slot.cell = cell;
        this.world.add(cell);
      },
      () => {
        this.loading--;
        if (!this.alive || this.slots.get(key) !== slot) return;
        this.fail(slot);
      },
    );
  }

  /** A square that failed stays out of `world` (a wall), with the fog standing in (the same fog, if it had one), until asked again. */
  private fail(slot: Slot<T>): void {
    slot.state = "failed";
    slot.retryAt = this.clock + RETRY_AFTER;
    slot.fog ??= this.hooks.failed(slot.i, slot.j);
  }

  private forget(key: string, slot: Slot<T>): void {
    if (slot.state === "ready") this.world.remove(key);
    if (slot.shown !== null) this.hooks.drop(slot.shown);
    if (slot.fog !== null) this.hooks.drop(slot.fog);
    slot.shown = null;
    slot.fog = null;
    this.slots.delete(key);
  }
}

export class WalkView {
  readonly scene = new THREE.Scene();
  readonly world: WalkWorld;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1500);
  private readonly palette: Palette;
  private readonly materials: WalkMaterials;
  private readonly stream: SquareStream<THREE.Group>;
  private readonly ctx: MeshContext;
  private readonly water: THREE.Mesh;
  private readonly fogBox: THREE.BufferGeometry;
  private pixel = PIXEL_DEFAULT;
  private drawn = { w: 0, h: 0, pixel: 0 };
  private time = 0;
  private at = { e: 0, n: 0 };
  /** Whether a square's meshes have failed already (said once in the console). */
  private meshFailed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    ix: WalkIndex,
    load: (i: number, j: number) => Promise<WalkCell>,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    // the palette's colours go out exactly as they are
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    canvas.style.imageRendering = "pixelated";

    this.palette = makePalette(ix);
    this.materials = makeMaterials(this.palette, ix);
    this.scene.background = SKY;
    this.camera.rotation.order = "YXZ";

    // the water under everything: it follows the camera, its pattern stays where it is
    const plane = new THREE.PlaneGeometry(4000, 4000);
    plane.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(plane, this.materials.water);
    this.water.position.y = WATER_SURFACE;
    this.water.renderOrder = ORDER_WATER;
    this.water.frustumCulled = false;
    this.scene.add(this.water);

    // a square that failed to load stands in the fog, like the edge of the data
    this.fogBox = new THREE.BoxGeometry(ix.cell, 1000, ix.cell);
    this.fogBox.translate(ix.cell / 2, 498, -ix.cell / 2);

    this.stream = new SquareStream<THREE.Group>(ix, load, {
      failed: (i, j) => {
        const g = new THREE.Group();
        g.position.set(i * ix.cell, 0, -j * ix.cell);
        g.add(new THREE.Mesh(this.fogBox, this.materials.edge));
        this.scene.add(g);
        return g;
      },
      drop: (g) => {
        this.scene.remove(g);
        if (g.userData.disposables) disposeCellMeshes(g);
      },
    });
    this.world = this.stream.world;
    this.ctx = { palette: this.palette, materials: this.materials, index: ix, world: this.world };
  }

  /** Screen pixels per pixel drawn, 1 to 6. */
  get pixelSize(): number {
    return this.pixel;
  }

  setPixel(n: number): void {
    this.pixel = Number.isFinite(n)
      ? Math.max(PIXEL_MIN, Math.min(PIXEL_MAX, Math.round(n)))
      : PIXEL_DEFAULT;
  }

  /**
   * The eye at (e, n) and z metres up, `yaw` radians from north clockwise, `pitch` radians up,
   * `fov` the vertical field of view in degrees.
   */
  setCamera(e: number, n: number, z: number, yaw: number, pitch: number, fov: number): void {
    this.at = { e, n };
    this.camera.position.set(e, z, -n);
    this.camera.rotation.set(pitch, -yaw, 0);
    if (fov !== this.camera.fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Streams the squares round the camera and meshes at most one of them. */
  update(dt: number): void {
    this.time += Math.max(0, dt);
    this.stream.update(dt, this.at.e, this.at.n);
    const cell = this.stream.next(this.at.e, this.at.n);
    if (!cell) return;
    let group: THREE.Group;
    try {
      group = buildCellMeshes(cell, this.ctx);
    } catch (err) {
      // a square that cannot be drawn is a wall in the fog, asked for again later; the walk goes on
      if (!this.meshFailed) console.warn(`walk: square ${cell.key} could not be drawn`, err);
      this.meshFailed = true;
      this.stream.reject(cell);
      return;
    }
    this.scene.add(group);
    this.stream.show(cell, group);
  }

  render(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (w !== this.drawn.w || h !== this.drawn.h || this.pixel !== this.drawn.pixel) {
      this.renderer.setPixelRatio(1 / this.pixel);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.drawn = { w, h, pixel: this.pixel };
    }
    this.water.position.x = Math.round(this.camera.position.x / 100) * 100;
    this.water.position.z = Math.round(this.camera.position.z / 100) * 100;
    this.camera.updateMatrixWorld();
    this.materials.frame(this.time, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  /** How many squares are in, asked for, and failed: for a sign or a check. */
  squares(): { ready: number; loading: number; failed: number } {
    return this.stream.counts();
  }

  dispose(): void {
    this.stream.dispose();
    this.scene.remove(this.water);
    this.water.geometry.dispose();
    this.fogBox.dispose();
    this.materials.dispose();
    this.palette.texture.dispose();
    this.renderer.dispose();
  }
}
