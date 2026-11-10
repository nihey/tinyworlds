import fs from "node:fs";
import path from "node:path";
import type { Browser, Page } from "puppeteer-core";
import sharp from "sharp";
import { GLYPH_ROWS, INK, drawText, hexRgb, textUnits } from "../../tinyworlds-pipeline/src/render/sign.js";
import {
  FPS,
  VIEW,
  between,
  chrome,
  clamp01,
  easeInOut,
  flight,
  jump,
  openReel,
  openStage,
  settle,
  shoot,
  tick,
  type Cam,
} from "./lib/film.js";
import { run } from "./lib/run.js";
import { siteAddress } from "./lib/site.js";
import { ROOT, loadWorld } from "./lib/world.js";

/**
 * "The known world": a tour of tinywesteros in one take, filmed from the real viewer, for
 * people who know the places. From Castle Black out along the Wall, down to Winterfell and
 * King's Landing, the Seven Kingdoms outlined and named by the viewer's own region lines,
 * across the Narrow Sea to Braavos, Valyria, Meereen and Asshai, and out to the whole map.
 *
 *   npm run westeros -- stills 0 2.9 10.5 …   look before filming: the take's picture at those seconds
 *   npm run westeros -- take --only 9 10.6     film those seconds only, to tour-part.mp4
 *   npm run westeros -- take       film the take (VIEWER_URL, a dev server started with
 *                                  NEXT_PUBLIC_WORLD=tinywesteros) → westeros/assets/takes/
 *   npm run westeros -- render [draft | looks | delivery]
 *                                  render the film → out/westeros/tinywesteros.mp4, and a
 *                                  lighter copy to post beside it
 *
 * The music is `npm run sound -- --for westeros`. Fan-made, like the map: the end card says so.
 */
const WORLD_ID = "tinywesteros";
const PROJECT = path.join(ROOT, "westeros");
const TAKES = path.join(PROJECT, "assets/takes");
const PLATES = path.join(PROJECT, "assets/plates");

/** The music's bar, seconds (80 BPM in four): a place per bar. The same numbers are in the composition. */
const BAR = 3;
/** How long the way from one place to the next takes; the rest of the bar is spent there. */
const FLY = 1.4;
/** While the view rests on a place it keeps closing in, this much by the end of the bar. */
const DRIFT = 0.035;

interface Stop {
  name: string;
  lon: number;
  lat: number;
  scale: number;
  /** metres the view is lifted, to centre something tall */
  rise?: number;
  /** the viewer's region lines come on this many seconds after the view sets off for the place */
  regions?: number;
  /** how many bars the place gets; one unless said */
  bars?: number;
}

/** The places, in the order of the journey: north to south, then east. */
const STOPS: Stop[] = [
  { name: "The Wall", lon: -0.014, lat: 0.0846, scale: 0.3 },
  { name: "Winterfell", lon: -0.014, lat: 0.062, scale: 0.72, rise: 12 },
  { name: "King's Landing", lon: 0, lat: 0, scale: 0.5, rise: 8 },
  // Westeros whole, from the Wall to Dorne, with the Narrow Sea and the near shore of Essos: as far
  // west as the view goes without showing the edge of the map
  // the lines wait for the music: its band comes in 12.6 s into the film, 3.6 s into this place
  { name: "The Seven Kingdoms", lon: 0.0207, lat: 0.0162, scale: 0.024, regions: 3.6, bars: 2 },
  { name: "Braavos", lon: 0.02, lat: 0.038, scale: 0.8 },
  { name: "Valyria", lon: 0.071, lat: -0.023, scale: 0.72, rise: 55 },
  { name: "Meereen", lon: 0.088, lat: -0.012, scale: 0.5, rise: 22 },
  { name: "Asshai", lon: 0.204, lat: -0.04, scale: 0.5, rise: 14 },
];
/** The opening is closer in, on Castle Black at the Wall's foot, and backs out to the first stop. */
const OPENING = { lon: -0.014, lat: 0.0838, scale: 1.05, rise: 10, seconds: 2.4 };
/** When the view sets off for each place (the first is simply where the film opens). */
const STARTS = STOPS.map((_, i) => STOPS.slice(0, i).reduce((sum, stop) => sum + (stop.bars ?? 1) * BAR, 0));
/** After the last place: out to the whole map, which then stands above the end card. */
const OUT = {
  at: STARTS[STOPS.length - 1] + (STOPS[STOPS.length - 1].bars ?? 1) * BAR,
  seconds: 2.8,
};
const END = OUT.at + 8;

/** The map's clock when the film starts: the ships are well out at sea by then. */
const MAP_CLOCK_START = 40_000;
/** Frames run before the first one kept, so the opening view has its tiles and they have faded in. */
const WARM_UP = 15;
/**
 * How many frames ahead the take asks for tiles. The viewer fades a tile in over 180 ms and
 * shows a blurred stand-in meanwhile, which is right for a visitor and wrong for a film that
 * crosses the map in a second: asked for nine frames early (300 ms), every tile is whole by
 * the time its frame is drawn.
 */
