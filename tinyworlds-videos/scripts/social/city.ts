import fs from "node:fs";
import path from "node:path";
import type { Browser, Page } from "puppeteer-core";
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
import { liveOrigin, openLive, VERTICAL } from "../lib/live.js";
import { run } from "../lib/run.js";
import { siteAddress } from "../lib/site.js";
import { ROOT } from "../lib/world.js";
import { AT, PLANS, WORDS, planOf, type CityPlan, type Spot } from "./city-plan.js";

/**
 * The "Your city" shorts (see city-plan.ts): film each city's take from the live site, look at
 * its landings first, and render the shorts.
 *
 *   npm exec -- tsx scripts/social/city.ts stills <world> [seconds…]   the take's picture at its
 *        landings (or at the seconds given) → out/social/city/stills/
 *   npm exec -- tsx scripts/social/city.ts take <world>    → social-city/assets/takes/<world>.mp4
 *   npm exec -- tsx scripts/social/city.ts render <world…> [--quality draft|looks|delivery]
 *        → out/social/city/<world>.mp4 (the address is given here, never written in a file)
 *
 * SITE_URL is the live site's origin (or DEPLOY_URL in the gitignored deploy/.env).
 */
const PROJECT = path.join(ROOT, "social-city");
const TAKES = path.join(PROJECT, "assets/takes");
const OUT = path.join(ROOT, "out/social/city");

/** How many frames ahead the take asks for tiles, and how many the viewer may keep (westeros.ts). */
const AHEAD = 9;
const TILES_KEPT = 900;
/** Frames run before the first one kept, so the opening's tiles are in and faded. */
const WARM_UP = 20;
/** While the view rests on a place it keeps closing in, this much by the time it leaves. */
const DRIFT = 0.04;
/** The opening's slow push, and the end's. */
const PUSH = 0.05;
/** The way between two places fits in about this many CSS px at the top of its climb. */
const SPAN = 760;

/** Where the middle of the city stands on screen (CSS px down): at the start, and at the end. */
const OPEN_Y = 505;
const END_Y = 545;

const W = VERTICAL.width;
const H = VERTICAL.height;

/** A pixel-art pointer drawn into the page itself, so it is where the real mouse is (recap.ts). */
const POINTER = (() => {
  const art = [
    "X...........",
    "XX..........",
    "XOX.........",
    "XOOX........",
    "XOOOX.......",
    "XOOOOX......",
    "XOOOOOX.....",
    "XOOOOOOX....",
    "XOOOOOOOX...",
    "XOOOOOOOOX..",
    "XOOOOOOOOOX.",
    "XOOOOOOXXXXX",
    "XOOOXOOX....",
    "XOOX.XOOX...",
    "XOX..XOOX...",
    "XX....XOOX..",
    "X.....XOOX..",
    ".......XX...",
  ];
  const rects = art
    .flatMap((row, y) =>
      [...row].map((c, x) =>
        c === "."
          ? ""
          : `<rect x="${x}" y="${y}" width="1" height="1" fill="${c === "X" ? "#15171a" : "#f4f2ec"}"/>`,
      ),
    )
    .join("");
  // a size up from the recap's: a phone shows the picture smaller
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 18" width="30" height="45" shape-rendering="crispEdges">${rects}</svg>`;
  return `(() => {
    const put = () => {
      if (!document.body || document.getElementById("film-pointer")) return;
      const p = document.createElement("div");
      p.id = "film-pointer";
      p.innerHTML = ${JSON.stringify(svg)};
      p.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)";
      document.body.appendChild(p);
      window.addEventListener("mousemove", (e) => {
        delete p.dataset.away;
        p.style.transform = "translate(" + (e.clientX - 1) + "px," + (e.clientY - 1) + "px)";
      }, true);
    };
    document.addEventListener("DOMContentLoaded", put);
    setInterval(put, 200);
  })();`;
})();

/** The viewer's own sign beside a lit building: the short names it on a sign of its own. */
const QUIET = `.sign.fixed.z-\\[4\\] { opacity: 0 !important; }`;

interface Sight {
  id: string;
  n: string;
  rings: number[][];
  anchor: [number, number];
}

interface Engine {
  projection: { toMap(lon: number, lat: number): { x: number; y: number } };
  mapToScreen(x: number, y: number): { x: number; y: number };
  manifest: { bounds: { minX: number; minY: number; maxX: number; maxY: number }; geo: { kz: number } };
  maxTiles: number;
  sightState: { hovered: string | null; pinned: string | null };
  holdSight(id: string | null): void;
}
type Viewer = Window & { tinyworld: Engine };
type Point = { x: number; y: number };

