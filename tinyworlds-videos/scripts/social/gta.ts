// A tour of the five GTA-inspired worlds, for the series' fans: a stop per world, in the order
// the games came out. On each, the whole city with its districts named by the viewer's own
// region lines, then the viewer's flight down to its best-known landmark, named on a sign.
// Every picture is the live site (lib/live.ts); the names, the end card and the music are the
// composition's (social-gta/). Fan-made, and it says so: original layouts and names, no logos,
// no music or artwork of the series.
//
//   npm exec -- tsx scripts/social/gta.ts stills <world> [place …]   the wide view and each place
//   npm exec -- tsx scripts/social/gta.ts takes [world …]             → social-gta/assets/takes/<world>.mp4
//   npm exec -- tsx scripts/social/gta.ts drive                        a few seconds at the wheel (Street Walk)
//   ELEVENLABS_API_KEY=… npm exec -- tsx scripts/social/gta.ts music
//   SITE_URL=… npm exec -- tsx scripts/social/gta.ts render
import fs from "node:fs";
import path from "node:path";
import type { Page } from "puppeteer-core";
import {
  FPS,
  between,
  chrome,
  clamp01,
  easeInOut,
  flight,
  jump,
  openReel,
  settle,
  shoot,
  sleep,
  tick,
  type Cam,
} from "../lib/film.js";
import { LANDSCAPE, liveOrigin, openLive } from "../lib/live.js";
import { run } from "../lib/run.js";
import { siteAddress } from "../lib/site.js";
import { ROOT } from "../lib/world.js";

const PROJECT = path.join(ROOT, "social-gta");
const TAKES = path.join(PROJECT, "assets/takes");
const STILLS = path.join(ROOT, "out/social/gta/stills");

interface Stop {
  world: string;
  /** the whole city: where, how far (CSS px per map px) */
  wide: { lon: number; lat: number; scale: number };
  /** the landmark the view flies down to (a place in places.json) */
  place: string;
  scale: number;
  /** metres the view is lifted at the landmark, to centre something tall */
  rise: number;
  /** px of the 960 × 540 view the landmark sits right of the middle (its sign is at the left) */
  dx: number;
}

/** The worlds in the order the games came out. */
export const STOPS: Stop[] = [
  { world: "tinygtaiii", wide: { lon: 0, lat: 0, scale: 0.145 }, place: "Ashwater Power Station", scale: 0.9, rise: 30, dx: 120 },
  { world: "tinyvicecity", wide: { lon: 0, lat: 0, scale: 0.135 }, place: "The Coral Hour", scale: 0.9, rise: 20, dx: 120 },
  { world: "tinysanandreas", wide: { lon: 0, lat: 0, scale: 0.1 }, place: "Mirage Crown", scale: 0.9, rise: 30, dx: 120 },
  { world: "tinygtaiv", wide: { lon: 0, lat: 0, scale: 0.13 }, place: "Alder Span", scale: 0.9, rise: 30, dx: 120 },
  // the observatory is low and stands alone on its hill: closer than the others
  { world: "tinygtav", wide: { lon: 0, lat: 0, scale: 0.1 }, place: "Halo Observatory", scale: 1.5, rise: 12, dx: 110 },
]; // prettier-ignore

/** The take of a stop, seconds: the whole city, the flight, the landmark. */
const WIDE = 2.0;
const FLY = 1.6;
const TAKE = 6.5;

interface Place {
  n: string;
  t: string;
  lon: number;
  lat: number;
  b?: string;
  r: number;
}

async function places(world: string): Promise<Place[]> {
  const res = await fetch(`${liveOrigin()}/${world}/data/places.json`);
  return ((await res.json()) as { places: Place[] }).places;
}

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

interface Engine {
  projection: { toMap(lon: number, lat: number): { x: number; y: number } };
  manifest: { geo: { kz: number }; bounds: { minX: number; minY: number; maxX: number; maxY: number } };
  maxTiles: number;
  setHoodLines(on: boolean): void;
}
type Viewer = Window & { tinyworld: Engine; __film: { advance(ms: number): void; flush(): void } };