const AHEAD = 9;
/** How many tiles the viewer may keep while it is filmed (it keeps 48 to 200 for a visitor). */
const TILES_KEPT = 900;

interface Engine {
  projection: { toMap(lon: number, lat: number): { x: number; y: number } };
  setHoodLines(on: boolean): void;
  manifest: { bounds: { minX: number; minY: number; maxX: number; maxY: number }; geo: { kz: number } };
}
type Viewer = Window & { tinyworld: Engine };

/** The viewer, ready to be filmed, and the take's plan: where the view is at each moment. */
async function stage(): Promise<{
  browser: Browser;
  page: Page;
  camAt(t: number): Cam;
  regionsAt(t: number): boolean;
}> {
  const url = process.env.VIEWER_URL ?? "http://localhost:3000/";
  const { browser, page } = await openStage(url, MAP_CLOCK_START - (WARM_UP * 1000) / FPS);
  const places = [OPENING, ...STOPS];
  const world = await page.evaluate(
    (spots) => {
      const engine = (window as unknown as Viewer).tinyworld;
      return {
        at: spots.map(([lon, lat]) => engine.projection.toMap(lon, lat)),
        bounds: engine.manifest.bounds,
        kz: engine.manifest.geo.kz,
      };
    },
    places.map((p) => [p.lon, p.lat]),
  );
  const view = (i: number): Cam => ({
    x: world.at[i].x,
    y: world.at[i].y - (places[i].rise ?? 0) * world.kz,
    scale: places[i].scale,
  });
  const opening = view(0);
  const stops = STOPS.map((_, i) => view(i + 1));
  // the whole map, set high: the band under it is where the end card stands
  const b = world.bounds;
  const whole: Cam = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 + 7100, scale: 0.0112 };

  /** Which place the film is on its way to, or at, at a moment before the way out. */
  const stopAt = (t: number): number => {
    let i = STOPS.length - 1;
    while (i > 0 && t < STARTS[i]) i--;
    return i;
  };
  /** A place as the view leaves it: a little closer than it arrived. */
  const rested = (stop: Cam): Cam => ({ ...stop, scale: stop.scale * (1 + DRIFT) });
  const ways = stops.slice(1).map((to, i) => flight(rested(stops[i]), to));
  const camAt = (t: number): Cam => {
    if (t >= OUT.at)
      return between(rested(stops[stops.length - 1]), whole, easeInOut(clamp01((t - OUT.at) / OUT.seconds)));
    const i = stopAt(t);
    const into = t - STARTS[i];
    const stay = (STOPS[i].bars ?? 1) * BAR;
    // the way there (for the first place, out from Castle Black), then a slow closing-in
    const way = i === 0 ? OPENING.seconds : FLY;
    if (into < way)
      return i === 0 ? between(opening, stops[0], easeInOut(into / way)) : ways[i - 1](into / way);
    return { ...stops[i], scale: stops[i].scale * (1 + (DRIFT * (into - way)) / (stay - way)) };
  };
  /** Whether the viewer's region lines are on: while resting on a stop that asks, and at the end. */
  const regionsAt = (t: number): boolean => {
    if (t >= OUT.at) return t >= OUT.at + OUT.seconds - 0.2;
    const i = stopAt(t);
    const after = STOPS[i].regions;
    return after !== undefined && t - STARTS[i] >= after;
  };

  await chrome(page, 0);
  // The viewer keeps only a few screens' worth of tiles, which suits a visitor: a flight across
  // the map needs each frame's tiles kept from when they were asked for (AHEAD) until they are
  // drawn, and every frame of it needs different ones.
  await page.evaluate((keep) => {
    (window as unknown as { tinyworld: { maxTiles: number } }).tinyworld.maxTiles = keep;
  }, TILES_KEPT);
  // the pointer stays off the map: the viewer lights whatever region it is over
  await page.mouse.move(VIEW.width + 400, VIEW.height + 400);
  return { browser, page, camAt, regionsAt };
}

