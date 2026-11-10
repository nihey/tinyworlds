import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import sharp from "sharp";
import { CHUNK_TILES, CITY, DIRS, TILE } from "../config.js";
import { makeProjection } from "../projection.js";
import { fogRange, orderJob } from "./bin.js";
import { PAD, SUN_DROP, type ChunkJob } from "./chunk.js";
import { packBits } from "./pyramid.js";
import { loadScene, type Scene } from "./scene.js";
import type { WorkerReply, WorkerRequest } from "./worker.js";

export interface RenderOptions {
  out?: string;
  workers?: number;
  /** Only redraw blocks within `radius` metres of this lon,lat (the rest of the tiles are kept). */
  around?: { lon: number; lat: number; radius: number };
  /** Keep level 0 as it is on disk and rebuild only the coarser levels, minimap and manifest. */
  pyramidOnly?: boolean;
  log?: (msg: string) => void;
}

interface Grid {
  ox: number;
  oy: number;
  /** Level-0 tiles across and down. */
  cols: number;
  rows: number;
  /** Blocks (CHUNK_TILES × CHUNK_TILES tiles) across and down. */
  ccols: number;
  crows: number;
  chunk: number;
}

function makeGrid(scene: Scene): Grid {
  const chunk = TILE * CHUNK_TILES;
  const { minX, minY, maxX, maxY } = scene.bounds;
  const ox = Math.floor(minX / chunk) * chunk;
  const oy = Math.floor(minY / chunk) * chunk;
  const ccols = Math.ceil((maxX - ox) / chunk);
  const crows = Math.ceil((maxY - oy) / chunk);
  return { ox, oy, cols: ccols * CHUNK_TILES, rows: crows * CHUNK_TILES, ccols, crows, chunk };
}

/** Sort every feature into the blocks that need it. */
function binAll(scene: Scene, grid: Grid, wanted: Uint8Array): (ChunkJob | null)[] {
  const { ox, oy, ccols, crows, chunk } = grid;
  const n = ccols * crows;
  const k = scene.geo.k;
  const lists = (): number[][] => Array.from({ length: n }, () => []);
  const ground = lists();
  const lines = lists();
  const vols = lists();
  const casters = lists();
  const trees = lists();
  const cables = lists();
  const marginDown = new Float32Array(n);
  const marginLeft = new Float32Array(n);

  const span = (lo: number, hi: number, origin: number, count: number): [number, number] => [
    Math.max(0, Math.floor((lo - origin) / chunk)),
    Math.min(count - 1, Math.floor((hi - origin) / chunk)),
  ];
  const each = (
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    fn: (c: number, cx: number, cy: number) => void,
  ): void => {
    const [cx0, cx1] = span(minX, maxX, ox, ccols);
    const [cy0, cy1] = span(minY, maxY, oy, crows);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) if (wanted[cy * ccols + cx]) fn(cy * ccols + cx, cx, cy);
  };

  const gb = scene.ground.bbox;
  for (let f = 0; f < scene.ground.count; f++) {
    each(gb[f * 4] - PAD, gb[f * 4 + 1] - PAD, gb[f * 4 + 2] + PAD, gb[f * 4 + 3] + PAD, (c) =>
      ground[c].push(f),
    );
  }
  const lb = scene.lines.bbox;
  for (let f = 0; f < scene.lines.count; f++) {
    const m = PAD + scene.lines.width[f] * k;
    each(lb[f * 4] - m, lb[f * 4 + 1] - m, lb[f * 4 + 2] + m, lb[f * 4 + 3] + m, (c) => lines[c].push(f));
  }

  const vb = scene.vol.bbox;
  let tallest = 0;
  for (let v = 0; v < scene.vol.count; v++) {
    const rise = scene.vol.top[v] + scene.vol.roofH[v] + 2;
    if (rise > tallest) tallest = rise;
    const maxY = vb[v * 4 + 3];
    each(vb[v * 4] - 4, vb[v * 4 + 1] - rise - 4, vb[v * 4 + 2] + 4, maxY + 4, (c, _cx, cy) => {
      vols[c].push(v);
      // how far below the block this volume's visible surfaces stand
      const below = Math.min(rise, maxY - (oy + (cy + 1) * chunk));
      if (below > marginDown[c]) marginDown[c] = below;
    });
  }
  for (let v = 0; v < scene.vol.count; v++) {
    const rise = scene.vol.top[v] + scene.vol.roofH[v];
    const reach = rise / SUN_DROP + 2;
    const minX = vb[v * 4];
    const minY = vb[v * 4 + 1];
    const maxY = vb[v * 4 + 3];
    each(minX - 4, minY - tallest - 4, vb[v * 4 + 2] + reach + 4, maxY + 4, (c, cx, cy) => {
      const y0 = oy + cy * chunk;
      if (minY > y0 + chunk + marginDown[c] + 4) return;
      casters[c].push(v);
      const left = ox + cx * chunk - minX;
      if (left > marginLeft[c]) marginLeft[c] = left;
    });
  }

  const txy = scene.trees.xy;
  for (let t = 0; t < scene.trees.count; t++) {
    each(txy[t * 2] - PAD, txy[t * 2 + 1] - PAD, txy[t * 2] + PAD, txy[t * 2 + 1] + PAD, (c) =>
      trees[c].push(t),
    );
  }

  const cb = scene.cab.bbox;
  for (let c = 0; c < scene.cab.count; c++) {
    each(cb[c * 4] - 2, cb[c * 4 + 1] - 2, cb[c * 4 + 2] + 2, cb[c * 4 + 3] + 2, (chunkIndex) =>
      cables[chunkIndex].push(c),
    );
  }

  const jobs: (ChunkJob | null)[] = [];
  for (let c = 0; c < n; c++) {
    if (!wanted[c]) {
      jobs.push(null);
      continue;
    }
    const x0 = ox + (c % ccols) * chunk;
    const y0 = oy + Math.floor(c / ccols) * chunk;
    const rect = { x0, y0, w: chunk, h: chunk };
    const range = fogRange(scene, rect, marginDown[c]);
    jobs.push({
      ...rect,
      ...orderJob(scene, ground[c], lines[c]),
      vols: Uint32Array.from(vols[c]),
      casters: Uint32Array.from(casters[c]),
      trees: Uint32Array.from(trees[c]),
      cables: Uint32Array.from(cables[c]),
      marginLeft: marginLeft[c],
      marginDown: marginDown[c],
      foggy: range.max > scene.fog.start - 300,
    });
  }
  return jobs;
}

