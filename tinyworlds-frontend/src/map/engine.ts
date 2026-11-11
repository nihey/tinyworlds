import { activeStrings } from "@/i18n";
import { WORLD } from "@/worlds";
import { buildHoodShapes, hoodAt, type HoodShape } from "./hoods";
import type { Hood, Manifest } from "./manifest";
import { createProjection, type GeoPoint, type MapPoint, type Projection } from "./projection";
import {
  HOLD_MS,
  hold,
  hover,
  keepInView,
  leave,
  press,
  release,
  shown,
  tap,
  type SightState,
} from "./sight-state";
import {
  buildSightShapes,
  picturesToDrop,
  sightAt,
  sightInView,
  type Sight,
  type SightShape,
} from "./sights";
import { levelForScale, Pyramid, tileKey } from "./tiles";

/**
 * The map engine: a plain class that owns two canvases and the view. React never
 * re-renders per frame; components call methods and subscribe to events.
 *
 *   tiles canvas   the pixel-art map, plus "scene" layers drawn in map space
 *                  (sprites: they scale with the map and sit under the tilt-shift blur)
 *   marks canvas   neighbourhood lines, names and the search pin, above the blur, always sharp
 */

export interface ViewState {
  /** map px at the centre of the viewport */
  x: number;
  y: number;
  /** CSS px per map px */
  scale: number;
  /** viewport, CSS px */
  width: number;
  height: number;
  dpr: number;
  /** the visible map-px rectangle */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Draws on the tiles canvas after the tiles. The context is already in map space
 * (1 unit = 1 map px at native resolution, smoothing off), so a sprite drawn at a
 * projected point lines up with the tiles at every zoom. Cull with view.left/top/right/bottom.
 */
export type SceneDraw = (
  ctx: CanvasRenderingContext2D,
  view: Readonly<ViewState>,
  timeMs: number,
) => void;

export interface Pin extends GeoPoint {
  name: string;
}

export interface EngineEvents {
  /** every frame the view changed */
  view: (view: Readonly<ViewState>) => void;
  /** once the view has stopped moving */
  settle: (view: Readonly<ViewState>) => void;
  /** the neighbourhood under the pointer changed (lines on only) */
  hood: (name: string | null) => void;
  /** the lit sight changed: hovered, pinned (a click or a tap), or none */
  sight: (shown: { id: string; pinned: boolean } | null) => void;
}

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  marks: HTMLCanvasElement;
  manifest: Manifest;
  /** full URL of a tile file */
  tileUrl: (z: number, tx: number, ty: number) => string;
  /** full URL of another file in the world's data folder (a sight's picture); none: no pictures */
  fileUrl?: (path: string) => string;
  reducedMotion?: boolean;
  /** first view; defaults to manifest.start */
  start?: { lon: number; lat: number; scale?: number };
}

/** A sight's picture, loaded the first time it lights up (no bitmap: loading, or it failed). */
interface SightPicture {
  bitmap: ImageBitmap | null;
  readyAt: number;
  usedAt: number;
}

interface Tile {
  key: string;
  state: "loading" | "ready" | "error";
  bitmap: ImageBitmap | null;
  readyAt: number;
  usedFrame: number;
  wantedAt: number;
  abort: AbortController | null;
  retryAt: number;
  pinned: boolean;
}

interface Wanted {
  z: number;
  tx: number;
  ty: number;
  dist: number;
}

const MAX_LOADS = 6;
const FADE_MS = 180;
const STALE_MS = 700; // a download nobody has asked for in this long is cancelled
const SETTLE_MS = 220;
const ZOOM_STEP = 1.5;
const NICE_SCALES = [0.125, 0.25, 0.5, 1, 1.5, 2, 3, 4];

const INK = "#15171a";
const PAPER = "#f4f2ec";
/** The world's brand colour: highlighted outlines, name plates and the search pin. */
const TAXI = WORLD.accent.color;
const TAXI_RGB = hexToRgb(TAXI);