/** `part`: film only those seconds (from, to), to tour-part.mp4, to look at a passage without the wait. */
async function take(part?: [number, number]): Promise<void> {
  const { browser, page, camAt, regionsAt } = await stage();
  const total = Math.round(END * FPS);
  const first = part ? Math.round(part[0] * FPS) : 0;
  const last = part ? Math.min(total, Math.round(part[1] * FPS)) : total;
  const name = part ? "tour-part.mp4" : "tour.mp4";
  fs.mkdirSync(TAKES, { recursive: true });
  const reel = openReel(path.join(TAKES, name), ROOT);
  /** Have the viewer load what a coming frame's picture will need, without filming it. */
  const lookAhead = async (frame: number): Promise<void> => {
    if (frame >= total) return;
    await jump(page, camAt(frame / FPS));
    await settle(page);
  };
  for (let i = 0; i < WARM_UP; i++) {
    await tick(page);
    await lookAhead(first + Math.min(i, AHEAD));
  }
  let lines = false;
  for (let f = first; f < last; f++) {
    const t = f / FPS;
    await tick(page);
    await lookAhead(f + AHEAD);
    await jump(page, camAt(t));
    if (regionsAt(t) !== lines) {
      lines = regionsAt(t);
      await page.evaluate((on) => (window as unknown as Viewer).tinyworld.setHoodLines(on), lines);
    }
    await settle(page);
    await reel.write(await shoot(page));
    if (f % 90 === 0) console.log(`take: tour ${f}/${total}`);
  }
  await reel.close();
  await browser.close();
  if (part) {
    console.log(`take: westeros/assets/takes/${name}, frames ${first} to ${last}`);
    return;
  }
  fs.writeFileSync(
    path.join(TAKES, "tour.json"),
    JSON.stringify(
      {
        fps: FPS,
        frames: total,
        bar: BAR,
        fly: FLY,
        stops: STOPS.map((stop, i) => ({
          name: stop.name,
          arrives: i === 0 ? 0 : STARTS[i] + FLY,
          leaves: STARTS[i] + (stop.bars ?? 1) * BAR,
        })),
        whole: OUT.at + OUT.seconds,
        end: END,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`take: westeros/assets/takes/tour.mp4, ${total} frames (${(total / FPS).toFixed(2)} s)`);
}

/** Look before filming: the take's picture at the given seconds, as stills in out/westeros/stills/. */
async function stills(seconds: number[]): Promise<void> {
  const { browser, page, camAt, regionsAt } = await stage();
  const out = path.join(ROOT, "out/westeros/stills");
  fs.mkdirSync(out, { recursive: true });
  for (const t of seconds) {
    await page.evaluate((on) => (window as unknown as Viewer).tinyworld.setHoodLines(on), regionsAt(t));
    await jump(page, camAt(t));
    // a few frames, so the tiles this view asks for have faded in
    for (let i = 0; i < 10; i++) {
      await tick(page);
      await settle(page);
    }
    fs.writeFileSync(path.join(out, `${t.toFixed(2)}.png`), await shoot(page));
  }
  await browser.close();
  console.log(`stills: ${seconds.length} in out/westeros/stills/`);
}

/** The world's name in the pixel face, on nothing: the end card sets it on its own sign. */
async function wordmark(): Promise<void> {
  const unit = 8;
  const accent = hexRgb(loadWorld(WORLD_ID).accent);
  const width = textUnits(WORLD_ID) * unit;
  const height = GLYPH_ROWS * unit;
  const rgba = new Uint8Array(width * height * 4);
  drawText(
    (x, y, c) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      rgba.set([c[0], c[1], c[2], 255], (y * width + x) * 4);
    },
    WORLD_ID,
    0,
    0,
    unit,
    (i) => (i < 4 ? INK : accent),
  );
  fs.mkdirSync(PLATES, { recursive: true });
  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(path.join(PLATES, "wordmark.png"));
}

/** Render the film, and a copy light enough to post. The address is given here, never written in the source. */
async function render(quality: string): Promise<void> {
  await wordmark();
  const address = siteAddress();
  const out = path.join(ROOT, "out/westeros");
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, "tinywesteros.mp4");
  run(
    "npx",
    [
      "hyperframes", "render", "--quality", quality, "--output", file,
      ...(address ? ["--variables", JSON.stringify({ address: `${address}/${WORLD_ID}` })] : []),
    ], // prettier-ignore
    PROJECT,
  );
  if (!address)
    console.warn("westeros: no site address known (SITE_URL or deploy/.env): the end card says example.com");
  console.log(`westeros: ${path.relative(ROOT, file)} ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
  const web = path.join(out, "tinywesteros-web.mp4");
  run(
    "ffmpeg",
    [
      "-v", "error", "-y", "-i", file,
      "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-af", "volume=-0.6dB", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", web,
    ], // prettier-ignore
    out,
  );
  console.log(`westeros: ${path.relative(ROOT, web)} ${(fs.statSync(web).size / 1e6).toFixed(1)} MB`);
}

const what = process.argv[2];
if (what === "take") {
  const only = process.argv.indexOf("--only");
  await take(only >= 0 ? [Number(process.argv[only + 1]), Number(process.argv[only + 2])] : undefined);
} else if (what === "stills") await stills(process.argv.slice(3).map(Number));
else if (what === "render") await render(process.argv[3] ?? "delivery");
else if (what === "wordmark") await wordmark();
else {
  console.error("usage: npm run westeros -- take | stills <seconds…> | render [draft | looks | delivery]");
  process.exit(2);
}