/** A fixed pool of render threads fed from a queue. */
class Pool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly queue: {
    req: WorkerRequest;
    transfer: ArrayBuffer[];
    resolve: (r: WorkerReply) => void;
  }[] = [];
  private readonly pending = new Map<number, (r: WorkerReply) => void>();

  constructor(size: number, workerData: unknown) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL("./worker.js", import.meta.url), { workerData });
      worker.on("message", (reply: WorkerReply) => {
        this.pending.get(reply.id)?.(reply);
        this.pending.delete(reply.id);
        this.idle.push(worker);
        this.pump();
      });
      worker.on("error", (err) => {
        console.error("render worker crashed:", err);
        process.exit(1);
      });
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }
  run(req: WorkerRequest, transfer: ArrayBuffer[] = []): Promise<WorkerReply> {
    return new Promise((resolve) => {
      this.queue.push({ req, transfer, resolve });
      this.pump();
    });
  }
  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop()!;
      const { req, transfer, resolve } = this.queue.shift()!;
      this.pending.set(req.id, resolve);
      worker.postMessage(req, transfer);
    }
  }
  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

/** Which tiles of a level exist on disk. */
function scanLevel(out: string, z: number): Set<string> {
  const dir = path.join(out, "tiles", String(z));
  if (!fs.existsSync(dir)) return new Set();
  return new Set(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".webp"))
      .map((f) => f.slice(0, -5)),
  );
}

