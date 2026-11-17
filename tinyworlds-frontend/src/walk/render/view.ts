import * as THREE from "three";
import type { WalkCell } from "../cell";
import { cellExists, type WalkIndex } from "../walk-index";
import { WalkWorld } from "../world";
import { billboardMesh } from "./billboard-mesh";
import { placeBillboards, squareInAreas, type BillboardArea } from "./billboards";
import {
  buildCellMeshes,
  disposeCellMeshes,
  ORDER_WATER,
  WATER_SURFACE,
  type MeshContext,
} from "./cell-mesh";
import { makeMaterials, NOT_MIRRORED, SKY, type Mirror, type WalkMaterials } from "./materials";
import { makePalette, type Palette } from "./palette";

/**
 * The walk's view: a three.js renderer drawing at a fraction of the screen's resolution and
 * scaled up without smoothing (big pixels, like the map's), the sky and the fog, the water under
 * everything, and the squares streamed in around the camera. Reached only by dynamic import.
 *
 * Where the world says (`billboards`: Times Square), a square's street-facing walls get their
 * screens once it and every square round it are in (the probes that say a wall faces open ground
 * reach into them), one square a frame, as a mesh of its own group (`billboards.ts`).
 *
 * The water mirrors what stands by it: before each frame, a second camera under the water's
 * surface draws everything but the sky, the water and the ground (`NOT_MIRRORED`) into a picture
 * of the drawing's size (half of it on a touch screen), clipped at the surface, and the water's
 * shader reads it. It costs about one more drawing of the city, so it is skipped when no water
 * is near, and let go for the walk when frames stay slow (`SlowWatch`); `setReflections` sets it.
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
/** The sky's dome: inside the camera's far plane, drawn before anything. */
const SKY_RADIUS = 1000;
const ORDER_SKY = -1000;
/** Squares (from the camera's) within which water is near enough to be worth mirroring. */
const MIRROR_REACH = 2.5;
/** The mirror's picture on a touch screen: one pixel for this many of the drawing's, each way. */
const MIRROR_COARSE = 2;
/**
 * Under this frame rate, over `SLOW_SPAN` s twice in a row, the reflections are let go: sooner
 * than the walk's screen makes the pixels bigger (40 fps over 4 s), so they go first.
 */
export const MIRROR_MIN_FPS = 40;
export const SLOW_SPAN = 1;
export const SLOW_SPANS = 2;
/** Seconds after the first squares are shown before the frame rate counts (building them is slow anywhere). */
export const SLOW_WARM_UP = 3;
/** A frame longer than this, s, is a gap, not a slow frame. */
export const SLOW_GAP = 1;

const keyOf = (i: number, j: number) => `${i}_${j}`;

/** Squares each way from the camera's that the open water reaches (2 km: far beyond the fog). */
export const OPEN_REACH = 10;

/**
 * The squares the open water is drawn on: those round the camera's square that no shown square
 * covers (a shown square has its own water, or is all land under its ground), so the water is
 * drawn once wherever it is. Past the edge of the data (a square with no file, `exists` false)
 * it is drawn only where no shown square beside it is all land (`dry`): where the data ends on
 * land (the inland fade into Nassau, New Jersey) the city ends in the fog's wall, not in a sea.
 * No three.js.
 */
export function openTiles(
  ci: number,
  cj: number,
  shown: ReadonlySet<string>,
  dry: ReadonlySet<string> = new Set(),
  exists: (i: number, j: number) => boolean = () => true,
): [number, number][] {
  const out: [number, number][] = [];
  const byLand = (i: number, j: number) => {
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) if (dry.has(keyOf(i + di, j + dj))) return true;
    return false;
  };
  for (let j = cj - OPEN_REACH; j < cj + OPEN_REACH; j++)
    for (let i = ci - OPEN_REACH; i < ci + OPEN_REACH; i++)
      if (!shown.has(keyOf(i, j)) && (exists(i, j) || !byLand(i, j))) out.push([i, j]);
  return out;
}

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

/**
 * Whether frames are too slow: fed every frame's length, it answers true once the frame rate
 * has stayed under `minFps` for `spans` spans of `span` s in a row, counted after `warmUp` s.
 * A gap over a quarter of a second (a hidden tab, a breakpoint) is not a frame. No three.js.
 */
export class SlowWatch {
  private warm = 0;
  private frames = 0;
  private span = 0;
  private slow = 0;

  constructor(
    private readonly minFps = MIRROR_MIN_FPS,
    private readonly spanFor = SLOW_SPAN,
    private readonly spans = SLOW_SPANS,
    private readonly warmUp = SLOW_WARM_UP,
  ) {}