/** Even-odd: is the point inside the rings (flat x, y lists)? */
function inside(rings: number[][], x: number, y: number): boolean {
  let hit = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [r[i], r[i + 1], r[j], r[j + 1]];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** Where the pointer rests on a building: inside its outline, near the middle of its height. */
function restOn(sight: Sight): Point {
  const xs = sight.rings.flatMap((r) => r.filter((_, i) => i % 2 === 0));
  const ys = sight.rings.flatMap((r) => r.filter((_, i) => i % 2 === 1));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const want = { x: sight.anchor[0], y: y0 + (y1 - y0) * 0.42 };
  let best: Point | null = null;
  let bestD = Infinity;
  for (let i = 1; i < 40; i++)
    for (let j = 1; j < 40; j++) {
      const p = { x: x0 + ((x1 - x0) * i) / 40, y: y0 + ((y1 - y0) * j) / 40 };
      // well inside: the points round it are inside too
      const r = Math.min(x1 - x0, y1 - y0) * 0.06;
      if (
        ![
          [0, 0],
          [r, 0],
          [-r, 0],
          [0, r],
          [0, -r],
        ].every(([dx, dy]) => inside(sight.rings, p.x + dx, p.y + dy))
      )
        continue;
      const d = Math.hypot(p.x - want.x, (p.y - want.y) * 0.7);
      if (d < bestD) [best, bestD] = [p, d];
    }
  if (!best) throw new Error(`no room for the pointer inside ${sight.n}`);
  return best;
}

async function liveJson<T>(world: string, file: string): Promise<T> {
  const response = await fetch(`${liveOrigin()}/${world}/data/${file}`);
  if (!response.ok) throw new Error(`${world}/data/${file}: ${response.status}`);
  return (await response.json()) as T;
}

interface Stage {
  browser: Browser;
  page: Page;
  camAt(t: number): Cam;
  /** the lit building's resting point, in map px */
  rest: Point | null;
  sight: Sight | null;
}

/** The live viewer, ready to be filmed, and where the view is at each moment of the take. */
async function stage(plan: CityPlan): Promise<Stage> {
  const last = plan.stops[3];
  const sight = last.sight
    ? ((await liveJson<{ sights: Sight[] }>(plan.world, "sights.json")).sights.find(
        (s) => s.id === last.sight,
      ) ?? null)
    : null;
  if (last.sight && !sight) throw new Error(`${plan.world}: no sight ${last.sight}`);
  if (sight && sight.n !== last.name)
    console.warn(`${plan.world}: the sight is "${sight.n}", the sign says "${last.name}"`);

  const first = plan.stops[0];
  const { browser, page } = await openLive(plan.world, {
    hash: `${first.lat},${first.lon},0.05`,
    view: VERTICAL,
    prefs: { lang: plan.lang },
    seed: 7,
    startMs: 30_000,
    init: POINTER,
    userDataDir: path.join(OUT, "profiles", plan.world),
  });
  await page.addStyleTag({ content: QUIET });
  await chrome(page, 0);
  await page.evaluate((keep) => ((window as unknown as Viewer).tinyworld.maxTiles = keep), TILES_KEPT);
  await page.mouse.move(W + 40, H * 0.75);

  const world = await page.evaluate(
    (spots) => {
      const engine = (window as unknown as Viewer).tinyworld;
      return {
        at: spots.map(([lon, lat]) => engine.projection.toMap(lon, lat)),
        bounds: engine.manifest.bounds,
        kz: engine.manifest.geo.kz,
      };
    },
    plan.stops.map((s) => [s.lon, s.lat]),
  );
  const view = (i: number, spot: Spot): Cam => ({
    x: world.at[i].x - (spot.dx ?? 0) / spot.scale,
    y: world.at[i].y - (spot.rise ?? 0) * world.kz,
    scale: spot.scale,
  });
  const stops = plan.stops.map((s, i) => view(i, s));
  const b = world.bounds;
  // the city a little under the middle at first (the hook hangs over it), lower still at the end
  // (the end card's two signs do)
  const scale = (W / (b.maxX - b.minX)) * plan.open.fit;
  const middle = {
    x: b.minX + (b.maxX - b.minX) * (plan.open.cx ?? 0.5),
    y: b.minY + (b.maxY - b.minY) * (plan.open.cy ?? 0.5),
  };
  const whole: Cam = { x: middle.x, y: middle.y - (OPEN_Y - H / 2) / scale, scale };
  const wholeEnd: Cam = { x: middle.x, y: middle.y - (END_Y - H / 2) / scale, scale };
  const pushed = (cam: Cam, u: number, by: number): Cam => ({ ...cam, scale: cam.scale * (1 + by * u) });
  const rested = (i: number): Cam => pushed(stops[i], 1, DRIFT);
  const ways = [0, 1, 2].map((i) => flight(rested(i), stops[i + 1], SPAN));
  const dive = flight(pushed(whole, 1, PUSH), stops[0], SPAN);
  const lastHeld = pushed(stops[3], 1, DRIFT * 2);

  const camAt = (t: number): Cam => {
    if (t < AT.dive) return pushed(whole, easeInOut(t / AT.dive), PUSH);
    if (t < AT.land[0]) return dive((t - AT.dive) / (AT.land[0] - AT.dive));
    for (let i = 0; i < 3; i++) {
      if (t < AT.leave[i]) return pushed(stops[i], (t - AT.land[i]) / (AT.leave[i] - AT.land[i]), DRIFT);
      if (t < AT.land[i + 1]) return ways[i]((t - AT.leave[i]) / (AT.land[i + 1] - AT.leave[i]));
    }
    if (t < AT.out) return pushed(stops[3], (t - AT.land[3]) / (AT.out - AT.land[3]), DRIFT * 2);
    if (t < AT.back) return between(lastHeld, wholeEnd, easeInOut((t - AT.out) / (AT.back - AT.out)));
    return pushed(wholeEnd, clamp01((t - AT.back) / (AT.end - AT.back)), PUSH * 0.6);
  };
  return { browser, page, camAt, rest: sight ? restOn(sight) : null, sight };
}

/** The pointer's way, in CSS px: off the map until the last place, onto its building, and away. */
function pointerPlan(stage: Stage): (t: number, onScreen: (p: Point) => Point) => Point {
  const away: Point = { x: W + 40, y: H * 0.78 };
  const gone: Point = { x: W + 40, y: H * 0.3 };
  const comeIn = AT.land[3] + 0.25;
  return (t, onScreen) => {
    if (!stage.rest || t < comeIn) return away;
    const target = onScreen(stage.rest);
    if (t < AT.lit) {
      const u = easeInOut(clamp01((t - comeIn) / (AT.lit - 0.05 - comeIn)));
      return { x: away.x + (target.x - away.x) * u, y: away.y + (target.y - away.y) * u };
    }
    // off it just before the bar, so the light is out as the view heads back
    const leave = AT.out - 0.45;
    if (t < leave) return target;
    const u = easeInOut(clamp01((t - leave) / 0.3));
    return { x: target.x + (gone.x - target.x) * u, y: target.y + (gone.y - target.y) * u };
  };
}

/**
 * Move the mouse there; off the page, it leaves the map: Chrome sends nothing for a mouse
 * outside the window, so the map is told (it lets go of the lit building) and the pointer hidden.
 */
async function pointTo(page: Page, p: Point, passing = false): Promise<void> {
  // on its way in, the pointer is only drawn: the map hears it once it is on the building, so
  // what it passes over on the way does not light up
  if (passing && p.x < W && p.y < H) {
    await page.evaluate(
      (x, y) => {
        const el = document.getElementById("film-pointer");
        if (!el) return;
        delete el.dataset.away;
        el.style.transform = `translate(${x - 1}px,${y - 1}px)`;
      },
      p.x,
      p.y,
    );
    return;
  }
  if (p.x < W && p.y < H) {
    await page.mouse.move(p.x, p.y);
    return;
  }
  await page.evaluate(() => {
    const el = document.getElementById("film-pointer");
    if (!el || el.dataset.away) return;
    el.dataset.away = "1";
    el.style.transform = "translate(-100px,-100px)";
    document
      .querySelector(".map-tiles")
      ?.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" }));
  });
}

async function take(world: string, part?: [number, number]): Promise<void> {
  const plan = planOf(world);
  const s = await stage(plan);
  const { browser, page, camAt } = s;
  const pointerAt = pointerPlan(s);
  const total = Math.round(AT.end * FPS);
  const first = part ? Math.round(part[0] * FPS) : 0;
  const lastFrame = part ? Math.min(total, Math.round(part[1] * FPS)) : total;
  fs.mkdirSync(TAKES, { recursive: true });
  const name = part ? `${world}-part.mp4` : `${world}.mp4`;
  const reel = openReel(path.join(TAKES, name), ROOT);
  const stills = path.join(OUT, "take", world);
  fs.mkdirSync(stills, { recursive: true });
  const lookAhead = async (frame: number): Promise<void> => {
    if (frame >= total) return;
    await jump(page, camAt(frame / FPS));
    await settle(page);
  };
  const onScreen = (p: Point): Promise<Point> =>
    page.evaluate((x, y) => (window as unknown as Viewer).tinyworld.mapToScreen(x, y), p.x, p.y);

  for (let i = 0; i < WARM_UP; i++) {
    await tick(page);
    await lookAhead(first + Math.min(i, AHEAD));
  }
  let held = false;
  let leftMap = false;
  let lit: string | null = null;
  const started = Date.now();
  for (let f = first; f < lastFrame; f++) {
    const t = f / FPS;
    await tick(page);
    await lookAhead(f + AHEAD);
    await jump(page, camAt(t));
    const screenRest = s.rest ? await onScreen(s.rest) : null;
    // the map hears the pointer only while it rests on the building: it leaves the map as it goes
    const resting = t >= AT.lit - 0.05 && t < AT.out - 0.45;
    if (!resting && t >= AT.lit && !leftMap) {
      leftMap = true;
      await page.evaluate(() =>
        document
          .querySelector(".map-tiles")
          ?.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse" })),
      );
    }
    await pointTo(
      page,
      pointerAt(t, () => screenRest ?? { x: 0, y: 0 }),
      !resting,
    );
    await settle(page);
    // the building under the pointer lights up; if the hover misses it, the engine is told
    if (s.sight && t >= AT.lit && t < AT.out - 0.45) {
      const hovered = await page.evaluate(() => (window as unknown as Viewer).tinyworld.sightState.hovered);
      if (hovered !== s.sight.id && !held) {
        console.warn(
          `take: ${world} at ${t.toFixed(2)} s the pointer is on ${hovered}: holding ${s.sight.id}`,
        );
        await page.evaluate((id) => (window as unknown as Viewer).tinyworld.holdSight(id), s.sight.id);
        held = true;
        await settle(page);
      }
      lit = hovered;
    }
    if (held && t >= AT.out - 0.45) {
      await page.evaluate(() => (window as unknown as Viewer).tinyworld.holdSight(null));
      held = false;
    }
    const frame = await shoot(page);
    await reel.write(frame);
    if (f % 30 === 0) fs.writeFileSync(path.join(stills, `t${t.toFixed(1)}.png`), frame);
    if (f % 60 === 0)
      console.log(`take: ${world} ${f}/${total} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  await reel.close();
  await browser.close();
  console.log(`take: social-city/assets/takes/${name}, frames ${first} to ${lastFrame}; lit: ${lit}`);
}

/** Look before filming: the take's picture at the landings (or the seconds given). */
async function stills(world: string, seconds: number[]): Promise<void> {
  const plan = planOf(world);
  const s = await stage(plan);
  const { browser, page, camAt } = s;
  const pointerAt = pointerPlan(s);
  const out = path.join(OUT, "stills");
  fs.mkdirSync(out, { recursive: true });
  const at = seconds.length ? seconds : [0, ...AT.land.map((t) => t + 0.6), AT.lit + 0.5, AT.end - 0.1];
  for (const t of at) {
    await jump(page, camAt(t));
    for (let i = 0; i < 8; i++) {
      await tick(page);
      await settle(page);
    }
    const rest = s.rest
      ? await page.evaluate(
          (x, y) => (window as unknown as Viewer).tinyworld.mapToScreen(x, y),
          s.rest.x,
          s.rest.y,
        )
      : { x: 0, y: 0 };
    await pointTo(
      page,
      pointerAt(t, () => rest),
      t < AT.lit - 0.05,
    );
    for (let i = 0; i < 8; i++) {
      await tick(page);
      await settle(page);
    }
    const hovered = await page.evaluate(() => (window as unknown as Viewer).tinyworld.sightState.hovered);
    fs.writeFileSync(path.join(out, `${world}-${t.toFixed(2)}.png`), await shoot(page));
    console.log(`still: ${world} ${t.toFixed(2)} s${hovered ? `, lit: ${hovered}` : ""}`);
  }
  await browser.close();
}

/**
 * Try framings before writing them into a plan: `look <world> lon,lat,scale[,rise[,dx[,sight]]] …`
 * → out/social/city/look/<world>-<i>.png, the sight (if any) held lit.
 */
async function look(world: string, spots: string[]): Promise<void> {
  const plan = planOf(world);
  const { browser, page } = await openLive(world, {
    view: VERTICAL,
    prefs: { lang: plan.lang },
    seed: 7,
    startMs: 30_000,
    userDataDir: path.join(OUT, "profiles", world),
  });
  await page.addStyleTag({ content: QUIET });
  await chrome(page, 0);
  const out = path.join(OUT, "look");
  fs.mkdirSync(out, { recursive: true });
  for (const [i, spot] of spots.entries()) {
    const [lon, lat, scale, rise = 0, dx = 0] = spot.split(",").slice(0, 5).map(Number);
    const sight = spot.split(",")[5] ?? null;
    const at = await page.evaluate(
      (lo, la) => (window as unknown as Viewer).tinyworld.projection.toMap(lo, la),
      lon,
      lat,
    );
    const kz = await page.evaluate(() => (window as unknown as Viewer).tinyworld.manifest.geo.kz);
    await jump(page, { x: at.x - dx / scale, y: at.y - rise * kz, scale });
    await page.evaluate((id) => (window as unknown as Viewer).tinyworld.holdSight(id), sight);
    for (let k = 0; k < 10; k++) {
      await tick(page);
      await settle(page);
    }
    fs.writeFileSync(path.join(out, `${world}-${i}.png`), await shoot(page));
    console.log(`look: ${world}-${i} ${spot}`);
  }
  await browser.close();
}

/** The composition's variables for one city. The address is the live site's, given at render time. */
function variables(plan: CityPlan): Record<string, string> {
  // never the placeholder: a short with example.com on its end card is no use to anyone
  const address = siteAddress();
  if (!address) throw new Error("No site address: set SITE_URL (or DEPLOY_URL in deploy/.env) to render");
  const words = WORDS[plan.lang];
  const accent = ACCENTS[plan.world];
  if (!accent) throw new Error(`no accent for ${plan.world}`);
  return {
    take: `assets/takes/${plan.world}.mp4`,
    code: plan.world.replace(/^tiny/, ""),
    accent,
    hook1: plan.hook[0],
    hook2: plan.hook[1],
    ...Object.fromEntries(
      plan.stops.flatMap((s, i) => [
        [`name${i + 1}`, s.name],
        [`area${i + 1}`, s.area],
      ]),
    ),
    find: words.find,
    note: words.note,
    address: `${address}/${plan.world}/`,
  };
}

/** Each world's colour, as the viewer has it (tinyworlds-frontend/src/worlds/<id>.ts). */
const ACCENTS: Record<string, string> = Object.fromEntries(
  fs
    .readdirSync(path.join(ROOT, "../tinyworlds-frontend/src/worlds"))
    .filter((f) => /^tiny.*\.ts$/.test(f))
    .map((f) => {
      const src = fs.readFileSync(path.join(ROOT, "../tinyworlds-frontend/src/worlds", f), "utf8");
      return [f.replace(/\.ts$/, ""), src.match(/accent:\s*{\s*color:\s*"(#[0-9a-fA-F]{6})"/)?.[1] ?? ""];
    }),
);

function render(worlds: string[], quality: string): void {
  fs.mkdirSync(OUT, { recursive: true });
  for (const world of worlds) {
    const plan = planOf(world);
    if (!fs.existsSync(path.join(TAKES, `${world}.mp4`))) throw new Error(`no take for ${world}`);
    const raw = path.join(OUT, `${world}-raw.mp4`);
    run(
      "npx",
      [
        "hyperframes",
        "render",
        "--quality",
        quality,
        "--output",
        raw,
        "--variables",
        JSON.stringify(variables(plan)),
      ],
      PROJECT,
    );
    // what the apps want: H.264 + AAC, yuv420p, the index first
    const file = path.join(OUT, `${world}.mp4`);
    run(
      "ffmpeg",
      [
        "-v", "error", "-y", "-i", raw,
        "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-profile:v", "high",
        "-r", String(FPS), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", file,
      ], // prettier-ignore
      OUT,
    );
    fs.rmSync(raw);
    console.log(`render: ${path.relative(ROOT, file)} ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
  }
}

const [what, ...rest] = process.argv.slice(2);
const flagAt = rest.indexOf("--quality");
const quality = flagAt >= 0 ? rest.splice(flagAt, 2)[1] : "delivery";
if (what === "take") {
  const only = rest.indexOf("--only");
  await take(rest[0], only >= 0 ? [Number(rest[only + 1]), Number(rest[only + 2])] : undefined);
} else if (what === "stills") await stills(rest[0], rest.slice(1).map(Number));
else if (what === "render") render(rest.length ? rest : PLANS.map((p) => p.world), quality);
else if (what === "look") await look(rest[0], rest.slice(1));
else if (what === "vars") console.log(JSON.stringify(variables(planOf(rest[0])), null, 2));
else {
  console.error(
    "usage: city.ts stills <world> [seconds…] | take <world> [--only a b] | render [world…] [--quality q]",
  );
  process.exit(2);
}
await sleep(0);
