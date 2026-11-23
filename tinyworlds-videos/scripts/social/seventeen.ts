// "Seventeen cities": the real cities in the order they went up, a bar of the music each, the
// count climbing in pixel numerals; then three proofs filmed in the viewer (a search flying to
// a place, a building lighting up with its story, the little person dropped into Street Walk);
// then "18", blank. Every picture is the live site (lib/live.ts); the counter, the signs and the
// end card are the composition's (social-seventeen/).
//
//   npm exec -- tsx scripts/social/seventeen.ts stills [world …]     each city's framing, first and last frame
//   npm exec -- tsx scripts/social/seventeen.ts shots [world …]      → social-seventeen/assets/takes/<world>.mp4
//   npm exec -- tsx scripts/social/seventeen.ts search | sight | drop | walk   the proofs
//   ELEVENLABS_API_KEY=… npm exec -- tsx scripts/social/seventeen.ts music
//   SITE_URL=… npm exec -- tsx scripts/social/seventeen.ts render
import fs from "node:fs";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { CITIES } from "../../../tinyworlds-pipeline/src/cities/index.js";
import {
  FPS,
  chrome,
  clamp01,
  easeInOut,
  jump,
  openReel,
  settle,
  shoot,
  sleep,
  tick,
  type Cam,
} from "../lib/film.js";
import { LANDSCAPE, openLive, type LiveOptions } from "../lib/live.js";
import { run } from "../lib/run.js";
import { siteAddress } from "../lib/site.js";
import { ROOT } from "../lib/world.js";
import { HEROES } from "../worlds.js";

const PROJECT = path.join(ROOT, "social-seventeen");
const TAKES = path.join(PROJECT, "assets/takes");
const STILLS = path.join(ROOT, "out/social/seventeen/stills");

/** The real cities, in the order they went up (the viewer's registry). */
export const ORDER = [
  "tinynyc", "tinyrao", "tinyorl", "tinyfte", "tinyvlc", "tinylas", "tinylax", "tinydal", "tinycvg",
  "tinypit", "tinyphl", "tinycos", "tinytkf", "tinyaus", "tinysfo", "tinymke", "tinybeth",
]; // prettier-ignore

/**
 * A city's shot: where (lon, lat: the spot that stays put on screen while the view closes in),
 * how far (map px per px of the 1920 × 1080 picture) and where on screen the spot sits (px of
 * the picture from the middle: the counter's sign is at the left, so the cities lean right).
 * The heroes' framings (worlds.ts) unless a city reads better another way.
 */
interface Framing {
  lon: number;
  lat: number;
  shrink: number;
  dx: number;
  dy: number;
  /** metres the view is lifted, to centre something tall */
  rise?: number;
}

const OWN: Record<string, Partial<Framing>> = {
  // the Magic Kingdom, its castle in the middle of the park, rather than downtown's grid
  tinyorl: { lat: 28.4195, lon: -81.58118, shrink: 0.9, dx: 250, dy: 60, rise: 25 },
  // Commercial Row and the depot along the railway, rather than the forest
  tinytkf: { lat: 39.32773, lon: -120.18575, shrink: 1, dx: 250, dy: 40 },
  // downtown, closer than the hero
  tinycos: { shrink: 1.4 },
  // the Golden Gate Bridge's south tower over the strait, rather than downtown
  tinysfo: { lat: 37.815, lon: -122.478, shrink: 1.6, dx: 200, dy: 0, rise: 60 },
  // the blast furnaces of SteelStacks, closer
  tinybeth: { lat: 40.61524, lon: -75.36751, shrink: 1, dx: 250, dy: 60, rise: 30 },
};

function framing(world: string): Framing {
  const hero = HEROES[world];
  const card = CITIES[world].card;
  const own = OWN[world] ?? {};
  return {
    lon: own.lon ?? hero.lon ?? card.lon,
    lat: own.lat ?? hero.lat ?? card.lat,
    shrink: own.shrink ?? hero.shrink,
    // the hero moves its framing left by dx: the spot then sits that far right of the middle
    dx: own.dx ?? -hero.dx,
    dy: own.dy ?? -hero.dy,
    rise: own.rise ?? 0,
  };
}

/** How long each city's take is (the composition uses a bar of it), and how far it closes in. */
const SHOT_SECONDS = 2.2;
const PUSH = 1.08;

interface Engine {
  projection: { toMap(lon: number, lat: number): { x: number; y: number } };
  mapToScreen(x: number, y: number): { x: number; y: number };
  manifest: { geo: { kz: number } };
  maxTiles: number;
  getView(): Cam;
}
type Viewer = Window & { tinyworld: Engine; __film: { advance(ms: number): void; flush(): void } };

