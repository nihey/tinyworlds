// "How a city is made": a few blocks of Pittsburgh built layer by layer by the pipeline's own
// renderer, then the whole city cut from its tiles. Feeds the HyperFrames project social-made/.
//
//   npm exec -- tsx scripts/social/made.ts stages     # the seven layers and the rise → social-made/assets/plates/
//   npm exec -- tsx scripts/social/made.ts verify     # the last layer against the real tiles, pixel by pixel
//   npm exec -- tsx scripts/social/made.ts pullback   # out to the whole city, cut from the tiles → assets/takes/pullback.mp4
//   npm exec -- tsx scripts/social/made.ts sfx        # copy the effects from the HyperFrames library
//   ELEVENLABS_API_KEY=… npm exec -- tsx scripts/social/made.ts sound   # compose the bed → assets/music/bed.mp3
//   SITE_URL=… npm exec -- tsx scripts/social/made.ts render           # → out/social/made/tinypit-made.mp4
//   npm exec -- tsx scripts/social/made.ts encode     # only encode the last render for posting again
//
// Nothing is redrawn. Each layer is `ChunkRenderer` (tinyworlds-pipeline/src/render/chunk.ts)
// drawing the real scene of tinypit with only some of its features: the job it is handed lists
// fewer ground polygons, lines, volumes and trees than the tile renderer's would, and two layers
// draw the volumes with their heights scaled (footprints, the rise) or without window patterns.
// The last layer is the whole job, so it is the finished tile (`verify` proves it).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CITIES } from "../../../tinyworlds-pipeline/src/cities/index.js";
import { binRect, type Rect } from "../../../tinyworlds-pipeline/src/render/bin.js";
import { ChunkRenderer, type ChunkJob } from "../../../tinyworlds-pipeline/src/render/chunk.js";
import { buildPalette, TRANSPARENT } from "../../../tinyworlds-pipeline/src/render/palette.js";
import { loadScene, type Scene } from "../../../tinyworlds-pipeline/src/render/scene.js";
import { F_FLOATING, G, Pattern, Roof } from "../../../tinyworlds-pipeline/src/scene/kinds.js";
import { between, easeInOut, openReel } from "../lib/film.js";
import { run } from "../lib/run.js";
import { siteAddress } from "../lib/site.js";
import { cutPlate, loadWorld, REPO, ROOT } from "../lib/world.js";

const WORLD = "tinypit";
const PROJECT = path.join(ROOT, "social-made");
const PLATES = path.join(PROJECT, "assets/plates");
const TAKES = path.join(PROJECT, "assets/takes");
const SCENE = path.join(REPO, "tinyworlds-pipeline/data", WORLD, "scene");
const FPS = 30;

/**
 * The build's framing, in map px of the north-up view. WIDE is the opening: the Point, both
 * rivers, the bridges and the North Shore at 2 map px a pixel. CLOSE is where the build ends,
 * at 1:1 on the park's trees and Gateway Center's towers. CLOSE lies inside WIDE, so one render of WIDE at full size serves the whole
 * push from one to the other. The composition (social-made/compositions/build.html) moves by
 * the same numbers.
 */
export const WIDE = { cx: 1302, cy: 195, shrink: 2 };
export const CLOSE = { cx: 1500, cy: -40, shrink: 1 };
/** The whole city, where the pull-back ends, 26 map px a pixel: the map in the top three quarters,
 *  the fog under it left for the end card. */
export const WHOLE = { cx: 5180, cy: 2400, shrink: 26 };
const RECT: Rect = { x0: WIDE.cx - 1920, y0: WIDE.cy - 1080, w: 3840, h: 2160 };

/** The rise: the heights layer in this many steps, each a height factor (ease-out). */
const RISE_STEPS = 18;
/** The pull-back's length, seconds. */
const PULLBACK_S = 7.2;

const PALETTE = buildPalette(CITIES[WORLD].colors).rgba;