  frame(dt: number): boolean {
    // a gap (the tab hidden, a breakpoint) is no frame; a slow phone's quarter second is one
    if (!(dt > 0) || dt > SLOW_GAP) return this.slow >= this.spans;
    if (this.warm < this.warmUp) {
      this.warm += dt;
      return false;
    }
    this.frames++;
    this.span += dt;
    if (this.span >= this.spanFor) {
      this.slow = this.frames / this.span < this.minFps ? this.slow + 1 : 0;
      this.frames = 0;
      this.span = 0;
    }
    return this.slow >= this.spans;
  }

  /** From the start again, warm-up and all. */
  reset(): void {
    this.warm = 0;
    this.frames = 0;
    this.span = 0;
    this.slow = 0;
  }
}

const viewBox = new THREE.Box3();
const viewFrustum = new THREE.Frustum();
const viewMatrix = new THREE.Matrix4();

/**
 * Whether the water of a square with water near the camera (within `MIRROR_REACH` squares of
 * its own) is in its view: only then is the mirror worth drawing. The camera's world matrix must
 * be up to date. No WebGL.
 */
export function waterInView(
  wet: Iterable<{ i: number; j: number }>,
  camera: THREE.Camera,
  side: number,
): boolean {
  const ci = Math.floor(camera.position.x / side);
  const cj = Math.floor(-camera.position.z / side);
  viewFrustum.setFromProjectionMatrix(
    viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  for (const { i, j } of wet) {
    if (Math.hypot(i - ci, j - cj) > MIRROR_REACH) continue;
    viewBox.min.set(i * side, WATER_SURFACE - 1, -(j + 1) * side);
    viewBox.max.set((i + 1) * side, WATER_SURFACE + 1, -j * side);
    if (viewFrustum.intersectsBox(viewBox)) return true;
  }
  return false;
}

/**
 * A camera's projection made to clip at the plane y = `y` (the water), keeping what is above it,
 * instead of at its near plane: the oblique near plane (E. Lengyel, "Modifying the Projection
 * Matrix to Perform Oblique Near-Plane Clipping"). Its inverse too.
 */
function clipAbove(camera: THREE.PerspectiveCamera, y: number): void {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y).applyMatrix4(
    camera.matrixWorldInverse,
  );
  const c = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const m = camera.projectionMatrix.elements;
  // the corner of the view opposite the plane, in clip space, taken back to the camera's
  const q = new THREE.Vector4(
    (Math.sign(c.x) + m[8]) / m[0],
    (Math.sign(c.y) + m[9]) / m[5],
    -1,
    (1 + m[10]) / m[14],
  );
  c.multiplyScalar(2 / c.dot(q));
  m[2] = c.x;
  m[6] = c.y;
  m[10] = c.z + 1;
  m[14] = c.w;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
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
  /** The sky: a dome that follows the camera, drawn first (it drains to grey as the rest does). */
  private readonly sky: THREE.Mesh;
  private pixel = PIXEL_DEFAULT;
  private drawn = { w: 0, h: 0, pixel: 0 };
  private time = 0;
  private at = { e: 0, n: 0 };
  /** Whether a square's meshes have failed already (said once in the console). */
  private meshFailed = false;
  /** The squares shown that have water, by where they are. */
  private readonly wet = new Map<THREE.Group, { i: number; j: number }>();
  /** Every square shown, by its key; and the camera's square the open water was last laid round (null: lay it again). */
  private readonly shown = new Map<THREE.Group, string>();
  private openAt: { i: number; j: number } | null = null;
  /** The mirror: its camera, its picture (made when first wanted), how coarse, and whether it is on. */
  private readonly mirrorCam = new THREE.PerspectiveCamera();
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly mirrorScale: number;
  private reflect = true;
  private readonly slow = new SlowWatch();
  private lastFrame = 0;
  /** Whether a square has been shown yet: the frame rate counts from then. */
  private shownAny = false;
  private readonly buffer = new THREE.Vector2();
  /** The areas with billboards, the square each shown group is, and the groups whose billboards are up (or that have none). */
  private readonly areas: readonly BillboardArea[];
  private readonly cellOf = new Map<THREE.Group, WalkCell>();
  private readonly boarded = new Set<THREE.Group>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    ix: WalkIndex,
    load: (i: number, j: number) => Promise<WalkCell>,
    options: { billboards?: readonly BillboardArea[] } = {},
  ) {
    this.areas = options.billboards ?? [];
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
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 16, 8), this.materials.sky);
    this.sky.renderOrder = ORDER_SKY;
    this.sky.frustumCulled = false;
    this.sky.layers.set(NOT_MIRRORED);
    this.scene.add(this.sky);
    this.camera.rotation.order = "YXZ";
    this.camera.layers.enable(NOT_MIRRORED);
    this.mirrorCam.rotation.order = "YXZ";
    const media = (q: string) =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(q).matches
        : false;
    this.mirrorScale = media("(pointer: coarse)") ? MIRROR_COARSE : 1;

    // the open water: where no square is shown, round the camera (`openWater`)
    this.water = new THREE.Mesh(new THREE.BufferGeometry(), this.materials.water);
    this.water.renderOrder = ORDER_WATER;
    this.water.frustumCulled = false;
    this.water.layers.set(NOT_MIRRORED);
    this.scene.add(this.water);
    this.setReducedMotion(media("(prefers-reduced-motion: reduce)"));

    // a square that failed to load stands in the fog, like the edge of the data
    this.fogBox = new THREE.BoxGeometry(ix.cell, 1000, ix.cell);
    this.fogBox.translate(ix.cell / 2, 498, -ix.cell / 2);

    this.stream = new SquareStream<THREE.Group>(ix, load, {
      failed: (i, j) => {
        const g = new THREE.Group();
        g.position.set(i * ix.cell, 0, -j * ix.cell);
        const fog = new THREE.Mesh(this.fogBox, this.materials.edge);
        fog.layers.set(NOT_MIRRORED);
        g.add(fog);
        this.scene.add(g);
        return g;
      },
      drop: (g) => {
        this.scene.remove(g);
        this.wet.delete(g);
        this.cellOf.delete(g);
        this.boarded.delete(g);
        if (this.shown.delete(g)) this.openAt = null;
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

  /** Drains the colours to the palette's greys, 0 (none) to 1 (all): the wasted sequence. */
  setGrey(amount: number): void {
    this.materials.setGrey(amount);
  }

  /** Whether the water mirrors the city: on unless set off, or let go because frames were slow. */
  get reflections(): boolean {
    return this.reflect;
  }

  /** Turns the water's reflections on or off; on again, the frame rate is watched afresh. */
  setReflections(on: boolean): void {
    this.reflect = on;
    if (on) this.slow.reset();
  }

  /** Under reduced motion the water stands still (read from the browser at first). */
  setReducedMotion(on: boolean): void {
    this.materials.setStill(on);
  }

  /** Streams the squares round the camera and meshes at most one of them, or else hangs one square's billboards. */
  update(dt: number): void {
    this.time += Math.max(0, dt);
    this.stream.update(dt, this.at.e, this.at.n);
    const cell = this.stream.next(this.at.e, this.at.n);
    if (!cell) {
      this.hangBillboards();
      return;
    }
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
    if (cell.mask.mode !== 0) this.wet.set(group, { i: cell.i, j: cell.j });
    this.shown.set(group, cell.key);
    this.cellOf.set(group, cell);
    this.openAt = null;
    this.stream.show(cell, group);
  }

  /**
   * The billboards of the nearest shown square in an area that has none yet and whose squares
   * round it are all in (or have no file): the same screens whatever else is loaded.
   */
  private hangBillboards(): void {
    if (this.areas.length === 0) return;
    const ix = this.world.index;
    let best: THREE.Group | null = null;
    let bestD = Infinity;
    for (const [group, cell] of this.cellOf) {
      if (this.boarded.has(group)) continue;
      if (!squareInAreas(cell.i, cell.j, this.areas, ix.cell)) {
        this.boarded.add(group);
        continue;
      }
      let ready = true;
      for (let dj = -1; dj <= 1 && ready; dj++)
        for (let di = -1; di <= 1 && ready; di++)
          if (cellExists(ix, cell.i + di, cell.j + dj) && !this.world.has(cell.i + di, cell.j + dj))
            ready = false;
      if (!ready) continue;
      const d = Math.hypot(
        (cell.i + 0.5) * ix.cell - this.at.e,
        (cell.j + 0.5) * ix.cell - this.at.n,
      );
      if (d < bestD) {
        bestD = d;
        best = group;
      }
    }
    if (!best) return;
    const cell = this.cellOf.get(best)!;
    this.boarded.add(best);
    const near = [];
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const c = this.world.cell(cell.i + di, cell.j + dj);
        if (c) near.push(...c.volumes);
      }
    const mesh = billboardMesh(
      placeBillboards(cell, near, this.areas, ix.cell),
      this.palette,
      this.materials.billboard,
      cell.i * ix.cell,
      cell.j * ix.cell,
    );
    if (!mesh) return;
    best.add(mesh);
    (best.userData.disposables as { dispose(): void }[]).push(mesh.geometry);
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
    this.sky.position.copy(this.camera.position);
    this.openWater();
    this.camera.updateMatrixWorld();
    const buffer = this.renderer.getDrawingBufferSize(this.buffer);
    this.materials.frame(this.time, this.camera, buffer.x, buffer.y);
    const mirrored = this.mirror(buffer);
    this.watchFrames(mirrored !== null);
    this.materials.mirror(mirrored);
    this.renderer.render(this.scene, this.camera);
  }

  /** Lays the open water again when the shown squares or the camera's square changed. */
  private openWater(): void {
    const side = this.stream.world.index.cell;
    const ci = Math.floor(this.camera.position.x / side);
    const cj = Math.floor(-this.camera.position.z / side);
    if (!Number.isFinite(ci) || !Number.isFinite(cj)) return;
    if (this.openAt && this.openAt.i === ci && this.openAt.j === cj) return;
    this.openAt = { i: ci, j: cj };
    const shown = new Set(this.shown.values());
    const wet = new Set([...this.wet.values()].map(({ i, j }) => keyOf(i, j)));
    const dry = new Set([...shown].filter((k) => !wet.has(k)));
    const ix = this.stream.world.index;
    const tiles = openTiles(ci, cj, shown, dry, (i, j) => cellExists(ix, i, j));
    const pos = new Float32Array(tiles.length * 12);
    const index: number[] = [];
    tiles.forEach(([i, j], k) => {
      const x0 = i * side;
      const x1 = x0 + side;
      const z0 = -j * side;
      const z1 = z0 - side;
      pos.set(
        [
          x0,
          WATER_SURFACE,
          z0,
          x1,
          WATER_SURFACE,
          z0,
          x1,
          WATER_SURFACE,
          z1,
          x0,
          WATER_SURFACE,
          z1,
        ],
        k * 12,
      );
      index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geometry.setIndex(index);
    this.water.geometry.dispose();
    this.water.geometry = geometry;
  }

  /** Lets the reflections go when frames that drew them stay slow (counting once the first
   * squares are shown): a slow street far from the water says nothing of what the mirror costs. */
  private watchFrames(drewMirror: boolean): void {
    const now = performance.now();
    const dt = this.lastFrame > 0 ? (now - this.lastFrame) / 1000 : 0;
    this.lastFrame = now;
    this.shownAny ||= this.stream.counts().ready > 0;
    if (drewMirror && this.reflect && this.shownAny && this.slow.frame(dt)) this.reflect = false;
  }

  /** Draws the mirror's picture when the water is near and the reflections are on; what it saw, or null. */
  private mirror(buffer: THREE.Vector2): Mirror | null {
    const eye = this.camera.position;
    if (!this.reflect || eye.y <= WATER_SURFACE) return null;
    if (!waterInView(this.wet.values(), this.camera, this.stream.world.index.cell)) return null;

    const w = Math.max(1, Math.ceil(buffer.x / this.mirrorScale));
    const h = Math.max(1, Math.ceil(buffer.y / this.mirrorScale));
    if (!this.target) {
      this.target = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        generateMipmaps: false,
        depthTexture: new THREE.DepthTexture(w, h),
      });
    } else if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);

    // the camera mirrored in the surface: under it, looking up as much as the eye looks down
    const m = this.mirrorCam;
    m.copy(this.camera);
    m.layers.set(0);
    m.position.y = 2 * WATER_SURFACE - eye.y;
    m.rotation.set(-this.camera.rotation.x, this.camera.rotation.y, 0);
    m.updateMatrixWorld();
    m.updateProjectionMatrix();
    clipAbove(m, WATER_SURFACE);
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, m);
    this.renderer.setRenderTarget(null);
    return {
      colour: this.target.texture,
      depth: this.target.depthTexture!,
      projectionInverse: m.projectionMatrixInverse,
      world: m.matrixWorld,
    };
  }

  /** How many squares are in, asked for, and failed: for a sign or a check. */
  squares(): { ready: number; loading: number; failed: number } {
    return this.stream.counts();
  }

  dispose(): void {
    this.stream.dispose();
    this.scene.remove(this.water, this.sky);
    this.sky.geometry.dispose();
    this.water.geometry.dispose();
    this.fogBox.dispose();
    this.target?.depthTexture?.dispose();
    this.target?.dispose();
    this.materials.dispose();
    this.palette.texture.dispose();
    this.renderer.dispose();
  }
}