/** Hidden in every take: the benefactors' plaque (busy for a shot this short) and the cookie sign. */
const QUIET = `
  .map-benefactor-plaque, .map-benefactor-carousel { display: none !important; }
`;

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

async function open(world: string, hash?: string, extra: Partial<LiveOptions> = {}) {
  const stage = await openLive(world, {
    view: LANDSCAPE,
    hash,
    seed: 23,
    startMs: 30_000,
    ...extra,
    prefs: { theme: "light", weather: "clear", life: true, ...(extra.prefs ?? {}) },
    init: KEEP_CREDIT + (extra.init ?? ""),
  });
  const { page } = stage;
  page.on("console", (m) =>
    m.type() === "error" ? console.log(`page(${world}):`, m.text().slice(0, 160)) : undefined,
  );
  await page.addStyleTag({ content: QUIET });
  await page.evaluate(() => ((window as unknown as Viewer).tinyworld.maxTiles = 600));
  return stage;
}

/** The view of a framing at u (0 to 1) of its push: closing in on the spot, which stays put. */
async function pushOf(page: Page, f: Framing): Promise<(u: number) => Cam> {
  const at = await page.evaluate(
    (lon, lat) => {
      const e = (window as unknown as Viewer).tinyworld;
      return { ...e.projection.toMap(lon, lat), kz: e.manifest.geo.kz };
    },
    f.lon,
    f.lat,
  );
  const spot = { x: at.x, y: at.y - (f.rise ?? 0) * at.kz };
  const scale0 = 1 / (2 * f.shrink);
  // the middle of the picture, in map px, at the first frame
  const mid0 = { x: spot.x - f.dx * f.shrink, y: spot.y - f.dy * f.shrink };
  return (u) => {
    const scale = scale0 * Math.exp(Math.log(PUSH) * u);
    const k = scale0 / scale;
    return { x: spot.x + (mid0.x - spot.x) * k, y: spot.y + (mid0.y - spot.y) * k, scale };
  };
}

async function warm(page: Page, cam: Cam, ticks = 20): Promise<void> {
  await jump(page, cam);
  for (let i = 0; i < ticks; i++) {
    await tick(page);
    await settle(page);
  }
}

/** "tinycos=lat,lon,shrink,dx,dy,rise": a framing to try instead of the city's own. */
function tryFraming(arg: string): [string, Framing | null] {
  const [world, spec] = arg.split("=");
  if (!spec) return [world, null];
  const [lat, lon, shrink, dx = 0, dy = 0, rise = 0] = spec.split(",").map(Number);
  return [world, { lat, lon, shrink, dx, dy, rise }];
}

async function cityStills(args: string[]): Promise<void> {
  fs.mkdirSync(STILLS, { recursive: true });
  for (const [i, arg] of args.entries()) {
    const [world, tried] = tryFraming(arg);
    const f = tried ?? framing(world);
    const name = tried ? `${world}-try${i}` : world;
    const { browser, page } = await open(world, `${f.lat},${f.lon},${1 / (2 * f.shrink)}`);
    try {
      await chrome(page, 0);
      await page.mouse.move(LANDSCAPE.width + 300, LANDSCAPE.height + 300);
      const cam = await pushOf(page, f);
      await warm(page, cam(0));
      fs.writeFileSync(path.join(STILLS, `${name}-a.png`), await shoot(page));
      await warm(page, cam(1), 10);
      fs.writeFileSync(path.join(STILLS, `${name}-b.png`), await shoot(page));
      console.log(`stills: ${name}`);
    } finally {
      await browser.close();
    }
  }
}

