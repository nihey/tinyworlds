// Midday to midnight, as a loop: one downtown from a fixed camera while the viewer's own
// six-minute day (tinyworlds-frontend/src/map/daylight.ts) plays through once, compressed, and
// comes back to its first frame. Filmed on the live site (lib/live.ts).
//
//   npm exec -- tsx scripts/social/daynight.ts stills <world:lat,lon,scale[,rise]> …
//       a look at each framing at four times of day → out/social/daynight/stills/
//   npm exec -- tsx scripts/social/daynight.ts take <world:lat,lon,scale[,rise]> [--seconds 18]
//       [--start 0.12] [--weather snow] [--name loop]
//       the loop's frames → social-daynight/assets/takes/<name>.mp4 (all-intra), seconds + a
//       crossfade's worth more (see `xfade` below)
//
// Only the day's clock is sped up. The viewer reads the time of day from performance.now()
// inside a timer it sets every 500 ms (watchCityLight); that one timer is run every frame here
// and, while it runs, performance.now() answers the loop's time of day. Everything else (the
// tiles fading in, the rain and snow) keeps the film's own clock, so the weather falls at its
// real speed. Life (ferries, flights) is off: a ferry would jump at the loop's seam.
import fs from "node:fs";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { FPS, chrome, jump, openReel, settle, shoot, sleep, tick, type Cam } from "../lib/film.js";
import { LANDSCAPE, openLive, type LivePrefs } from "../lib/live.js";
import { run } from "../lib/run.js";
import { ROOT } from "../lib/world.js";

const DAY_LENGTH_MS = 6 * 60_000;

/** The day's timer on our clock: `window.__dayMs` is what performance.now() says inside it. */
const DAY_CLOCK = `(() => {
  window.__dayMs = 0;
  const set = window.setInterval;
  window.setInterval = (cb, ms, ...args) => {
    if (Number(ms) === 500 && typeof cb === "function") {
      const wrapped = (...a) => {
        const real = performance.now;
        performance.now = () => window.__dayMs;
        try { return cb(...a); } finally { performance.now = real; }
      };
      return set(wrapped, 16, ...args);
    }
    return set(cb, ms, ...args);
  };
})();`;

/**
 * The credit line stays in every frame (attribution is part of the product): the viewer gives
 * it the class its other signs have, which a clean take hides, so it is marked to be kept.
 */
const KEEP_CREDIT = `(() => {
  const mark = () => {
    for (const el of document.querySelectorAll(".sign-in:not(.film-keep)")) {
      if (el.querySelector(":scope > button") && /OpenStreetMap|Overture|Fan-made/.test(el.textContent || "")) el.classList.add("film-keep");
    }
  };
  new MutationObserver(mark).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
})();`;

interface Spot {
  world: string;
  lat: number;
  lon: number;
  scale: number;
  rise: number;
  label: string;
}

function parseSpot(spec: string): Spot {
  const [world, rest] = spec.split(":");
  const [lat, lon, scale, rise = "0"] = rest.split(",").map(Number) as unknown as string[];
  return {
    world,
    lat: Number(lat),
    lon: Number(lon),
    scale: Number(scale),
    rise: Number(rise),
    label: `${world}-${Number(lat).toFixed(4)}_${Number(lon).toFixed(4)}_${scale}`,
  };
}

interface Engine {
  projection: { toMap(lon: number, lat: number): { x: number; y: number } };
  manifest: { geo: { kz: number } };
  maxTiles: number;
  windowLights?: { pending: unknown; masks: Map<unknown, unknown> };
}
type Viewer = Window & { tinyworld: Engine; __dayMs: number; __film: { flush(): void } };

async function camOf(page: Page, spot: Spot): Promise<Cam> {
  const at = await page.evaluate(
    (lon, lat) => {
      const e = (window as unknown as Viewer).tinyworld;
      return { ...e.projection.toMap(lon, lat), kz: e.manifest.geo.kz };
    },
    spot.lon,
    spot.lat,
  );
  return { x: at.x, y: at.y - spot.rise * at.kz, scale: spot.scale };
}

async function setDay(page: Page, phase: number): Promise<void> {
  await page.evaluate((ms) => ((window as unknown as Viewer).__dayMs = ms), phase * DAY_LENGTH_MS);
}

const flag = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

/**
 * The window panes are cut from the tiles in a worker that runs on real time, one tile at a
 * time, and only while the lamps are on: at night, redraw until it has nothing left to do.
 */
async function warmWindows(page: Page): Promise<number> {
  let quiet = 0;
  let masks = 0;
  for (let i = 0; i < 1500 && quiet < 12; i++) {
    await page.evaluate(() => (window as unknown as Viewer).__film.flush());
    await sleep(40);
    const s = await page.evaluate(() => {
      const w = (window as unknown as Viewer).tinyworld.windowLights;
      return { pending: Boolean(w?.pending), masks: w?.masks.size ?? 0 };
    });
    quiet = s.pending || s.masks !== masks ? 0 : quiet + 1;
    masks = s.masks;
  }
  return masks;
}

