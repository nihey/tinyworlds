#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import sharp from "sharp";
import { CITIES } from "./cities/index.js";
import { CITY, DIRS } from "./config.js";
import { buildIndex } from "./index/build.js";
import { makeProjection } from "./projection.js";
import { binRect } from "./render/bin.js";
import { renderCard } from "./render/card.js";
import { ChunkRenderer } from "./render/chunk.js";
import { toRgba, writePng } from "./render/encode.js";
import { renderAll } from "./render/run.js";
import { loadScene } from "./render/scene.js";
import { buildScene } from "./scene/build.js";
import { fetchAll } from "./sources/index.js";

const program = new Command();
program
  .name("tinyworlds")
  .description("Open data in, an isometric pixel-art city out.")
  // read in config.ts before anything else runs; declared here so it is accepted and documented
  .option("-c, --city <id>", `which city to draw: ${Object.keys(CITIES).join(" | ")}`, CITY.id);

program
  .command("fetch")
  .description("Download the raw open data (skips files that are already there)")
  .option("--force", "download again even if the file exists", false)
  .option("--only <source>", `just one source: ${CITY.sources.map((s) => s.name).join(" | ")}`)
  .action(async (opts: { force: boolean; only?: string }) => {
    await fetchAll(opts);
  });

program
  .command("scene")
  .description("Turn the raw data into a scene: projected geometry, building styles, fog")
  .action(async () => {
    await buildScene();
  });

program
  .command("preview")
  .description("Render one rectangle to a PNG, centred on a lon,lat")
  .requiredOption("--at <lon,lat>", "centre of the picture")
  .option("--size <w,h>", "picture size in px", "1536,1024")
  .option("--out <file>", "where to write it", "preview.png")
  .option("--zoom <n>", "enlarge the result n times, pixels kept square", "1")
  .option("--shrink <n>", "draw n times the area and average it down: how it looks zoomed out", "1")
  .action(async (opts: { at: string; size: string; out: string; zoom: string; shrink: string }) => {
    const [lon, lat] = opts.at.split(",").map(Number);
    const shrink = Math.max(1, Math.round(Number(opts.shrink)));
    const [w, h] = opts.size.split(",").map((v) => Number(v) * shrink);
    const { scene } = loadScene(DIRS.scene);
    const [cx, cy] = makeProjection(scene.geo).toMap(lon, lat);
    const rect = { x0: Math.round(cx - w / 2), y0: Math.round(cy - h / 2), w, h };
    let t = Date.now();
    const job = binRect(scene, rect);
    const binMs = Date.now() - t;
    t = Date.now();
    const indices = new ChunkRenderer(scene).render(job);
    const renderMs = Date.now() - t;
    const rgba = toRgba(indices);
    if (!rgba) return console.log("nothing there: the rectangle is entirely in the fog");
    if (shrink > 1) {
      await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
        .flatten({ background: "#e9e6df" })
        .resize(w / shrink, h / shrink, { kernel: "lanczos3" })
        .png()
        .toFile(path.resolve(opts.out));
    } else await writePng(path.resolve(opts.out), rgba, w, h, Number(opts.zoom));
    console.log(
      `${opts.out}: ${job.vols.length} volumes, ${job.casters.length} casters, ${job.trees.length} trees, ` +
        `margins ${Math.round(job.marginLeft)}/${Math.round(job.marginDown)} px, bin ${binMs} ms, render ${renderMs} ms`,
    );
  });

program
  .command("render")
  .description("Draw the tiles, the zoom pyramid, the minimap and the manifest")
  .option("--out <dir>", "output directory (default: the frontend's public/data)")
  .option("--workers <n>", "render threads")
  .option("--around <lon,lat,metres>", "only redraw near a point; other tiles are kept")
  .option(
    "--pyramid-only",
    "keep the full-size tiles; rebuild the coarser levels, minimap and manifest",
    false,
  )
  .action(async (opts: { out?: string; workers?: string; around?: string; pyramidOnly: boolean }) => {
    const a = opts.around?.split(",").map(Number);
    await renderAll({
      out: opts.out,
      workers: opts.workers ? Number(opts.workers) : undefined,
      around: a ? { lon: a[0], lat: a[1], radius: a[2] } : undefined,
      pyramidOnly: opts.pyramidOnly,
    });
  });

program
  .command("index")
  .description("Write the search index, neighbourhood outlines and life routes")
  .option("--out <dir>", "output directory (default: the frontend's public/data)")
  .action(async (opts: { out?: string }) => {
    await buildIndex({ out: opts.out });
  });

program
  .command("card")
  .description("Render the share card (the Open Graph image) into the frontend's public/og")
  .option("--out <file>", "where to write it (default: ../tinyworlds-frontend/public/og/<city>.jpg)")
  .action(async (opts: { out?: string }) => {
    await renderCard({ out: opts.out });
  });

program
  .command("all")
  .description("fetch, scene, render and index, in order")
  .action(async () => {
    await fetchAll({ force: false });
    await buildScene();
    await renderAll();
    await buildIndex();
  });

await program.parseAsync();