async function shots(worlds: string[]): Promise<void> {
  fs.mkdirSync(TAKES, { recursive: true });
  for (const world of worlds) {
    const t0 = Date.now();
    const f = framing(world);
    const { browser, page } = await open(world, `${f.lat},${f.lon},${1 / (2 * f.shrink)}`);
    try {
      await chrome(page, 0);
      await page.mouse.move(LANDSCAPE.width + 300, LANDSCAPE.height + 300);
      const cam = await pushOf(page, f);
      // the whole push's tiles first, so no frame waits on a stand-in
      await warm(page, cam(1), 6);
      await warm(page, cam(0), 20);
      const n = Math.round(SHOT_SECONDS * FPS);
      const reel = openReel(path.join(TAKES, `${world}.mp4`), ROOT);
      for (let i = 0; i < n; i++) {
        await jump(page, cam(i / (n - 1)));
        await tick(page);
        await settle(page);
        await reel.write(await shoot(page));
      }
      await reel.close();
      console.log(`shot: ${world} ${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } finally {
      await browser.close();
    }
  }
}

/** A pixel-art pointer drawn into the page (the recap's), so it is where the real mouse is in every frame. */
const POINTER = (() => {
  const art = [
    "X...........", "XX..........", "XOX.........", "XOOX........", "XOOOX.......", "XOOOOX......",
    "XOOOOOX.....", "XOOOOOOX....", "XOOOOOOOX...", "XOOOOOOOOX..", "XOOOOOOOOOX.", "XOOOOOOXXXXX",
    "XOOOXOOX....", "XOOX.XOOX...", "XOX..XOOX...", "XX....XOOX..", "X.....XOOX..", ".......XX...",
  ]; // prettier-ignore
  const rects = art
    .flatMap((row, y) =>
      [...row].map((c, x) =>
        c === "."
          ? ""
          : `<rect x="${x}" y="${y}" width="1" height="1" fill="${c === "X" ? "#15171a" : "#f4f2ec"}"/>`,
      ),
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 18" width="24" height="36" shape-rendering="crispEdges">${rects}</svg>`;
  return `(() => {
    const put = () => {
      if (!document.body || document.getElementById("film-pointer")) return;
      const p = document.createElement("div");
      p.id = "film-pointer";
      p.innerHTML = ${JSON.stringify(svg)};
      p.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform-origin:1px 1px;transform:translate(-100px,-100px)";
      document.body.appendChild(p);
      window.addEventListener("mousemove", (e) => {
        p.style.transform = "translate(" + (e.clientX - 1) + "px," + (e.clientY - 1) + "px)" + (p.dataset.down ? " scale(0.84)" : "");
      }, true);
    };
    document.addEventListener("DOMContentLoaded", put);
    setInterval(put, 200);
  })();`;
})();

type Point = { x: number; y: number };
/** The pointer's way: eased moves from where it was to where it goes, by frame. */
function pointerPath(rest: Point) {
  const moves: { from: Point; to: Point; start: number; end: number }[] = [];
  let at = rest;
  return {
    moveTo(to: Point, start: number, end: number) {
      moves.push({ from: at, to, start, end });
      at = to;
    },
    get at() {
      return at;
    },
    pointAt(f: number): Point {
      let p = rest;
      for (const m of moves) {
        if (f < m.start) break;
        const u = easeInOut(clamp01((f - m.start) / Math.max(1, m.end - m.start)));
        p = { x: m.from.x + (m.to.x - m.from.x) * u, y: m.from.y + (m.to.y - m.from.y) * u };
      }
      return p;
    },
  };
}

const boxOf = (page: Page, selector: string) =>
  page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });

async function press(page: Page, p: Point, down: boolean): Promise<void> {
  await page.evaluate((d) => {
    const el = document.getElementById("film-pointer");
    if (el) {
      if (d) el.dataset.down = "1";
      else delete el.dataset.down;
    }
  }, down);
  if (down) await page.mouse.click(p.x, p.y);
}

/**
 * The search: downtown Los Angeles, the viewer's own search sign, "hollywood sign" typed key by
 * key, the first result chosen, and the viewer's own flight there.
 */