async function open(world: string, hash?: string) {
  const stage = await openLive(world, {
    view: LANDSCAPE,
    hash,
    prefs: { theme: "light", weather: "clear", life: true },
    seed: 31,
    startMs: 40_000,
    init: KEEP_CREDIT,
  });
  const { page } = stage;
  page.on("console", (m) =>
    m.type() === "error" ? console.log(`page(${world}):`, m.text().slice(0, 160)) : undefined,
  );
  await chrome(page, 0);
  await page.evaluate(() => ((window as unknown as Viewer).tinyworld.maxTiles = 900));
  // the pointer off the map: the viewer lights whatever district it is over
  await page.mouse.move(LANDSCAPE.width + 300, LANDSCAPE.height + 300);
  return stage;
}

async function camAt(page: Page, lon: number, lat: number, scale: number, rise = 0, dx = 0): Promise<Cam> {
  const at = await page.evaluate(
    (lo, la) => {
      const e = (window as unknown as Viewer).tinyworld;
      return { ...e.projection.toMap(lo, la), kz: e.manifest.geo.kz };
    },
    lon,
    lat,
  );
  return { x: at.x - dx / scale, y: at.y - rise * at.kz, scale };
}

async function warm(page: Page, cam: Cam, ticks = 20): Promise<void> {
  await jump(page, cam);
  for (let i = 0; i < ticks; i++) {
    await tick(page);
    await settle(page);
  }
}

const lines = (page: Page, on: boolean) =>
  page.evaluate((o) => (window as unknown as Viewer).tinyworld.setHoodLines(o), on);

async function stills(world: string, names: string[]): Promise<void> {
  fs.mkdirSync(STILLS, { recursive: true });
  const stop = STOPS.find((s) => s.world === world)!;
  const all = await places(world);
  const { browser, page } = await open(world);
  try {
    await lines(page, true);
    await warm(page, await camAt(page, stop.wide.lon, stop.wide.lat, stop.wide.scale), 30);
    fs.writeFileSync(path.join(STILLS, `${world}-wide.png`), await shoot(page));
    await lines(page, false);
    for (const name of names.length ? names : [stop.place]) {
      const p = all.find((x) => x.n === name);
      if (!p) {
        console.log(`no place "${name}" in ${world}`);
        continue;
      }
      await warm(page, await camAt(page, p.lon, p.lat, stop.scale, stop.rise, stop.dx), 24);
      fs.writeFileSync(path.join(STILLS, `${world}-${name.replace(/\W+/g, "_")}.png`), await shoot(page));
      console.log(`stills: ${world} ${name}`);
    }
  } finally {
    await browser.close();
  }
}