export async function renderAll(opts: RenderOptions = {}): Promise<void> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const out = path.resolve(opts.out ?? DIRS.out);
  const { scene, data } = loadScene(DIRS.scene);
  const grid = makeGrid(scene);
  const proj = makeProjection(scene.geo);
  const levels = Math.ceil(Math.log2(Math.max(grid.cols, grid.rows))) + 1;
  for (let z = 0; z < levels; z++) fs.mkdirSync(path.join(out, "tiles", String(z)), { recursive: true });

  // ---- which blocks to draw: those the fog leaves something of, optionally near one point
  const wanted = new Uint8Array(grid.ccols * grid.crows);
  let around: { x: number; y: number; r: number } | null = null;
  if (opts.around) {
    const [x, y] = proj.toMap(opts.around.lon, opts.around.lat);
    around = { x, y, r: opts.around.radius * proj.pxPerMetre };
  }
  let count = 0;
  for (let cy = 0; cy < grid.crows; cy++) {
    for (let cx = 0; cx < grid.ccols; cx++) {
      const rect = {
        x0: grid.ox + cx * grid.chunk,
        y0: grid.oy + cy * grid.chunk,
        w: grid.chunk,
        h: grid.chunk,
      };
      // tall things stand below the block they show in, so look a little further down
      if (fogRange(scene, rect, 1600).min > scene.fog.end + 500) continue;
      if (around) {
        const dx = Math.max(rect.x0 - around.x, 0, around.x - (rect.x0 + rect.w));
        const dy = Math.max(rect.y0 - around.y, 0, around.y - (rect.y0 + rect.h));
        if (Math.hypot(dx, dy) > around.r) continue;
      }
      wanted[cy * grid.ccols + cx] = 1;
      count++;
    }
  }
  let started = Date.now();
  if (opts.pyramidOnly) wanted.fill(0);
  const jobs = binAll(scene, grid, wanted);
  if (opts.pyramidOnly) count = 0;
  log(
    `render: ${count} blocks of ${grid.ccols * grid.crows} to draw, binned in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );

  const size = opts.workers ?? Math.max(1, Math.min(os.availableParallelism() - 2, 16));
  const pool = new Pool(size, { data, out });
  let id = 0;

  // ---- level 0
  started = Date.now();
  let done = 0;
  let bytes = 0;
  let tiles = 0;
  const dirty = new Set<string>();
  await Promise.all(
    jobs.map(async (job, c) => {
      if (!job) return;
      const tx0 = (c % grid.ccols) * CHUNK_TILES;
      const ty0 = Math.floor(c / grid.ccols) * CHUNK_TILES;
      const transfer = [
        job.ground.buffer,
        job.lines.buffer,
        job.vols.buffer,
        job.casters.buffer,
        job.trees.buffer,
        job.cables.buffer,
      ] as ArrayBuffer[];
      const reply = await pool.run({ type: "chunk", id: id++, job, tile: TILE, tx0, ty0 }, transfer);
      bytes += reply.bytes;
      tiles += reply.written.length;
      for (let ty = ty0; ty < ty0 + CHUNK_TILES; ty++)
        for (let tx = tx0; tx < tx0 + CHUNK_TILES; tx++) dirty.add(`${tx >> 1}_${ty >> 1}`);
      done++;
      if (done % 50 === 0 || done === count) {
        const secs = (Date.now() - started) / 1000;
        log(
          `render: ${done}/${count} blocks, ${tiles} tiles, ${(bytes / 1e6).toFixed(0)} MB, ${secs.toFixed(0)} s`,
        );
      }
    }),
  );

  if (opts.pyramidOnly) {
    for (const key of scanLevel(out, 0)) {
      const [tx, ty] = key.split("_").map(Number);
      dirty.add(`${tx >> 1}_${ty >> 1}`);
    }
  }

  // ---- coarser levels, each built from the one below
  const manifestLevels: { z: number; cols: number; rows: number; tiles: string }[] = [];
  let have = scanLevel(out, 0);
  manifestLevels.push({
    z: 0,
    cols: grid.cols,
    rows: grid.rows,
    tiles: packBits((tx, ty) => have.has(`${tx}_${ty}`), grid.cols, grid.rows),
  });
  let parents = dirty;
  for (let z = 1; z < levels; z++) {
    started = Date.now();
    const cols = Math.ceil(grid.cols / 2 ** z);
    const rows = Math.ceil(grid.rows / 2 ** z);
    const next = new Set<string>();
    let levelBytes = 0;
    await Promise.all(
      [...parents].map(async (key) => {
        const [tx, ty] = key.split("_").map(Number);
        const reply = await pool.run({ type: "parent", id: id++, z, tx, ty, tile: TILE, lossy: true });
        levelBytes += reply.bytes;
        next.add(`${tx >> 1}_${ty >> 1}`);
      }),
    );
    have = scanLevel(out, z);
    manifestLevels.push({ z, cols, rows, tiles: packBits((tx, ty) => have.has(`${tx}_${ty}`), cols, rows) });
    log(
      `render: level ${z}: ${parents.size} tiles rebuilt, ${have.size} in all, ${(levelBytes / 1e6).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(1)} s`,
    );
    parents = next;
  }
  await pool.close();

  // ---- the minimap: the level at which the whole map is about a thousand px wide, stitched
  const { minX, minY, maxX, maxY } = scene.bounds;
  let oz = 0;
  while ((maxX - minX) / 2 ** oz > 1400 && oz < levels - 1) oz++;
  const scale = 2 ** oz;
  const ocols = Math.ceil(grid.cols / scale);
  const orows = Math.ceil(grid.rows / scale);
  const composites: { input: string; left: number; top: number }[] = [];
  for (const key of scanLevel(out, oz)) {
    const [tx, ty] = key.split("_").map(Number);
    composites.push({
      input: path.join(out, "tiles", String(oz), `${key}.webp`),
      left: tx * TILE,
      top: ty * TILE,
    });
  }
  const crop = {
    left: Math.floor((minX - grid.ox) / scale),
    top: Math.floor((minY - grid.oy) / scale),
    width: Math.ceil((maxX - minX) / scale),
    height: Math.ceil((maxY - minY) / scale),
  };
  const stitched = await sharp({
    create: {
      width: ocols * TILE,
      height: orows * TILE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
  await sharp(stitched)
    .extract(crop)
    .webp({ quality: 86, alphaQuality: 100 })
    .toFile(path.join(out, "overview.webp"));

  // ---- manifest
  const manifest = {
    name: CITY.id,
    build: Date.now().toString(36),
    tileSize: TILE,
    origin: { x: grid.ox, y: grid.oy },
    levels: manifestLevels,
    bounds: scene.bounds,
    start: CITY.start,
    maxScale: CITY.maxScale,
    northDeg: Math.round(proj.northDeg * 10) / 10,
    geo: scene.geo,
    overview: { src: "overview.webp", width: crop.width, height: crop.height },
    attribution: CITY.attribution,
  };
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest));
  log(`render: manifest written, ${levels} levels, minimap ${crop.width}×${crop.height} from level ${oz}`);
}