function rgba(indices: Uint16Array): Uint8Array {
  const out = new Uint8Array(indices.length * 4);
  const px = new Uint32Array(out.buffer);
  for (let i = 0; i < indices.length; i++) px[i] = indices[i] === TRANSPARENT ? 0 : PALETTE[indices[i]];
  return out;
}

/** An array whose `push` keeps nothing: handed to the renderer as its tree scatter, no tree is planted. */
class NoTrees extends Array<number> {
  override push(): number {
    return this.length;
  }
}

/**
 * The scene with its volumes changed: `heights` scales every height (0 lays each footprint flat
 * on the ground, a pixel high), `windows: false` draws every wall plain.
 */
function variant(scene: Scene, opts: { heights?: number; windows?: boolean }): Scene {
  const v = scene.vol;
  const f = opts.heights ?? 1;
  const top = new Float32Array(v.top);
  const base = new Float32Array(v.base);
  const roofH = new Float32Array(v.roofH);
  const roofShape = new Uint8Array(v.roofShape);
  const pattern = opts.windows === false ? new Uint8Array(v.pattern.length).fill(Pattern.None) : v.pattern;
  for (let i = 0; i < v.count; i++) {
    if (f === 0) {
      base[i] = 0;
      top[i] = 1;
      roofH[i] = 0;
      if (roofShape[i] !== Roof.Deck) roofShape[i] = Roof.Flat;
    } else if (f !== 1) {
      base[i] *= f;
      top[i] *= f;
      roofH[i] *= f;
    }
  }
  return { ...scene, vol: { ...v, top, base, roofH, roofShape, pattern } };
}

function draw(scene: Scene, job: ChunkJob, trees: boolean): Uint16Array {
  const renderer = new ChunkRenderer(scene);
  if (!trees) (renderer as unknown as { scatter: number[] }).scatter = new NoTrees();
  return renderer.render(job);
}