async function search(): Promise<void> {
  const QUERY = "hollywood sign";
  const start = { lon: -118.255, lat: 34.0505, scale: 0.36 };
  const { browser, page } = await open("tinylax", `${start.lat},${start.lon},${start.scale}`, {
    init: POINTER,
  });
  try {
    await chrome(page, 1);
    const cam = await page.evaluate(
      (lon, lat, s) => ({ ...(window as unknown as Viewer).tinyworld.projection.toMap(lon, lat), scale: s }),
      start.lon,
      start.lat,
      start.scale,
    );
    await warm(page, cam, 40);
    const field = await boxOf(page, 'input[type="search"], input[role="combobox"]');
    const pointer = pointerPath({ x: field.x + field.width * 0.55, y: field.y + field.height + 70 });
    const clickAt = 8;
    const typeAt = 12;
    const KEY = 1.5;
    const chooseAt = typeAt + Math.ceil(QUERY.length * KEY) + 9;
    pointer.moveTo(
      { x: field.x + Math.min(120, field.width * 0.4), y: field.y + field.height / 2 },
      0,
      clickAt - 1,
    );
    const n = Math.round(4.2 * FPS);
    const reel = openReel(path.join(TAKES, "search.mp4"), ROOT);
    let typed = 0;
    for (let f = 0; f < n; f++) {
      await tick(page);
      if (f === clickAt) await press(page, pointer.at, true);
      if (f === clickAt + 3) await press(page, pointer.at, false);
      while (f >= typeAt && typed < QUERY.length && f >= typeAt + Math.round(typed * KEY)) {
        await page.keyboard.type(QUERY[typed]);
        typed++;
        await sleep(30);
      }
      if (f === chooseAt - 7) {
        const option = await boxOf(page, '[role="option"]');
        pointer.moveTo(
          { x: option.x + Math.min(150, option.width * 0.45), y: option.y + option.height / 2 },
          f,
          chooseAt - 1,
        );
      }
      if (f === chooseAt) {
        await press(page, pointer.at, true);
        pointer.moveTo({ x: LANDSCAPE.width * 0.64, y: LANDSCAPE.height * 0.66 }, f + 4, f + 22);
      }
      if (f === chooseAt + 3) await press(page, pointer.at, false);
      const p = pointer.pointAt(f);
      await page.mouse.move(p.x, p.y);
      await settle(page);
      await reel.write(await shoot(page));
    }
    await reel.close();
    fs.writeFileSync(
      path.join(TAKES, "search.json"),
      JSON.stringify({ fps: FPS, frames: n, clickAt, typeAt, chooseAt }, null, 2) + "\n",
    );
    console.log(`search: ${n} frames, chosen at frame ${chooseAt}`);
  } finally {
    await browser.close();
  }
}

/**
 * A building lighting up: the pointer comes onto Philadelphia's City Hall, which lights up and
 * says what it is with the opening of its Wikipedia article.
 */
async function sight(): Promise<void> {
  const HALL = { lon: -75.16352, lat: 39.95233 };
  const scale = 0.62;
  const { browser, page } = await open("tinyphl", `${HALL.lat},${HALL.lon},${scale}`, { init: POINTER });
  try {
    await chrome(page, 1);
    const world = await page.evaluate(
      (lon, lat) => {
        const e = (window as unknown as Viewer).tinyworld;
        return { ...e.projection.toMap(lon, lat), kz: e.manifest.geo.kz };
      },
      HALL.lon,
      HALL.lat,
    );
    // the tower left of the middle and lifted, so the sign has room at its right
    const cam: Cam = { x: world.x + 170 / scale, y: world.y - 95 * world.kz, scale };
    await warm(page, cam, 60);
    const tower = await page.evaluate(
      (x, y) => (window as unknown as Viewer).tinyworld.mapToScreen(x, y),
      world.x,
      world.y - 120 * world.kz,
    );
    // once over the tower and away again, off the record: its words and picture are fetched
    await page.mouse.move(tower.x, tower.y);
    for (let i = 0; i < 40; i++) {
      await tick(page);
      await settle(page);
      await sleep(40);
    }
    await page.mouse.move(LANDSCAPE.width - 40, LANDSCAPE.height * 0.8);
    for (let i = 0; i < 20; i++) {
      await tick(page);
      await settle(page);
    }
    const pointer = pointerPath({ x: LANDSCAPE.width * 0.86, y: LANDSCAPE.height * 0.86 });
    const arrive = 16;
    pointer.moveTo(tower, 3, arrive);
    const n = Math.round(4 * FPS);
    const reel = openReel(path.join(TAKES, "sight.mp4"), ROOT);
    for (let f = 0; f < n; f++) {
      await tick(page);
      const p = pointer.pointAt(f);
      await page.mouse.move(p.x, p.y);
      await settle(page);
      await reel.write(await shoot(page));
    }
    await reel.close();
    console.log(`sight: ${n} frames, on the tower at frame ${arrive}`);
  } finally {
    await browser.close();
  }
}

/**
 * The little person dropped into Street Walk: taken from the tool column, carried over Times
 * Square, let go; the walk opens (on this machine it draws in software and takes minutes to
 * come up, so the take is two reels: the drop, and the walk once it is up).
 */