async function takes(worlds: string[]): Promise<void> {
  fs.mkdirSync(TAKES, { recursive: true });
  for (const stop of STOPS.filter((s) => !worlds.length || worlds.includes(s.world))) {
    const t0 = Date.now();
    const p = (await places(stop.world)).find((x) => x.n === stop.place);
    if (!p) throw new Error(`no place "${stop.place}" in ${stop.world}`);
    const { browser, page } = await open(stop.world);
    try {
      const wide = await camAt(page, stop.wide.lon, stop.wide.lat, stop.wide.scale);
      const there = await camAt(page, p.lon, p.lat, stop.scale, stop.rise, stop.dx);
      // the whole city closes in a little while it is named; the landmark too, once there
      const wideEnd: Cam = { ...wide, scale: wide.scale * 1.04 };
      const way = flight(wideEnd, there);
      const thereEnd: Cam = { ...there, scale: there.scale * 1.05 };
      const camOf = (t: number): Cam => {
        if (t < WIDE) return between(wide, wideEnd, t / WIDE);
        if (t < WIDE + FLY) return way((t - WIDE) / FLY);
        return between(there, thereEnd, easeInOut(clamp01((t - WIDE - FLY) / (TAKE - WIDE - FLY))));
      };
      const n = Math.round(TAKE * FPS);
      // every frame's tiles once, before the take, so none waits on a stand-in
      for (let f = 0; f < n; f += 3) {
        await jump(page, camOf(f / FPS));
        await settle(page);
      }
      await lines(page, true);
      await warm(page, wide, 30);
      const reel = openReel(path.join(TAKES, `${stop.world}.mp4`), ROOT);
      let on = true;
      for (let f = 0; f < n; f++) {
        const t = f / FPS;
        if (on && t >= WIDE - 0.1) {
          on = false;
          await lines(page, false);
        }
        await jump(page, camOf(t));
        await tick(page);
        await settle(page);
        await reel.write(await shoot(page));
      }
      await reel.close();
      console.log(`take: ${stop.world} ${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } finally {
      await browser.close();
    }
  }
}

/**
 * A few seconds at the wheel in Street Walk: opened by its own link on a street of Vice City's
 * beach, a car put down where the walk stands you, got into, and driven off along the street
 * with the game's own chase camera. On this machine the walk draws in software: it takes minutes
 * to come up, and each frame a while.
 */
const DRIVE = { world: "tinyvicecity", lat: 0.0006, lon: 0.0071, heading: 0, seconds: 3, speed: 13 };

interface WalkVehicle {
  kind: string;
  boat: boolean;
  state: string;
  id: number;
  e: number;
  n: number;
  z: number;
  yaw: number;
  v: number;
  vs: number;
  vz: number;
  w: number;
  damage: number;
}
interface WalkGame {
  position(): { e: number; n: number; z: number; yaw: number };
  vehicles(): WalkVehicle[];
  add(v: WalkVehicle): void;
  enter(v: WalkVehicle): void;
  traffic: { cars: WalkVehicle[] };
}
type WalkWindow = Window & {
  __film: { advance(ms: number): void; flush(): void };
  filmGame?: () => WalkGame;
};

/** Find the live game through the walk's minimap, which is handed it as a prop. */
const FIND_GAME = `(() => {
  window.filmGame = () => {
    const minimap = document.querySelector(".walk-minimap");
    const key = minimap && Object.keys(minimap).find((k) => k.startsWith("__reactFiber$"));
    let fiber = key ? minimap[key] : undefined;
    while (fiber) {
      const game = fiber.memoizedProps && fiber.memoizedProps.game;
      if (game) return game;
      fiber = fiber.return;
    }
    throw new Error("Street Walk has no live game");
  };
})();`;

async function walkFrames(page: Page, count: number): Promise<void> {
  await page.evaluate((c) => {
    const film = (window as unknown as WalkWindow).__film;
    for (let i = 0; i < c; i++) {
      film.advance(1000 / 30);
      film.flush();
    }
  }, count);
}

async function drive(): Promise<void> {
  fs.mkdirSync(TAKES, { recursive: true });
  fs.mkdirSync(STILLS, { recursive: true });
  const t0 = Date.now();
  const { browser, page } = await open(DRIVE.world, `walk=${DRIVE.lat},${DRIVE.lon},${DRIVE.heading}`);
  try {
    // the walk's own signs stay, as a player sees them, less the hint to click (a film cannot)
    // and the minimap: drawn in software here, it leaves a dark copy of itself in the view's
    // top-left corner (the Street Walk announcement's takes hide it too)
    await page.addStyleTag({
      content: `.walk-pane .sign.top-\\[62\\%\\] { display: none !important; } .walk-minimap { visibility: hidden !important; }`,
    });
    for (let i = 0; i < 3000; i++) {
      await walkFrames(page, 1);
      const ready = await page.evaluate(
        () =>
          Boolean(document.querySelector(".walk-minimap")) &&
          !/Loading the streets/.test(
            document.querySelector(".walk-pane")?.textContent ?? "Loading the streets",
          ),
      );
      if (ready && i > 30) break;
      await sleep(60);
    }
    console.log(`drive: the walk is up after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await page.evaluate(FIND_GAME);
    for (let i = 0; i < 60; i++) {
      await walkFrames(page, 1);
      await sleep(80);
    }
    const placed = await page.evaluate((speed) => {
      const game = (window as unknown as WalkWindow).filmGame!();
      const at = game.position();
      const parked = game.vehicles().find((v) => !v.boat && (v.state === "parked" || v.state === "loose"));
      if (!parked) return null;
      // clear the street ahead of the car of the traffic that would stop it at once
      const east = Math.sin(at.yaw);
      const north = Math.cos(at.yaw);
      const cars = game.traffic.cars;
      for (let i = cars.length - 1; i >= 0; i--) {
        const de = cars[i].e - at.e;
        const dn = cars[i].n - at.n;
        const along = de * east + dn * north;
        if (along > -10 && along < 60 && Math.abs(de * north - dn * east) < 3) cars.splice(i, 1);
      }
      const car = {
        ...parked,
        id: -1,
        state: "loose",
        e: at.e,
        n: at.n,
        z: at.z,
        yaw: at.yaw,
        v: speed,
        vs: 0,
        vz: 0,
        w: 0,
        damage: 0,
      };
      game.add(car);
      game.enter(car);
      return { e: at.e, n: at.n, yaw: at.yaw, kind: parked.kind };
    }, DRIVE.speed);
    if (!placed) throw new Error("no car to drive in the squares round the walk");
    console.log("drive: at the wheel", placed);
    await page.keyboard.down("w");
    for (let i = 0; i < 20; i++) {
      await walkFrames(page, 1);
      await sleep(40);
    }
    fs.writeFileSync(path.join(STILLS, "drive-start.png"), await shoot(page));
    const n = Math.round(DRIVE.seconds * FPS);
    const reel = openReel(path.join(TAKES, "drive.mp4"), ROOT);
    for (let f = 0; f < n; f++) {
      await walkFrames(page, 1);
      await sleep(15);
      await reel.write(await shoot(page));
      if (f % 15 === 0) console.log(`drive: ${f}/${n}`);
    }
    await page.keyboard.up("w");
    await reel.close();
    console.log(`drive: ${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } finally {
    await browser.close();
  }
}

/** The bed: an original crime-caper groove, three bars a world at 120 BPM. */
const MUSIC = {
  seconds: 46,
  prompt: [
    "Instrumental, exactly 120 BPM, 4/4, an original cinematic crime-caper groove, cool and",
    "confident with a sense of a big city at night. The full groove starts on the very first",
    "beat with no intro and no build-up: punchy breakbeat drums, a deep slap bass riff, wah",
    "guitar stabs, a warm electric piano, short brass hits. It lifts a little every six seconds.",
    "At about 36 seconds one big brass hit, then a long held chord that rings out slowly to the",
    "end. No vocals, no spoken words, no sound effects.",
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
  const out = path.join(PROJECT, "assets/music/bed.mp3");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await response.arrayBuffer()));
  console.log(`music: ${path.relative(ROOT, out)}`);
}

/** Render, the address given here and never written in the source. */
function render(): void {
  const address = siteAddress();
  const out = path.join(ROOT, "out/social/map");
  fs.mkdirSync(out, { recursive: true });
  const raw = path.join(ROOT, "out/social/gta/render.mp4");
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  run(
    "npx",
    [
      "hyperframes", "render", "--quality", "high", "--fps", "30", "--output", raw,
      ...(address ? ["--variables", JSON.stringify({ address })] : []),
    ], // prettier-ignore
    PROJECT,
  );
  run(
    "ffmpeg",
    [
      "-v", "error", "-y", "-i", raw, "-c:v", "libx264", "-preset", "slow", "-crf", "18",
      "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", "30", "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart", path.join(out, "tinyworlds-gta-inspired-tour.mp4"),
    ], // prettier-ignore
    out,
  );
}

const [what, ...args] = process.argv.slice(2);
if (what === "stills") await stills(args[0], args.slice(1));
else if (what === "takes") await takes(args.filter((a) => a.startsWith("tiny")));
else if (what === "drive") await drive();
else if (what === "music") await music();
else if (what === "render") render();
else {
  console.error("usage: gta.ts stills <world> [place …] | takes [world …] | music | render");
  process.exit(2);
}