async function save(name: string, indices: Uint16Array): Promise<void> {
  const file = path.join(PLATES, `${name}.webp`);
  await sharp(rgba(indices), { raw: { width: RECT.w, height: RECT.h, channels: 4 } })
    .flatten({ background: "#e9e6df" })
    .webp({ lossless: true, effort: 4 })
    .toFile(file);
  console.log(`${path.relative(ROOT, file)} ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}

async function stages(): Promise<void> {
  fs.mkdirSync(PLATES, { recursive: true });
  const { scene } = loadScene(SCENE);
  const full = binRect(scene, RECT);
  const none = new Uint32Array(0);
  const gk = scene.ground.kind;
  const water = new Set<number>([G.Water, G.Land, G.Lake, G.Pool]);
  const land = full.ground.filter((f) => water.has(gk[f]));
  const standing = full.vols.filter((v) => !(scene.vol.flags[v] & F_FLOATING));
  const decks = full.vols.filter((v) => (scene.vol.flags[v] & F_FLOATING) !== 0);
  const bare: ChunkJob = {
    ...full,
    ground: land,
    lines: none,
    vols: none,
    casters: none,
    trees: none,
    cables: none,
  };
  const flat = variant(scene, { heights: 0 });
  const plain = variant(scene, { windows: false });

  await save("s1-land", draw(scene, bare, false));
  await save("s2-landuse", draw(scene, { ...bare, ground: full.ground }, false));
  // the streets, and the bridges' decks laid flat across the water (they rise with the heights)
  const streets: ChunkJob = { ...bare, ground: full.ground, lines: full.lines };
  await save("s3-streets", draw(flat, { ...streets, vols: decks }, false));
  await save("s4-footprints", draw(flat, { ...streets, vols: full.vols }, false));
  const raised: ChunkJob = { ...streets, vols: full.vols };
  for (let i = 1; i <= RISE_STEPS; i++) {
    const u = i / RISE_STEPS;
    const f = 1 - (1 - u) ** 2.2;
    await save(
      `rise-${String(i).padStart(2, "0")}`,
      draw(variant(scene, { heights: f, windows: false }), raised, false),
    );
  }
  await save("s5-heights", draw(plain, raised, false));
  await save("s6-trees", draw(plain, { ...raised, trees: full.trees }, true));
  await save("s7-details", draw(scene, full, true));

  // what each layer holds in the frame, for its sign
  const k = scene.geo.k;
  let km = 0;
  const lx = scene.lines.xy;
  for (const f of full.lines) {
    for (let v = scene.lines.vertStart[f]; v + 1 < scene.lines.vertStart[f + 1]; v++) {
      const mx = (lx[v * 2] + lx[v * 2 + 2]) / 2;
      const my = (lx[v * 2 + 1] + lx[v * 2 + 3]) / 2;
      if (mx < RECT.x0 || my < RECT.y0 || mx >= RECT.x0 + RECT.w || my >= RECT.y0 + RECT.h) continue;
      const dx = lx[v * 2 + 2] - lx[v * 2];
      const dy = lx[v * 2 + 3] - lx[v * 2 + 1];
      km += Math.hypot((dx / 2 - dy) / k, (dx / 2 + dy) / k) / 1000;
    }
  }
  const seeds = new Set(standing.map((v) => scene.vol.seed[v]));
  const stats = {
    ground: full.ground.length,
    landPolygons: land.length,
    lines: full.lines.length,
    lineKm: Math.round(km * 10) / 10,
    volumes: full.vols.length,
    buildings: seeds.size,
    decks: full.vols.length - standing.length,
    mappedTrees: full.trees.length,
    cables: full.cables.length,
  };
  fs.writeFileSync(path.join(PLATES, "stats.json"), JSON.stringify(stats, null, 2));
  console.log(stats);
}

/** The finished layer against the tiles a visitor gets: how many pixels differ. */
async function verify(): Promise<void> {
  const world = loadWorld(WORLD);
  const tiles = await (
    await cutPlate(world, { cx: WIDE.cx, cy: WIDE.cy, width: RECT.w, height: RECT.h, shrink: 1 })
  )
    .removeAlpha()
    .raw()
    .toBuffer();
  const ours = await sharp(path.join(PLATES, "s7-details.webp")).removeAlpha().raw().toBuffer();
  let differ = 0;
  for (let i = 0; i < ours.length; i += 3)
    if (ours[i] !== tiles[i] || ours[i + 1] !== tiles[i + 1] || ours[i + 2] !== tiles[i + 2]) differ++;
  console.log(`s7-details vs the tiles: ${differ} of ${RECT.w * RECT.h} pixels differ`);
}

/** Out from the close framing to the whole city, a frame at a time, each cut from the tiles. */
async function pullback(): Promise<void> {
  fs.mkdirSync(TAKES, { recursive: true });
  const world = loadWorld(WORLD);
  const from = { x: CLOSE.cx, y: CLOSE.cy, scale: 1 / CLOSE.shrink };
  const to = { x: WHOLE.cx, y: WHOLE.cy, scale: 1 / WHOLE.shrink };
  const frames = Math.round(PULLBACK_S * FPS);
  const reel = openReel(path.join(TAKES, "pullback.mp4"), ROOT);
  for (let i = 0; i < frames; i++) {
    const cam = between(from, to, easeInOut(i / (frames - 1)));
    const plate = await cutPlate(world, {
      cx: cam.x,
      cy: cam.y,
      width: 1920,
      height: 1080,
      shrink: 1 / cam.scale,
    });
    await reel.write(await plate.png().toBuffer());
    if (i % 30 === 0) console.log(`pullback ${i}/${frames}`);
  }
  await reel.close();
  // the last frame as a still, for the end card to stand on
  const end = await cutPlate(world, {
    cx: WHOLE.cx,
    cy: WHOLE.cy,
    width: 1920,
    height: 1080,
    shrink: WHOLE.shrink,
  });
  await end.png().toFile(path.join(PLATES, "whole.png"));
  console.log(`pullback: ${frames} frames`);
}

function sfx(): void {
  const library = path.join(ROOT, "node_modules/hyperframes/dist/skills/media-use/audio/assets/sfx");
  const target = path.join(PROJECT, "assets/sfx");
  fs.mkdirSync(target, { recursive: true });
  for (const name of [
    "click-soft",
    "pop",
    "whoosh-short",
    "whoosh",
    "whoosh-cinematic",
    "riser",
    "impact-bass-1",
    "key-press",
  ])
    fs.copyFileSync(path.join(library, `${name}.mp3`), path.join(target, `${name}.mp3`));
  console.log("sfx copied");
}

/** The bed: ElevenLabs Music, from a description of its feel, never of anyone's music. */
async function sound(): Promise<void> {
  const key = (process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!key) throw new Error("Set ELEVENLABS_API_KEY to compose the bed");
  const prompt = [
    "Instrumental, exactly 100 BPM, 4/4, playful, curious and miniature, a toy-workshop feel, bright and clean.",
    "It starts at once, no fade-in, on a single plucked synth pattern with a soft kick on every beat.",
    "Every bar (2.4 seconds) one new layer joins, like building blocks stacked one by one:",
    "a round bass, then handclaps, then a marimba figure, then a bright bell melody with chiptune colour,",
    "then warm pads, then a counter-melody, so the arrangement grows bar by bar until about 19 seconds.",
    "From about 19 seconds it opens up wide and soaring for three bars,",
    "then from about 29 seconds it settles on the plucked pattern and holds one long warm chord to the end.",
    "No vocals, no spoken words, no sound effects.",
  ].join(" ");
  const response = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ prompt, music_length_ms: 36000, model_id: "music_v1", force_instrumental: true }),
  });
  if (!response.ok)
    throw new Error(`ElevenLabs answered ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const out = path.join(PROJECT, "assets/music", process.argv[3] ?? "bed.mp3");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await response.arrayBuffer()));
  console.log(`music: ${path.relative(ROOT, out)} ${(fs.statSync(out).size / 1000).toFixed(0)} kB`);
}

