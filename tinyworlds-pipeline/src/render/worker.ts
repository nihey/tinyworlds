import fs from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import sharp from "sharp";
import { ChunkRenderer, type ChunkJob } from "./chunk.js";
import { toRgba } from "./encode.js";
import { halve } from "./pyramid.js";
import { sceneFrom, type SceneData } from "./scene.js";

/**
 * One render thread. It shares the scene's memory with the main thread and takes two kinds of
 * work: draw a block of level-0 tiles, or build one tile of a coarser level from its four children.
 */
export type WorkerRequest =
  | { type: "chunk"; id: number; job: ChunkJob; tile: number; tx0: number; ty0: number }
  | { type: "parent"; id: number; z: number; tx: number; ty: number; tile: number; lossy: boolean };

export interface WorkerReply {
  id: number;
  written: [number, number][];
  bytes: number;
  ms: number;
}

const { data, out } = workerData as { data: SceneData; out: string };
const renderer = new ChunkRenderer(sceneFrom(data));
sharp.concurrency(1);

const tilePath = (z: number, tx: number, ty: number): string =>
  path.join(out, "tiles", String(z), `${tx}_${ty}.webp`);

async function renderChunk(req: Extract<WorkerRequest, { type: "chunk" }>): Promise<WorkerReply> {
  const started = Date.now();
  const { job, tile } = req;
  const indices = renderer.render(job);
  const written: [number, number][] = [];
  let bytes = 0;
  const part = new Uint16Array(tile * tile);
  const rgba = new Uint8Array(tile * tile * 4);
  for (let ty = 0; ty < job.h / tile; ty++) {
    for (let tx = 0; tx < job.w / tile; tx++) {
      for (let y = 0; y < tile; y++) {
        const from = (ty * tile + y) * job.w + tx * tile;
        part.set(indices.subarray(from, from + tile), y * tile);
      }
      const file = tilePath(0, req.tx0 + tx, req.ty0 + ty);
      if (!toRgba(part, rgba)) {
        fs.rmSync(file, { force: true });
        continue;
      }
      const info = await sharp(rgba, { raw: { width: tile, height: tile, channels: 4 } })
        .webp({ lossless: true, effort: 4 })
        .toFile(file);
      bytes += info.size;
      written.push([req.tx0 + tx, req.ty0 + ty]);
    }
  }
  return { id: req.id, written, bytes, ms: Date.now() - started };
}

async function buildParent(req: Extract<WorkerRequest, { type: "parent" }>): Promise<WorkerReply> {
  const started = Date.now();
  const { z, tx, ty, tile } = req;
  const big = new Uint8Array(tile * 2 * tile * 2 * 4);
  let any = false;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const file = tilePath(z - 1, tx * 2 + dx, ty * 2 + dy);
      if (!fs.existsSync(file)) continue;
      const child = await sharp(file).ensureAlpha().raw().toBuffer();
      for (let y = 0; y < tile; y++) {
        big.set(
          child.subarray(y * tile * 4, (y + 1) * tile * 4),
          ((dy * tile + y) * tile * 2 + dx * tile) * 4,
        );
      }
      any = true;
    }
  }
  const file = tilePath(z, tx, ty);
  const small = any ? halve(big, tile * 2, tile * 2) : null;
  let drawn = false;
  if (small)
    for (let i = 3; i < small.length; i += 4)
      if (small[i] !== 0) {
        drawn = true;
        break;
      }
  if (!small || !drawn) {
    fs.rmSync(file, { force: true });
    return { id: req.id, written: [], bytes: 0, ms: Date.now() - started };
  }
  const image = sharp(small, { raw: { width: tile, height: tile, channels: 4 } });
  const info = await (
    req.lossy
      ? image.webp({ quality: 76, alphaQuality: 100, effort: 4 })
      : image.webp({ lossless: true, effort: 4 })
  ).toFile(file);
  return { id: req.id, written: [[tx, ty]], bytes: info.size, ms: Date.now() - started };
}

parentPort!.on("message", (req: WorkerRequest) => {
  const work = req.type === "chunk" ? renderChunk(req) : buildParent(req);
  work.then(
    (reply) => parentPort!.postMessage(reply),
    (err: unknown) => {
      console.error(`worker failed on ${req.type} ${req.id}:`, err);
      process.exit(1);
    },
  );
});