/** "#f7c21b" → "247, 194, 27", for rgba() with an alpha of its own. */
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** How long the spotlight takes to come on from nothing (ms). */
const SPOT_FADE_MS = 120;
/** Px of sights' pictures kept once they are out of the spotlight (four bytes each). */
const PICTURE_BUDGET = 24_000_000;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class MapEngine {
  readonly manifest: Manifest;
  readonly projection: Projection;

  private readonly canvas: HTMLCanvasElement;
  private readonly marks: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly mctx: CanvasRenderingContext2D;
  private readonly pyramid: Pyramid;
  private readonly tileUrl: EngineOptions["tileUrl"];
  private readonly fileUrl: EngineOptions["fileUrl"];

  private view: ViewState = {
    x: 0,
    y: 0,
    scale: 1,
    width: 1,
    height: 1,
    dpr: 1,
    left: 0,
    top: 0,
    right: 1,
    bottom: 1,
  };
  private minScale = 0.01;
  /** how many decoded tiles to keep (each is 1 MB at 512 px): a few screens' worth */
  private maxTiles = 120;
  private reducedMotion: boolean;
  private destroyed = false;

  // frame loop
  private raf = 0;
  private lastFrame = 0;
  private frameNo = 0;
  private dirty = true;
  private lastEmitted = { x: NaN, y: NaN, scale: NaN, width: NaN, height: NaN };
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  // tiles
  private readonly tiles = new Map<string, Tile>();
  private readonly tries = new Map<string, number>();
  private inflight = 0;

  // motion
  private inertia: { vx: number; vy: number } | null = null;
  private zoomTarget: { scale: number; ax: number; ay: number; mx: number; my: number } | null =
    null;
  private flight: {
    t0: number;
    dur: number;
    x0: number;
    y0: number;
    s0: number;
    x1: number;
    y1: number;
    s1: number;
    dip: number;
  } | null = null;

  // input
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private drag: {
    lastX: number;
    lastY: number;
    moved: number;
    t0: number;
    samples: { t: number; x: number; y: number }[];
  } | null = null;
  private pinch: { dist: number; midX: number; midY: number } | null = null;
  private lastTap = { t: 0, x: 0, y: 0 };
  private lastPointerType = "mouse";
  private hoverPoint: { x: number; y: number } | null = null;
  private hoverPending = false;

  // marks
  private hoods: HoodShape[] = [];
  private hoodLines = false;
  private hoveredHood = -1;
  private pin: (Pin & MapPoint & { t0: number }) | null = null;
  private readonly labelWidths = new Map<string, number>();
  private fontFamily = "sans-serif";
  private marksDrawn = false;
  private sights: SightShape[] = [];
  private sightIndex = new Map<string, number>();
  private sightState: SightState = { hovered: null, pinned: null, leftAt: null };
  /** lets a held sight go once the pointer has stayed on open ground (sight-state's HOLD_MS) */
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  /** when the spotlight came on from nothing (it fades in), or -1 while it is off */
  private spotT0 = -1;
  /** the lit sights' pictures, whole: drawn over the tiles so nothing in front hides them */
  private readonly pictures = new Map<string, SightPicture>();
  private shownKey = "";

  // scene
  private life = true;
  private readonly sceneLayers = new Set<SceneDraw>();

  private readonly listeners: { [K in keyof EngineEvents]: Set<EngineEvents[K]> } = {
    view: new Set(),
    settle: new Set(),
    hood: new Set(),
    sight: new Set(),
  };
  private readonly resizeObserver: ResizeObserver;

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    this.marks = options.marks;
    this.manifest = options.manifest;
    this.tileUrl = options.tileUrl;
    this.fileUrl = options.fileUrl;
    this.reducedMotion = options.reducedMotion ?? false;
    this.projection = createProjection(options.manifest.geo);
    this.pyramid = new Pyramid(options.manifest);

    const ctx = this.canvas.getContext("2d");
    const mctx = this.marks.getContext("2d");
    if (!ctx || !mctx) throw new Error(activeStrings().errors.noCanvas);
    this.ctx = ctx;
    this.mctx = mctx;

    this.measure();
    const start = options.start ?? options.manifest.start;
    const centre = this.projection.toMap(start.lon, start.lat);
    this.view.x = centre.x;
    this.view.y = centre.y;
    this.view.scale = start.scale ?? options.manifest.start.scale;
    this.constrain();

    const c = this.canvas;
    c.addEventListener("pointerdown", this.onPointerDown);
    c.addEventListener("pointermove", this.onPointerMove);
    c.addEventListener("pointerup", this.onPointerUp);
    c.addEventListener("pointercancel", this.onPointerUp);
    c.addEventListener("pointerleave", this.onPointerLeave);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    c.addEventListener("dblclick", this.onDoubleClick);
    c.addEventListener("contextmenu", this.onContextMenu);

    this.resizeObserver = new ResizeObserver(() => {
      this.measure();
      this.constrain();
      this.invalidate();
    });
    this.resizeObserver.observe(this.canvas);
    window.addEventListener("resize", this.onWindowResize);

    this.fontFamily = getComputedStyle(this.canvas).fontFamily || this.fontFamily;
    void document.fonts?.ready.then(() => {
      if (this.destroyed) return;
      this.fontFamily = getComputedStyle(this.canvas).fontFamily || this.fontFamily;
      this.labelWidths.clear();
      this.invalidate();
    });

    this.preloadBase();
    this.invalidate();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.holdTimer) clearTimeout(this.holdTimer);
    for (const picture of this.pictures.values()) picture.bitmap?.close();
    this.pictures.clear();
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.onWindowResize);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("dblclick", this.onDoubleClick);
    c.removeEventListener("contextmenu", this.onContextMenu);
    for (const tile of this.tiles.values()) {
      tile.abort?.abort();
      tile.bitmap?.close();
    }
    this.tiles.clear();
    for (const set of Object.values(this.listeners)) set.clear();
    this.sceneLayers.clear();
  }

  // ---- public API ------------------------------------------------------------------------

  on<K extends keyof EngineEvents>(event: K, listener: EngineEvents[K]): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  /** A copy of the current view. */
  getView(): ViewState {
    return { ...this.view };
  }

  /** Where the centre of the view is on the ground. */
  getCentre(): GeoPoint {
    return this.projection.toGeo(this.view.x, this.view.y);
  }

  /** Scale at which the whole map fits the viewport. */
  getFitScale(): number {
    const b = this.manifest.bounds;
    return Math.min(this.view.width / (b.maxX - b.minX), this.view.height / (b.maxY - b.minY));
  }

  getScaleLimits(): { min: number; max: number } {
    return { min: this.minScale, max: this.manifest.maxScale };
  }

  screenToMap(sx: number, sy: number): MapPoint {
    const v = this.view;
    return { x: v.x + (sx - v.width / 2) / v.scale, y: v.y + (sy - v.height / 2) / v.scale };
  }

  mapToScreen(mx: number, my: number): MapPoint {
    const v = this.view;
    return { x: (mx - v.x) * v.scale + v.width / 2, y: (my - v.y) * v.scale + v.height / 2 };
  }

  /** Move the view at once. Coordinates are map px. */
  jumpTo(target: { x?: number; y?: number; scale?: number }): void {
    this.stopMotion();
    if (target.x !== undefined) this.view.x = target.x;
    if (target.y !== undefined) this.view.y = target.y;
    if (target.scale !== undefined) this.view.scale = target.scale;
    this.constrain();
    this.invalidate();
  }

  /** Glide to a spot on the ground, lifting off and coming back down on long trips. */
  flyTo(target: { lon: number; lat: number; scale?: number }): void {
    const p = this.projection.toMap(target.lon, target.lat);
    this.flyToMap({ x: p.x, y: p.y, scale: target.scale });
  }

  flyToMap(target: { x: number; y: number; scale?: number }): void {
    const v = this.view;
    const b = this.manifest.bounds;
    const s1 = clamp(target.scale ?? v.scale, this.minScale, this.manifest.maxScale);
    const x1 = clamp(target.x, b.minX, b.maxX);
    const y1 = clamp(target.y, b.minY, b.maxY);
    if (this.reducedMotion) {
      this.jumpTo({ x: x1, y: y1, scale: s1 });
      return;
    }
    this.stopMotion();
    // how far the trip is, in viewports, at the wider of the two zooms
    const low = Math.min(v.scale, s1);
    const trip = (Math.hypot(x1 - v.x, y1 - v.y) * low) / Math.max(v.width, v.height);
    const dip = trip > 1 ? Math.max(this.minScale, low / Math.min(trip, 24)) : 0;
    this.flight = {
      t0: performance.now(),
      dur: clamp(450 + 260 * Math.sqrt(trip) + 180 * Math.abs(Math.log2(s1 / v.scale)), 450, 1800),
      x0: v.x,
      y0: v.y,
      s0: v.scale,
      x1,
      y1,
      s1,
      dip,
    };
    this.invalidate();
  }

  /** Pan by a distance in CSS px. */
  panBy(dx: number, dy: number, animate = true): void {
    const v = this.view;
    if (animate && !this.reducedMotion) {
      this.flyToMap({ x: v.x + dx / v.scale, y: v.y + dy / v.scale, scale: v.scale });
      if (this.flight) this.flight.dur = 220;
    } else {
      this.jumpTo({ x: v.x + dx / v.scale, y: v.y + dy / v.scale });
    }
  }

  /** Zoom by a factor about a screen point (the centre by default). */
  zoomBy(factor: number, anchor?: { x: number; y: number }, animate = true): void {
    const v = this.view;
    const ax = anchor?.x ?? v.width / 2;
    const ay = anchor?.y ?? v.height / 2;
    const from = this.zoomTarget?.scale ?? v.scale;
    const scale = clamp(from * factor, this.minScale, this.manifest.maxScale);
    this.flight = null;
    this.inertia = null;
    if (animate && !this.reducedMotion) {
      const m = this.screenToMap(ax, ay);
      this.zoomTarget = { scale, ax, ay, mx: m.x, my: m.y };
    } else {
      this.zoomTarget = null;
      this.zoomAbout(ax, ay, scale);
    }
    this.invalidate();
  }

  /** One step of the zoom buttons: ×1.5, landing on round scales where pixels are crisp. */
  zoomStep(direction: 1 | -1, anchor?: { x: number; y: number }): void {
    const from = this.zoomTarget?.scale ?? this.view.scale;
    let to = from * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
    for (const nice of NICE_SCALES) {
      const moved = direction > 0 ? nice > from * 1.05 : nice < from / 1.05;
      if (moved && Math.abs(nice / to - 1) < 0.2) {
        to = nice;
        break;
      }
    }
    this.zoomBy(to / from, anchor);
  }

  /** Show the whole map. */
  fitAll(animate = true): void {
    const b = this.manifest.bounds;
    const target = {
      x: (b.minX + b.maxX) / 2,
      y: (b.minY + b.maxY) / 2,
      scale: this.getFitScale() * 0.94,
    };
    if (animate) this.flyToMap(target);
    else this.jumpTo(target);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced) this.stopMotion();
    this.invalidate();
  }

  setHoods(hoods: Hood[]): void {
    this.hoods = buildHoodShapes(hoods, this.projection);
    this.setHoveredHood(-1);
    this.invalidate();
  }

  setHoodLines(on: boolean): void {
    if (this.hoodLines === on) return;
    this.hoodLines = on;
    if (!on) this.setHoveredHood(-1);
    this.invalidate();
  }

  /** The structures that light up under the pointer (sights.json). */
  setSights(sights: Sight[]): void {
    this.sights = buildSightShapes(sights);
    this.sightIndex = new Map(this.sights.map((s, i) => [s.id, i]));
    for (const picture of this.pictures.values()) picture.bitmap?.close();
    this.pictures.clear();
    this.setSightState({ hovered: null, pinned: null, leftAt: null });
    this.invalidate();
  }

  /** Let the pinned sight go (Esc, the sign's close button). */
  releaseSight(): void {
    this.setSightState(release(this.sightState));
  }

  /**
   * Hold one sight lit whatever the pointer does (a round of Guess the building), or let it go
   * (null). While it holds, no other sight lights up, and Esc or the view moving away do not
   * let it go: only the page does.
   */
  holdSight(id: string | null): void {
    this.setSightState(hold(this.sightState, id));
  }

  /** Where a sight's sign hangs, in CSS px on screen. */
  sightAnchor(id: string): MapPoint | null {
    const i = this.sightIndex.get(id);
    if (i === undefined) return null;
    const [x, y] = this.sights[i].anchor;
    return this.mapToScreen(x, y);
  }

  setPin(pin: Pin | null): void {
    this.pin = pin
      ? { ...pin, ...this.projection.toMap(pin.lon, pin.lat), t0: performance.now() }
      : null;
    this.invalidate();
  }

  /** "Life on the map": whether scene layers are drawn (and animated). */
  setLife(on: boolean): void {
    if (this.life === on) return;
    this.life = on;
    this.invalidate();
  }

  /**
   * Adds a layer drawn over the tiles in map space; returns its remover. Layers are
   * only called while life is on, every frame unless the visitor prefers reduced motion
   * (then once per redraw, with time standing still).
   */
  addSceneLayer(draw: SceneDraw): () => void {
    this.sceneLayers.add(draw);
    this.invalidate();
    return () => {
      this.sceneLayers.delete(draw);
      this.invalidate();
    };
  }

  /** Ask for a redraw. */
  invalidate(): void {
    this.dirty = true;
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.frame);
  }

  // ---- view ------------------------------------------------------------------------------

  private measure(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.view.width = width;
    this.view.height = height;
    this.view.dpr = dpr;
    for (const c of [this.canvas, this.marks]) {
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
    }
    const fit = this.getFitScale();
    this.minScale = Math.min(fit * 0.6, this.manifest.maxScale, 1);
    const t = this.manifest.tileSize;
    const onScreen = (Math.ceil((width * dpr) / t) + 1) * (Math.ceil((height * dpr) / t) + 1);
    this.maxTiles = clamp(Math.round(onScreen * 2.5), 48, 200);
  }

  /** Keeps the view on the map and refreshes the visible rectangle. */
  private constrain(): void {
    const v = this.view;
    const b = this.manifest.bounds;
    v.scale = clamp(v.scale, this.minScale, this.manifest.maxScale);
    v.x = clamp(v.x, b.minX, b.maxX);
    v.y = clamp(v.y, b.minY, b.maxY);
    const hw = v.width / 2 / v.scale;
    const hh = v.height / 2 / v.scale;
    v.left = v.x - hw;
    v.right = v.x + hw;
    v.top = v.y - hh;
    v.bottom = v.y + hh;
  }

  private zoomAbout(ax: number, ay: number, scale: number, mx?: number, my?: number): void {
    const v = this.view;
    const m = mx !== undefined && my !== undefined ? { x: mx, y: my } : this.screenToMap(ax, ay);
    v.scale = clamp(scale, this.minScale, this.manifest.maxScale);
    v.x = m.x - (ax - v.width / 2) / v.scale;
    v.y = m.y - (ay - v.height / 2) / v.scale;
    this.constrain();
  }

  private stopMotion(): void {
    this.inertia = null;
    this.zoomTarget = null;
    this.flight = null;
  }

  private get moving(): boolean {
    return !!(this.inertia || this.zoomTarget || this.flight);
  }

  // ---- frame loop ------------------------------------------------------------------------

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.destroyed) return;
    const dt = Math.min(64, this.lastFrame ? now - this.lastFrame : 16);
    this.lastFrame = now;
    this.frameNo++;

    this.advance(now, dt);
    this.constrain();
    this.dropSightsOutOfView();

    const lifeRuns = this.life && this.sceneLayers.size > 0 && !this.reducedMotion;
    let fading = false;
    if (this.dirty || this.moving || lifeRuns) {
      this.dirty = false;
      fading = this.drawTiles(now);
      if (this.drawSightPicture(now)) fading = true;
      this.drawScene(now);
      this.drawMarks(now);
      this.pump(now);
      this.evict();
    }
    this.emitView();

    const pinDropping = this.pin !== null && now - this.pin.t0 < 320 && !this.reducedMotion;
    const spotFading = this.spotT0 >= 0 && now - this.spotT0 < SPOT_FADE_MS && !this.reducedMotion;
    if (this.moving || fading || lifeRuns || pinDropping || spotFading || this.dirty) {
      if (fading || pinDropping || spotFading) this.dirty = true;
      if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    } else {
      this.lastFrame = 0;
    }
  };

  private advance(now: number, dt: number): void {
    const v = this.view;
    const f = this.flight;
    if (f) {
      const t = clamp((now - f.t0) / f.dur, 0, 1);
      const e = easeInOut(t);
      // scale moves in log space; a long trip dips towards `dip` in the middle
      let logS = Math.log(f.s0) + (Math.log(f.s1) - Math.log(f.s0)) * e;
      if (f.dip > 0) {
        const mid = (Math.log(f.s0) + Math.log(f.s1)) / 2;
        const depth = Math.min(0, Math.log(f.dip) - mid);
        logS += depth * Math.sin(Math.PI * e);
      }
      v.scale = Math.exp(logS);
      v.x = f.x0 + (f.x1 - f.x0) * e;
      v.y = f.y0 + (f.y1 - f.y0) * e;
      if (t >= 1) this.flight = null;
      return;
    }

    const z = this.zoomTarget;
    if (z) {
      const k = 1 - Math.exp(-dt / 70);
      const logS = Math.log(v.scale) + (Math.log(z.scale) - Math.log(v.scale)) * k;
      let scale = Math.exp(logS);
      if (Math.abs(scale / z.scale - 1) < 0.002) {
        scale = z.scale;
        this.zoomTarget = null;
      }
      this.zoomAbout(z.ax, z.ay, scale, z.mx, z.my);
    }

    const i = this.inertia;
    if (i) {
      v.x -= (i.vx * dt) / v.scale;
      v.y -= (i.vy * dt) / v.scale;
      const decay = Math.exp(-dt / 280);
      i.vx *= decay;
      i.vy *= decay;
      if (Math.hypot(i.vx, i.vy) < 0.02) this.inertia = null;
    }
  }

  private emitView(): void {
    const v = this.view;
    const l = this.lastEmitted;
    if (
      v.x === l.x &&
      v.y === l.y &&
      v.scale === l.scale &&
      v.width === l.width &&
      v.height === l.height
    )
      return;
    this.lastEmitted = { x: v.x, y: v.y, scale: v.scale, width: v.width, height: v.height };
    for (const listener of this.listeners.view) listener(v);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      if (this.destroyed) return;
      for (const listener of this.listeners.settle) listener(this.view);
    }, SETTLE_MS);
  }

  // ---- tiles -----------------------------------------------------------------------------

  private readonly wanted: Wanted[] = [];

  /** Draws the visible tiles; returns whether any is still fading in. */
  private drawTiles(now: number): boolean {
    const { ctx, view: v, pyramid } = this;
    const s = v.scale * v.dpr; // device px per map px
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // chunky pixels once a map pixel is at least a screen pixel; smooth when shrinking
    ctx.imageSmoothingEnabled = v.scale < 1;
    ctx.imageSmoothingQuality = "medium";

    // on a dense screen the next finer level still has a pixel to show for every pixel it holds
    const z = levelForScale(v.scale * Math.min(v.dpr, 2), pyramid.maxZ);
    const range = pyramid.range(z, v);
    const devX = (mx: number) => Math.round((mx - v.left) * s);
    const devY = (my: number) => Math.round((my - v.top) * s);
    const span = pyramid.span(z);
    let fading = false;
    this.wanted.length = 0;

    for (let ty = range.ty0; ty <= range.ty1; ty++) {
      for (let tx = range.tx0; tx <= range.tx1; tx++) {
        if (!pyramid.has(z, tx, ty)) continue;
        const left = pyramid.originX + tx * span;
        const top = pyramid.originY + ty * span;
        // edges are rounded, not sizes, so neighbours always share a device pixel boundary
        const dx = devX(left);
        const dy = devY(top);
        const dw = devX(left + span) - dx;
        const dh = devY(top + span) - dy;
        if (dw <= 0 || dh <= 0) continue;

        const key = tileKey(z, tx, ty);
        let tile = this.tiles.get(key);
        if (tile?.state === "error" && now >= tile.retryAt) {
          this.tiles.delete(key); // failed a while ago: ask again
          tile = undefined;
        }
        let alpha = 0;
        if (tile) {
          tile.usedFrame = this.frameNo;
          tile.wantedAt = now;
          if (tile.state === "ready") {
            alpha = this.reducedMotion ? 1 : clamp((now - tile.readyAt) / FADE_MS, 0, 1);
          }
        } else {
          this.wanted.push({
            z,
            tx,
            ty,
            dist: Math.hypot(left + span / 2 - v.x, top + span / 2 - v.y),
          });
        }

        if (alpha < 1) {
          this.drawStandIn(z, tx, ty, dx, dy, dw, dh);
          if (alpha > 0) fading = true;
        }
        if (alpha > 0 && tile?.bitmap) {
          ctx.globalAlpha = alpha;
          ctx.drawImage(tile.bitmap, dx, dy, dw, dh);
          ctx.globalAlpha = 1;
        }
      }
    }
    return fading;
  }

  /** While a tile loads, show what is already here: its four children, or a coarser ancestor. */
  private drawStandIn(
    z: number,
    tx: number,
    ty: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    const { ctx, pyramid } = this;
    if (z > 0 && pyramid.hasLevel(z - 1)) {
      const kids: [ImageBitmap, number, number][] = [];
      let complete = true;
      for (let j = 0; j < 2 && complete; j++) {
        for (let i = 0; i < 2; i++) {
          const cx = tx * 2 + i;
          const cy = ty * 2 + j;
          if (!pyramid.has(z - 1, cx, cy)) continue;
          const kid = this.tiles.get(tileKey(z - 1, cx, cy));
          if (kid?.state !== "ready" || !kid.bitmap) {
            complete = false;
            break;
          }
          kid.usedFrame = this.frameNo;
          kids.push([kid.bitmap, i, j]);
        }
      }
      if (complete && kids.length > 0) {
        const midX = dx + Math.round(dw / 2);
        const midY = dy + Math.round(dh / 2);
        for (const [bitmap, i, j] of kids) {
          const x = i === 0 ? dx : midX;
          const y = j === 0 ? dy : midY;
          const w = i === 0 ? midX - dx : dx + dw - midX;
          const h = j === 0 ? midY - dy : dy + dh - midY;
          ctx.drawImage(bitmap, x, y, w, h);
        }
        return;
      }
    }
    for (let dz = 1; z + dz <= pyramid.maxZ; dz++) {
      const ax = tx >> dz;
      const ay = ty >> dz;
      const ancestor = this.tiles.get(tileKey(z + dz, ax, ay));
      if (ancestor?.state !== "ready" || !ancestor.bitmap) continue;
      ancestor.usedFrame = this.frameNo;
      const size = pyramid.tileSize / 2 ** dz;
      const sx = (tx - (ax << dz)) * size;
      const sy = (ty - (ay << dz)) * size;
      ctx.drawImage(ancestor.bitmap, sx, sy, size, size, dx, dy, dw, dh);
      return;
    }
  }

  /** The coarsest level is small: keep all of it, so there is always something to show. */
  private preloadBase(): void {
    const z = this.pyramid.maxZ;
    const base = this.pyramid.all(z);
    if (base.length > 40) return;
    for (const { tx, ty } of base) this.load(z, tx, ty, performance.now(), true);
  }

  /** Starts the nearest downloads, and cancels the ones the view has moved away from. */
  private pump(now: number): void {
    for (const tile of this.tiles.values()) {
      if (tile.state === "loading" && !tile.pinned && now - tile.wantedAt > STALE_MS) {
        tile.abort?.abort();
        this.tiles.delete(tile.key);
        this.inflight--;
      }
    }
    if (this.wanted.length === 0) return;
    this.wanted.sort((a, b) => a.dist - b.dist);
    for (const w of this.wanted) {
      if (this.inflight >= MAX_LOADS) break;
      this.load(w.z, w.tx, w.ty, now, false);
    }
  }

  private load(z: number, tx: number, ty: number, now: number, pinned: boolean): void {
    const key = tileKey(z, tx, ty);
    if (this.tiles.has(key)) return;
    const abort = new AbortController();
    const tile: Tile = {
      key,
      state: "loading",
      bitmap: null,
      readyAt: 0,
      usedFrame: this.frameNo,
      wantedAt: now,
      abort,
      retryAt: 0,
      pinned,
    };
    this.tiles.set(key, tile);
    this.inflight++;

    fetch(this.tileUrl(z, tx, ty), { signal: abort.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        if (this.destroyed || this.tiles.get(key) !== tile) {
          bitmap.close();
          return;
        }
        tile.bitmap = bitmap;
        tile.state = "ready";
        tile.readyAt = performance.now();
        tile.abort = null;
        this.inflight--;
        this.tries.delete(key);
        this.invalidate();
      })
      .catch(() => {
        // cancelled by pump(), which already forgot the tile and freed its slot
        if (this.destroyed || this.tiles.get(key) !== tile) return;
        const tries = (this.tries.get(key) ?? 0) + 1;
        this.tries.set(key, tries);
        tile.state = "error";
        tile.abort = null;
        // back off; a tile that keeps failing is asked for again only now and then
        const wait = Math.min(60_000, 1500 * 2 ** tries);
        tile.retryAt = performance.now() + wait;
        this.inflight--;
        this.invalidate();
        setTimeout(() => this.invalidate(), wait + 30);
      });
  }

  private evict(): void {
    if (this.tiles.size <= this.maxTiles) return;
    const idle: Tile[] = [];
    for (const tile of this.tiles.values()) {
      if (tile.state === "ready" && !tile.pinned && tile.usedFrame < this.frameNo) idle.push(tile);
    }
    idle.sort((a, b) => a.usedFrame - b.usedFrame);
    for (const tile of idle) {
      if (this.tiles.size <= this.maxTiles) break;
      tile.bitmap?.close();
      this.tiles.delete(tile.key);
    }
  }

  // ---- the lit sight's picture ------------------------------------------------------------

  /**
   * The lit sight drawn whole over the tiles, under the dim's cut-out: what stands in front of it
   * in the map no longer hides it. Placed and smoothed like the tiles, so it lines up with them
   * and takes the blur and the dusk like them. Returns whether it is still fading in.
   */
  private drawSightPicture(now: number): boolean {
    const lit = shown(this.sightState);
    if (!lit) return false;
    const i = this.sightIndex.get(lit.id);
    const sprite = i === undefined ? undefined : this.sights[i].sprite;
    const picture = this.pictures.get(lit.id);
    if (!sprite || !picture?.bitmap) return false;
    picture.usedAt = now;
    const { ctx, view: v } = this;
    const s = v.scale * v.dpr;
    const dx = Math.round((sprite.x - v.left) * s);
    const dy = Math.round((sprite.y - v.top) * s);
    const dw = Math.round((sprite.x + sprite.w - v.left) * s) - dx;
    const dh = Math.round((sprite.y + sprite.h - v.top) * s) - dy;
    if (dw <= 0 || dh <= 0) return false;
    // it comes on with the spotlight, or as it arrives if the spotlight was there first
    const from = Math.max(this.spotT0, picture.readyAt);
    const alpha = this.reducedMotion ? 1 : clamp((now - from) / SPOT_FADE_MS, 0, 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = v.scale < 1;
    ctx.globalAlpha = alpha;
    ctx.drawImage(picture.bitmap, dx, dy, dw, dh);
    ctx.globalAlpha = 1;
    return alpha < 1;
  }

  /** Fetches a sight's picture once, the first time it lights up; a failure is not asked again. */
  private askPicture(id: string): void {
    const i = this.sightIndex.get(id);
    const sprite = i === undefined ? undefined : this.sights[i].sprite;
    if (!sprite || !this.fileUrl || this.pictures.has(id)) return;
    const picture: SightPicture = { bitmap: null, readyAt: 0, usedAt: performance.now() };
    this.pictures.set(id, picture);
    fetch(this.fileUrl(sprite.src))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        if (this.destroyed || this.pictures.get(id) !== picture) {
          bitmap.close();
          return;
        }
        picture.bitmap = bitmap;
        picture.readyAt = performance.now();
        this.dropPictures();
        this.invalidate();
      })
      .catch(() => {
        // kept without a bitmap, so it is not asked again: the spotlight works without it
      });
  }

  /** Keeps the pictures within PICTURE_BUDGET, the lit one always. */
  private dropPictures(): void {
    const lit = shown(this.sightState);
    const list = [...this.pictures].map(([id, p]) => ({
      id,
      px: p.bitmap ? p.bitmap.width * p.bitmap.height : 0,
      usedAt: p.usedAt,
    }));
    for (const id of picturesToDrop(list, lit?.id ?? null, PICTURE_BUDGET)) {
      this.pictures.get(id)?.bitmap?.close();
      this.pictures.delete(id);
    }
  }

  // ---- scene (sprites, in map space) -----------------------------------------------------

  private drawScene(now: number): void {
    if (!this.life || this.sceneLayers.size === 0) return;
    const { ctx, view: v } = this;
    const s = v.scale * v.dpr;
    ctx.save();
    ctx.setTransform(s, 0, 0, s, Math.round(-v.left * s), Math.round(-v.top * s));
    ctx.imageSmoothingEnabled = false;
    const time = this.reducedMotion ? 0 : now;
    for (const draw of this.sceneLayers) draw(ctx, v, time);
    ctx.restore();
  }

  // ---- marks (lines, names, pin) ---------------------------------------------------------

  private drawMarks(now: number): void {
    const ctx = this.mctx;
    const lit = shown(this.sightState);
    const show = (this.hoodLines && this.hoods.length > 0) || this.pin !== null || lit !== null;
    if (!show && !this.marksDrawn) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.marks.width, this.marks.height);
    this.marksDrawn = show;
    if (!show) return;

    if (this.hoodLines && this.hoods.length > 0) this.drawHoods();
    if (lit) this.drawSpotlight(lit.id, now);
    if (this.pin) this.drawPin(now);
  }

  /** The rest of the map dims; the sight keeps its colour inside a thin line of the accent. */
  private drawSpotlight(id: string, now: number): void {
    const i = this.sightIndex.get(id);
    if (i === undefined) return;
    const sight = this.sights[i];
    const { mctx: ctx, view: v } = this;
    const s = v.scale * v.dpr;
    // it comes on softly from nothing; from one building to the next it simply moves
    ctx.globalAlpha =
      this.reducedMotion || this.spotT0 < 0 ? 1 : clamp((now - this.spotT0) / SPOT_FADE_MS, 0, 1);
    const trace = () => {
      for (const ring of sight.paths) {
        ctx.moveTo(ring[0], ring[1]);
        for (let j = 2; j < ring.length; j += 2) ctx.lineTo(ring[j], ring[j + 1]);
        ctx.closePath();
      }
    };
    // the whole screen with the outline cut out of it (points are fixed as they are added)
    ctx.beginPath();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.rect(0, 0, this.marks.width, this.marks.height);
    ctx.setTransform(s, 0, 0, s, -v.left * s, -v.top * s);
    trace();
    ctx.fillStyle = "rgba(12, 14, 16, 0.58)";
    ctx.fill("evenodd");

    ctx.beginPath();
    trace();
    ctx.lineJoin = "round";
    ctx.strokeStyle = TAXI;
    ctx.lineWidth = 2 / v.scale; // two CSS px, in map units
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawHoods(): void {
    const { mctx: ctx, view: v } = this;
    const s = v.scale * v.dpr;
    const visible: number[] = [];
    for (let i = 0; i < this.hoods.length; i++) {
      const h = this.hoods[i];
      if (h.right < v.left || h.left > v.right || h.bottom < v.top || h.top > v.bottom) continue;
      visible.push(i);
    }

    // outlines, in map space
    ctx.setTransform(s, 0, 0, s, -v.left * s, -v.top * s);
    ctx.lineJoin = "round";
    const trace = (h: HoodShape) => {
      ctx.beginPath();
      for (const ring of h.rings) {
        ctx.moveTo(ring[0], ring[1]);
        for (let i = 2; i < ring.length; i += 2) ctx.lineTo(ring[i], ring[i + 1]);
        ctx.closePath();
      }
    };
    const px = 1 / v.scale; // one CSS px, in map units
    ctx.beginPath();
    for (const i of visible) {
      for (const ring of this.hoods[i].rings) {
        ctx.moveTo(ring[0], ring[1]);
        for (let j = 2; j < ring.length; j += 2) ctx.lineTo(ring[j], ring[j + 1]);
        ctx.closePath();
      }
    }
    ctx.strokeStyle = "rgba(21, 23, 26, 0.55)";
    ctx.lineWidth = 4.5 * px;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 1.75 * px;
    ctx.stroke();

    const hovered = this.hoveredHood >= 0 ? this.hoods[this.hoveredHood] : null;
    if (hovered) {
      trace(hovered);
      // a wash of yellow, thinner the more of the screen the hood fills, so the map stays readable
      const share =
        ((hovered.right - hovered.left) * (hovered.bottom - hovered.top) * v.scale * v.scale) /
        (v.width * v.height);
      ctx.fillStyle = `rgba(${TAXI_RGB}, ${clamp(0.24 - 0.2 * share, 0.05, 0.24)})`;
      ctx.fill("evenodd");
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4.5 * px;
      ctx.stroke();
      ctx.strokeStyle = TAXI;
      ctx.lineWidth = 2.5 * px;
      ctx.stroke();
    }

    // names, in screen space: only where the plate fits inside its hood and nothing is under it
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.font = `600 11px ${this.fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.letterSpacing = "0.7px";
    const placed: { l: number; t: number; r: number; b: number }[] = [];
    const plate = (h: HoodShape, highlighted: boolean) => {
      const text = h.name.toUpperCase();
      let tw = this.labelWidths.get(text);
      if (tw === undefined) {
        tw = ctx.measureText(text).width;
        this.labelWidths.set(text, tw);
      }
      const w = Math.ceil(tw) + 14;
      const height = 20;
      const cx = Math.round((h.cx - v.left) * v.scale);
      const cy = Math.round((h.cy - v.top) * v.scale);
      const box = { l: cx - w / 2, t: cy - height / 2, r: cx + w / 2, b: cy + height / 2 };
      if (!highlighted) {
        const roomX = (h.right - h.left) * v.scale;
        const roomY = (h.bottom - h.top) * v.scale;
        if (w > roomX * 0.9 || height * 1.5 > roomY) return;
        if (box.r < 0 || box.l > v.width || box.b < 0 || box.t > v.height) return;
        for (const p of placed) {
          if (box.l < p.r + 4 && box.r > p.l - 4 && box.t < p.b + 3 && box.b > p.t - 3) return;
        }
      }
      placed.push(box);
      ctx.fillStyle = highlighted ? TAXI : INK;
      ctx.beginPath();
      ctx.roundRect(box.l, box.t, w, height, 3);
      ctx.fill();
      ctx.fillStyle = highlighted ? INK : PAPER;
      ctx.fillText(text, cx, cy + 0.5);
    };
    // the highlighted hood always gets its name, so it goes first and the rest make room
    if (hovered) plate(hovered, true);
    for (const i of visible) if (this.hoods[i] !== hovered) plate(this.hoods[i], false);
    ctx.letterSpacing = "0px";
  }

  private drawPin(now: number): void {
    const { mctx: ctx, view: v, pin } = this;
    if (!pin) return;
    const x = Math.round((pin.x - v.left) * v.scale);
    const y = Math.round((pin.y - v.top) * v.scale);
    if (x < -200 || x > v.width + 200 || y < -60 || y > v.height + 60) return;
    const t = this.reducedMotion ? 1 : clamp((now - pin.t0) / 320, 0, 1);
    const drop = (1 - (1 - Math.pow(1 - t, 3))) * -26; // falls in, easing out
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);

    // where it touches the ground
    ctx.fillStyle = `rgba(21, 23, 26, ${0.35 * t})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 7, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // the marker: a bullet on a stem
    const cy = y - 24 + drop;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y + drop);
    ctx.lineTo(x, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, cy, 10, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, cy, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = TAXI;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();

    // its name, on a plate beside it
    ctx.font = `600 12.5px ${this.fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const tw = Math.ceil(ctx.measureText(pin.name).width);
    const w = tw + 16;
    const h = 24;
    let px = x + 16;
    if (px + w > v.width - 8) px = x - 16 - w; // keep it on screen
    const py = cy - h / 2;
    ctx.globalAlpha = t;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(px, py, w, h, 4);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.fillText(pin.name, px + 8, cy + 0.5);
    ctx.globalAlpha = 1;
  }

  private setHoveredHood(index: number): void {
    if (index === this.hoveredHood) return;
    this.hoveredHood = index;
    const name = index >= 0 ? this.hoods[index].name : null;
    for (const listener of this.listeners.hood) listener(name);
    this.invalidate();
  }

  private setSightState(next: SightState): void {
    if (next === this.sightState) return;
    this.sightState = next;
    this.canvas.classList.toggle("over-sight", next.hovered !== null && next.leftAt === null);
    // a sight held after the pointer left it lets go once the hold is over, unless taken again
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer =
      next.leftAt === null
        ? null
        : setTimeout(() => {
            this.holdTimer = null;
            if (this.sightState.leftAt !== null)
              this.setSightState(hover(this.sightState, null, performance.now()));
          }, HOLD_MS);
    const lit = shown(next);
    const key = lit ? `${lit.id}|${lit.pinned}` : "";
    if (key === this.shownKey) return;
    if (!lit) this.spotT0 = -1;
    else if (!this.shownKey) this.spotT0 = performance.now();
    if (lit) this.askPicture(lit.id);
    this.shownKey = key;
    for (const listener of this.listeners.sight) listener(lit);
    this.invalidate();
  }

  /** A lit sight the view has left wholly behind lets go: the map shows plain again. */
  private dropSightsOutOfView(): void {
    const { pinned, hovered } = this.sightState;
    if (pinned === null && hovered === null) return;
    this.setSightState(
      keepInView(this.sightState, (id) => {
        const i = this.sightIndex.get(id);
        return i !== undefined && sightInView(this.sights[i], this.view);
      }),
    );
  }

  /** The id of the sight under a screen point, or null. */
  private sightUnder(sx: number, sy: number): string | null {
    if (this.sights.length === 0) return null;
    const m = this.screenToMap(sx, sy);
    const i = sightAt(this.sights, m.x, m.y);
    return i >= 0 ? this.sights[i].id : null;
  }

  private hoodUnder(sx: number, sy: number): number {
    const m = this.screenToMap(sx, sy);
    return hoodAt(this.hoods, m.x, m.y);
  }

  // ---- input -----------------------------------------------------------------------------

  private local(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.lastPointerType = e.pointerType;
    const p = this.local(e);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    this.pointers.set(e.pointerId, p);
    this.stopMotion();
    if (this.pointers.size === 1) {
      this.drag = { lastX: p.x, lastY: p.y, moved: 0, t0: performance.now(), samples: [] };
      this.canvas.classList.add("dragging");
    } else if (this.pointers.size === 2) {
      this.drag = null;
      this.pinch = this.pinchState();
    }
  };

  private pinchState(): { dist: number; midX: number; midY: number } {
    const [a, b] = [...this.pointers.values()];
    return {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.local(e);
    if (!this.pointers.has(e.pointerId)) {
      // a mouse passing over: which sight, else which neighbourhood, is under it
      const lines = this.hoodLines && this.hoods.length > 0;
      if (e.pointerType === "mouse" && (lines || this.sights.length > 0)) {
        this.hoverPoint = p;
        if (!this.hoverPending) {
          this.hoverPending = true;
          requestAnimationFrame(() => {
            this.hoverPending = false;
            if (this.destroyed || !this.hoverPoint) return;
            const { x, y } = this.hoverPoint;
            const sight = this.sightUnder(x, y);
            this.setSightState(hover(this.sightState, sight, performance.now()));
            if (this.hoodLines) this.setHoveredHood(sight ? -1 : this.hoodUnder(x, y));
          });
        }
      }
      return;
    }
    this.pointers.set(e.pointerId, p);
    const v = this.view;

    if (this.pointers.size === 1 && this.drag) {
      const d = this.drag;
      const dx = p.x - d.lastX;
      const dy = p.y - d.lastY;
      d.lastX = p.x;
      d.lastY = p.y;
      d.moved += Math.abs(dx) + Math.abs(dy);
      v.x -= dx / v.scale;
      v.y -= dy / v.scale;
      const now = performance.now();
      d.samples.push({ t: now, x: p.x, y: p.y });
      while (d.samples.length > 2 && now - d.samples[0].t > 90) d.samples.shift();
      this.constrain();
      this.invalidate();
    } else if (this.pointers.size === 2 && this.pinch) {
      const next = this.pinchState();
      const prev = this.pinch;
      // the spot between the fingers stays between the fingers
      const m = this.screenToMap(prev.midX, prev.midY);
      this.zoomAbout(next.midX, next.midY, v.scale * (next.dist / prev.dist), m.x, m.y);
      this.pinch = next;
      this.invalidate();
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pointers.get(e.pointerId)!;
    this.pointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }

    if (this.pointers.size === 1) {
      // one finger lifted from a pinch: the other carries on as a drag, but is no tap
      const rest = [...this.pointers.values()][0];
      this.pinch = null;
      this.drag = { lastX: rest.x, lastY: rest.y, moved: 999, t0: 0, samples: [] };
      return;
    }
    if (this.pointers.size > 1) {
      this.pinch = this.pinchState();
      return;
    }

    this.canvas.classList.remove("dragging");
    this.pinch = null;
    const d = this.drag;
    this.drag = null;
    if (!d || e.type === "pointercancel") return;
    const now = performance.now();
    if (d.moved < 6 && now - d.t0 < 400) {
      this.tap(p.x, p.y, e.pointerType, now);
      return;
    }
    if (this.reducedMotion || d.samples.length < 2) return;
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const span = last.t - first.t;
    if (span < 8 || now - last.t > 60) return; // the hand had stopped before letting go
    const vx = (last.x - first.x) / span;
    const vy = (last.y - first.y) / span;
    if (Math.hypot(vx, vy) > 0.08) this.inertia = { vx, vy };
    this.invalidate();
  };

  private tap(x: number, y: number, pointerType: string, now: number): void {
    if (pointerType !== "mouse") {
      const prev = this.lastTap;
      if (now - prev.t < 320 && Math.hypot(x - prev.x, y - prev.y) < 32) {
        this.lastTap = { t: 0, x: 0, y: 0 };
        this.zoomBy(2, { x, y });
        return;
      }
      this.lastTap = { t: now, x, y };
      // a finger has no hover: a tap pins the building under it, or picks the neighbourhood;
      // a tap elsewhere lets either go
      const sight = this.sightUnder(x, y);
      this.setSightState(tap(this.sightState, sight));
      if (sight) {
        this.setHoveredHood(-1);
        return;
      }
      if (this.hoodLines && this.hoods.length > 0) {
        const hit = this.hoodUnder(x, y);
        this.setHoveredHood(hit === this.hoveredHood ? -1 : hit);
      }
    } else {
      // a click pins the building under the mouse (its sign stays, so its link can be reached)
      this.setSightState(press(this.sightState, this.sightUnder(x, y)));
    }
  }

  private readonly onPointerLeave = (e: PointerEvent): void => {
    this.hoverPoint = null;
    if (this.lastPointerType === "mouse") this.setHoveredHood(-1);
    // the mouse is gone, whatever pressed last (a touch-screen laptop has both)
    if (e.pointerType === "mouse") this.setSightState(leave(this.sightState));
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= this.view.height;
    dy = clamp(dy, -320, 320);
    if (dy === 0) return;
    // ctrlKey is how browsers report a trackpad pinch: small, precise steps
    const factor = Math.exp(-dy * (e.ctrlKey ? 0.011 : 0.0018));
    const notched = !e.ctrlKey && Math.abs(dy) >= 40;
    this.zoomBy(factor, this.local(e), notched);
  };

  private readonly onDoubleClick = (e: MouseEvent): void => {
    if (this.lastPointerType !== "mouse") return; // touch double-taps are handled in tap()
    e.preventDefault();
    this.zoomBy(e.shiftKey ? 0.5 : 2, this.local(e));
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onWindowResize = (): void => {
    // devicePixelRatio changes (browser zoom, moving between screens) don't trigger the observer
    this.measure();
    this.constrain();
    this.invalidate();
  };
}