async function open(world: string, weather: LivePrefs["weather"] = "clear") {
  const stage = await openLive(world, {
    view: LANDSCAPE,
    prefs: { theme: "cycle", weather, life: false },
    seed: 11,
    init: DAY_CLOCK + KEEP_CREDIT,
  });
  const { page } = stage;
  page.on("console", (m) =>
    m.type() === "error" ? console.log("page:", m.text().slice(0, 160)) : undefined,
  );
  await chrome(page, 0);
  await page.evaluate(() => ((window as unknown as Viewer).tinyworld.maxTiles = 600));
  await page.mouse.move(LANDSCAPE.width + 300, LANDSCAPE.height + 300);
  return stage;
}

/** Bring a framing up whole: its tiles in and faded, at the given time of day. */
async function frameUp(page: Page, cam: Cam, phase: number, ticks = 12): Promise<void> {
  await jump(page, cam);
  await setDay(page, phase);
  for (let i = 0; i < ticks; i++) {
    await tick(page);
    await settle(page);
  }
}

async function stills(specs: string[]): Promise<void> {
  const weather = flag("weather", "clear") as LivePrefs["weather"];
  const out = path.join(ROOT, "out/social/daynight/stills");
  fs.mkdirSync(out, { recursive: true });
  const byWorld = new Map<string, Spot[]>();
  for (const s of specs.map(parseSpot)) byWorld.set(s.world, [...(byWorld.get(s.world) ?? []), s]);
  for (const [world, spots] of byWorld) {
    const t0 = Date.now();
    const { browser, page } = await open(world, weather);
    try {
      for (const spot of spots) {
        const cam = await camOf(page, spot);
        await frameUp(page, cam, 0.5);
        const masks = await warmWindows(page);
        for (const phase of [0.5, 0.3, 0.18, 0.0]) {
          await frameUp(page, cam, phase, 4);
          fs.writeFileSync(
            path.join(out, `${spot.label}-${weather}-p${phase.toFixed(2)}.png`),
            await shoot(page),
          );
        }
        console.log(`stills: ${spot.label} (${masks} masks) ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
    } finally {
      await browser.close();
    }
  }
}

/** The time of day at frame f of an n-frame loop that starts at `start` (a phase of the day). */
const phaseAt = (f: number, n: number, start: number): number => (start + f / n) % 1;

async function take(spec: string): Promise<void> {
  const spot = parseSpot(spec);
  const seconds = Number(flag("seconds", "18"));
  const start = Number(flag("start", "0.12"));
  const weather = flag("weather", "clear") as LivePrefs["weather"];
  const name = flag("name", "loop");
  /** frames past the loop's length, for the crossfade that hides the weather's seam */
  const extra = Math.round(Number(flag("xfade", weather === "clear" ? "0" : "0.8")) * FPS);
  const n = Math.round(seconds * FPS);
  const dir = path.join(ROOT, "social-daynight/assets/takes");
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const { browser, page } = await open(spot.world, weather);
  try {
    const cam = await camOf(page, spot);
    await frameUp(page, cam, 0.5, 20);
    const masks = await warmWindows(page);
    console.log(`take: ${masks} masks after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    // run the weather in for a few seconds before the first frame kept
    await setDay(page, phaseAt(0, n, start));
    for (let i = 0; i < 90; i++) {
      await tick(page);
      await page.evaluate(() => (window as unknown as Viewer).__film.flush());
    }
    await settle(page);
    const reel = openReel(path.join(dir, `${name}.mp4`), ROOT);
    for (let f = 0; f < n + extra; f++) {
      await setDay(page, phaseAt(f, n, start));
      await tick(page);
      await settle(page);
      await reel.write(await shoot(page));
      if (f % 60 === 0) console.log(`take: ${name} ${f}/${n + extra}`);
    }
    await reel.close();
    fs.writeFileSync(
      path.join(dir, `${name}.json`),
      JSON.stringify({ spot, seconds, start, weather, fps: FPS, frames: n, extra }, null, 2) + "\n",
    );
    console.log(`take: ${name}.mp4, ${n} + ${extra} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } finally {
    await browser.close();
  }
}

/**
 * The loop's music: beatless, so that its end can be laid over its start without a seam
 * (`npm exec -- tsx scripts/social/daynight.ts music`, ELEVENLABS_API_KEY in the environment
 * for the one command). Written to social-daynight/assets/music/bed-raw.mp3; `loop` cuts it.
 */
const MUSIC = {
  seconds: 30,
  prompt: [
    "Instrumental ambient piece, beatless and slow, calm and warm, with a gentle sense of a day",
    "passing: soft analog synth pads and a quiet, sparse celesta and music-box melody, airy and",
    "dreamy, at one steady level the whole way, no intro swell and no fade or ending.",
    "No drums, no percussion, no pulse, no bass line, no vocals, no spoken words, no sound effects.",
  ].join(" "),
};

async function music(): Promise<void> {
  const key = (process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!key) throw new Error("Set ELEVENLABS_API_KEY for this one command");
  const response = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      prompt: MUSIC.prompt,
      music_length_ms: MUSIC.seconds * 1000,
      model_id: "music_v1",
      force_instrumental: true,
    }),
  });
  if (!response.ok)
    throw new Error(`ElevenLabs answered ${response.status}: ${(await response.text()).slice(0, 400)}`);
  const out = path.join(ROOT, "social-daynight/assets/music/bed-raw.mp3");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await response.arrayBuffer()));
  console.log(`music: ${path.relative(ROOT, out)}`);
}

/**
 * Make a take loop: the extra frames past its length (the weather's) are laid over its first
 * ones, so the last frame hands over to the first; and the music's two seconds before the
 * part used are laid over its last two, equal power, so it loops with the picture.
 *   loop nyc-clear [nyc-storm …] [--music-from 3.6]
 */
function loop(names: string[]): void {
  const dir = path.join(ROOT, "social-daynight/assets/takes");
  for (const name of names) {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), "utf8")) as {
      frames: number;
      extra: number;
    };
    const { frames: n, extra: k } = meta;
    const input = path.join(dir, `${name}.mp4`);
    const output = path.join(dir, `${name}-loop.mp4`);
    const encode = [
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "12",
      "-g",
      "1",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
    ];
    if (k === 0) {
      run("ffmpeg", ["-v", "error", "-y", "-i", input, "-frames:v", String(n), ...encode, output], ROOT);
    } else {
      const filter = [
        `[0:v]trim=start_frame=${k}:end_frame=${n + k},setpts=PTS-STARTPTS,fps=${FPS}[a]`,
        `[0:v]trim=start_frame=0:end_frame=${k},setpts=PTS-STARTPTS,fps=${FPS}[b]`,
        `[a][b]xfade=transition=fade:duration=${k / FPS}:offset=${(n - k) / FPS},format=yuv420p[v]`,
      ].join(";");
      run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-i",
          input,
          "-filter_complex",
          filter,
          "-map",
          "[v]",
          "-frames:v",
          String(n),
          ...encode,
          output,
        ],
        ROOT,
      );
    }
    console.log(`loop: ${path.relative(ROOT, output)} (${n} frames)`);
  }
  const seconds = 18;
  const over = 2;
  const from = Number(flag("music-from", "3.6"));
  const music = path.join(ROOT, "social-daynight/assets/music");
  // decoded whole first: a seek into an mp3 starts on the decoder's silence, which would click
  const whole = path.join(music, "bed-raw.wav");
  run(
    "ffmpeg",
    ["-v", "error", "-y", "-i", path.join(music, "bed-raw.mp3"), "-ar", "48000", "-c:a", "pcm_s16le", whole],
    ROOT,
  );
  run(
    "ffmpeg",
    [
      "-v", "error", "-y",
      "-ss", String(from + over), "-t", String(seconds), "-i", whole,
      "-ss", String(from), "-t", String(over), "-i", whole,
      "-filter_complex", `[0:a][1:a]acrossfade=d=${over}:c1=qsin:c2=qsin[m]`,
      "-map", "[m]", "-ar", "48000", "-c:a", "pcm_s16le", path.join(music, "loop.wav"),
    ], // prettier-ignore
    ROOT,
  );
  console.log("loop: social-daynight/assets/music/loop.wav");
}

/** Render each day, then make it the file to post: H.264 + AAC, yuv420p, +faststart. */
function render(names: string[]): void {
  const project = path.join(ROOT, "social-daynight");
  const out = path.join(ROOT, "out/social/map");
  fs.mkdirSync(out, { recursive: true });
  for (const name of names) {
    const raw = path.join(ROOT, `out/social/daynight/${name}-render.mp4`);
    run(
      "npx",
      [
        "hyperframes", "render", "--quality", "high", "--fps", "30", "--output", raw,
        "--variables", JSON.stringify({ take: `assets/takes/${name}-loop.mp4` }),
      ], // prettier-ignore
      project,
    );
    const file = path.join(out, `tinyworlds-midday-to-midnight-${name.replace(/^nyc-/, "")}.mp4`);
    // the sound is laid from the lossless loop, encoded once and a little louder than the
    // render's (about -15 LUFS): an AAC encoded twice came back with a louder first frame, at
    // the loop's seam
    run(
      "ffmpeg",
      [
        "-v", "error", "-y", "-i", raw, "-i", path.join(project, "assets/music/loop.wav"),
        "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", "30",
        "-af", "volume=-0.15dB", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", file,
      ], // prettier-ignore
      out,
    );
    console.log(`render: ${path.relative(ROOT, file)} ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
  }
}

const [what, ...args] = process.argv.slice(2);
if (what === "stills") await stills(args.filter((a) => a.includes(":")));
else if (what === "take") await take(args.find((a) => a.includes(":"))!);
else if (what === "music") await music();
else if (what === "loop") loop(args.filter((a) => !a.startsWith("--") && !/^[\d.]+$/.test(a)));
else if (what === "render") render(args.length ? args : ["nyc-clear", "nyc-storm"]);
else {
  console.error(
    "usage: daynight.ts stills <world:lat,lon,scale[,rise]> … | take <spot> [--seconds 18] [--start 0.12] [--weather snow]",
  );
  process.exit(2);
}