async function walk(): Promise<void> {
  const SPOT = { lon: -73.98554, lat: 40.75799 };
  const scale = 1.1;
  const { browser, page } = await open("tinynyc", `${SPOT.lat},${SPOT.lon},${scale}`, { init: POINTER });
  try {
    await chrome(page, 1);
    const cam = await page.evaluate(
      (lon, lat, s) => ({ ...(window as unknown as Viewer).tinyworld.projection.toMap(lon, lat), scale: s }),
      SPOT.lon,
      SPOT.lat,
      scale,
    );
    await warm(page, cam, 40);
    const person = await page.$eval('button[aria-label="Walk the streets"]', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const pointer = pointerPath({ x: person.x, y: person.y + 150 });
    const grab = 10;
    const letGo = 44;
    pointer.moveTo(person, 0, grab - 1);
    const n = 52;
    const reel = openReel(path.join(TAKES, "drop.mp4"), ROOT);
    for (let f = 0; f < n; f++) {
      await tick(page);
      if (f === grab) {
        await press(page, person, false);
        await page.evaluate(() => {
          const el = document.getElementById("film-pointer");
          if (el) el.dataset.down = "1";
        });
        await page.mouse.down();
        pointer.moveTo({ x: LANDSCAPE.width / 2, y: LANDSCAPE.height / 2 + 6 }, grab + 1, letGo - 4);
      }
      const p = pointer.pointAt(f);
      await page.mouse.move(p.x, p.y);
      // the ways the person can stand on are read from the squares under the pointer, as it moves
      if (f > grab) await sleep(60);
      if (f === letGo) {
        await page.mouse.up();
        await press(page, p, false);
      }
      await settle(page);
      await reel.write(await shoot(page));
    }
    await reel.close();
    console.log("walk: the drop filmed; waiting for the walk to come up");
    // what a player sees, less the hint to click (a film cannot), the film's own pointer and the
    // minimap: drawn in software here, it leaves a dark copy of itself in the view's top-left
    // corner (the Street Walk announcement's takes hide it too)
    await page.addStyleTag({
      content: `.walk-pane .sign.top-\\[62\\%\\] { display: none !important; } #film-pointer { display: none !important; } .walk-minimap { visibility: hidden !important; }`,
    });
    const t0 = Date.now();
    for (let i = 0; i < 3000; i++) {
      await page.evaluate(() => {
        const film = (window as unknown as Viewer).__film;
        film.advance(1000 / 30);
        film.flush();
      });
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
    console.log(`walk: up after ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    // let its squares round us come in, on the film's clock and the real one
    for (let i = 0; i < 90; i++) {
      await page.evaluate(() => {
        const film = (window as unknown as Viewer).__film;
        film.advance(1000 / 30);
        film.flush();
      });
      await sleep(80);
    }
    fs.writeFileSync(path.join(STILLS, "walk-up.png"), await shoot(page));
    await page.keyboard.down("w");
    const m = Math.round(3 * FPS);
    const walkReel = openReel(path.join(TAKES, "walk.mp4"), ROOT);
    for (let f = 0; f < m; f++) {
      await page.evaluate(() => {
        const film = (window as unknown as Viewer).__film;
        film.advance(1000 / 30);
        film.flush();
      });
      await sleep(20);
      await walkReel.write(await shoot(page));
      if (f % 15 === 0) console.log(`walk: ${f}/${m}`);
    }
    await page.keyboard.up("w");
    await walkReel.close();
    console.log("walk: filmed");
  } finally {
    await browser.close();
  }
}

/** The bed: a driving 160 BPM, a city a bar. */
const MUSIC = {
  seconds: 42,
  prompt: [
    "Instrumental, exactly 160 BPM, 4/4, bright, driving and proud, upbeat indie-electronic with",
    "chiptune colour: punchy kick on every beat and a crisp snare on two and four from the very",
    "first beat, no intro, a bouncing synth bass, a bright square-wave arpeggio and big warm pads.",
    "Steady energy that lifts a notch every eight bars; from about 26 seconds the drums thin out",
    "for six seconds under the arpeggio, then come back full; at about 35 seconds one big final",
    "hit and a held chord that rings out to the end. No vocals, no spoken words, no sound effects.",
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
  const raw = path.join(ROOT, "out/social/seventeen/render.mp4");
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
      "-movflags", "+faststart", path.join(out, "tinyworlds-seventeen-cities.mp4"),
    ], // prettier-ignore
    out,
  );
}

const [what, ...args] = process.argv.slice(2);
const worlds = args.filter((a) => a.startsWith("tiny"));
if (what === "stills") await cityStills(worlds.length ? worlds : ORDER);
else if (what === "shots") await shots(worlds.length ? worlds : ORDER);
else if (what === "search") await search();
else if (what === "sight") await sight();
else if (what === "walk") await walk();
else if (what === "music") await music();
else if (what === "render") render();
else {
  console.error("usage: seventeen.ts stills|shots [world …] | search | sight | walk | music | render");
  process.exit(2);
}