/**
 * Render with the address (never written in a file here), then encode it for a feed: H.264 in
 * yuv420p under a 20 Mb/s ceiling (a 34 s film stays under 100 MB), AAC, the index at the front.
 * `made.ts encode` does only the second half, on the last render.
 */
function render(): void {
  const address = siteAddress();
  if (!address) throw new Error("Set SITE_URL (or deploy/.env) for the end card's address");
  run(
    "npx",
    [
      "hyperframes", "render", "--quality", "delivery", "--crf", "14", "--fps", "30", "--workers", "2",
      "--video-frame-format", "png",
      "--variables", JSON.stringify({ address: `${address}/${WORLD}/` }),
      "--output", RAW,
    ], // prettier-ignore
    PROJECT,
  );
  encode();
}

const RAW = path.join(PROJECT, "renders/made.mp4");

function encode(): void {
  const out = path.join(ROOT, "out/social/made");
  fs.mkdirSync(out, { recursive: true });
  const audio = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_name", "-of", "csv=p=0", RAW],
    { encoding: "utf8" },
  ).stdout.trim();
  const file = path.join(out, `${WORLD}-made.mp4`);
  run(
    "ffmpeg",
    [
      "-v", "error", "-nostdin", "-y", "-i", RAW,
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-maxrate", "20M", "-bufsize", "40M",
      "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", "30", "-threads", "4",
      ...(audio === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "192k"]),
      "-movflags", "+faststart", file,
    ], // prettier-ignore
    PROJECT,
  );
  console.log(`made: ${path.relative(REPO, file)} ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
}

const step = process.argv[2];
if (step === "stages") await stages();
else if (step === "verify") await verify();
else if (step === "pullback") await pullback();
else if (step === "sfx") sfx();
else if (step === "sound") await sound();
else if (step === "render") render();
else if (step === "encode") encode();
else {
  console.error("made.ts stages | verify | pullback | sfx | sound | render | encode");
  process.exit(1);
}
