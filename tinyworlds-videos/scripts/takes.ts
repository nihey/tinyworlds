import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { boroughs } from "./lib/boroughs.js";
import {
  FPS,
  VIEW,
  between,
  chrome,
  clamp01,
  easeInOut,
  jump,
  openReel,
  openStage,
  settle,
  shoot,
  sleep,
  through,
  tick,
  type Cam,
} from "./lib/film.js";
import { ROOT } from "./lib/world.js";

/**
 * Film what the showcase film is made of, from the real site running locally:
 *
 *   npm run takes -- main   one continuous take of the New York map (VIEWER_URL, a dev server
 *                           started with NEXT_PUBLIC_WORLD=tinynyc): out from the Empire State
 *                           Building's crown to the whole city, the five boroughs outlined one
 *                           by one, a search typed into the viewer's own sign, its flight to
 *                           the Statue of Liberty, a ferry coming in, and out again.
 *                           `--until <seconds>` films only the start, to main-part.mp4.
 *   npm run takes -- page   the front page (HOME_URL, NEXT_PUBLIC_WORLD=home), whole, as one
 *                           still, with where its pictures are, for the film to bring to life.
 *
 * Both land in film/assets/takes/ (not committed) with a .json beside them: the moments and the
 * places on screen the film's own layers are timed and set to.
 */
const TAKES = path.join(ROOT, "film/assets/takes");

/** The film's clock, seconds, on the music's beats (120 BPM, the first at 0.04 s). */
const AT = {
  arrive: 6.3, // the whole city is in view, at rest
  boroughs: 6.54, // the first borough is outlined; the next ones follow, one every half beat
  wide: 8.04, // the title lands
  clear: 9.74, // the outlines go: the title is turning into the search sign
  signs: 10.04, // the viewer's signs appear
  click: 10.54, // the search field is clicked
  type: 10.74, // typing starts
  choose: 12.54, // the first result is clicked: the map flies there
  statue: 14.8, // landed at its foot: the view backs off until the whole statue shows
  ferry: 17.2, // the map is flown on to the slip
  out: 20.04, // the signs go, the view pulls back
  end: 22.04, // the whole city again: the take ends
};
/** The boroughs, in the order they are named: each is outlined, and lit while it is the newest. */
const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
const BOROUGH_EVERY = 0.25;
const QUERY = "statue of liberty";
const KEY_FRAMES = 2.6; // frames between keystrokes

/** The map's clock when the film starts: set so a ferry is sailing in to Liberty Island's
 *  slip while the camera is there (it ties up about 90.5 s into the map's time). */
const MAP_CLOCK_START = 69_400;
/** Frames run before the first one kept, so the opening view has its tiles and they have faded in. */
const WARM_UP = 15;

const frameOf = (seconds: number): number => Math.round(seconds * FPS);

interface Engine {
  projection: { toMap(lon: number, lat: number): { x: number; y: number } };
  mapToScreen(x: number, y: number): { x: number; y: number };
  setHoods(hoods: unknown[]): void;
  setHoodLines(on: boolean): void;
  manifest: { bounds: { minX: number; minY: number; maxX: number; maxY: number }; geo: { kz: number } };
  flyToMap(target: Cam): void;
  getView(): Cam;
}
type Viewer = Window & { tinyworld: Engine };

async function main(): Promise<void> {
  const url = process.env.VIEWER_URL ?? "http://localhost:3000/";
  const { browser, page } = await openStage(url, MAP_CLOCK_START - (WARM_UP * 1000) / FPS);
  const world = await page.evaluate(() => {
    const engine = (window as unknown as Viewer).tinyworld;
    const b = engine.manifest.bounds;
    return {
      tower: engine.projection.toMap(-73.9857, 40.7484), // the Empire State Building's foot
      statue: engine.projection.toMap(-74.0445, 40.6892), // the Statue of Liberty's
      dock: engine.projection.toMap(-74.048, 40.69), // Liberty Island's ferry slip
      centre: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
      kz: engine.manifest.geo.kz,
    };
  });
  // the views the take moves between
  // the Empire State Building's crown, where the mast rises from the top deck: close enough to count windows
  const crown: Cam = { x: world.tower.x, y: world.tower.y - 340 * world.kz, scale: 2.6 };
  // the whole tower among its neighbours
  const tower: Cam = { x: world.tower.x, y: world.tower.y - 160 * world.kz, scale: 0.52 };
  const city: Cam = { x: world.centre.x, y: world.centre.y + 1500, scale: 0.0066 };
  // The way out, in octaves of zoom by the second: a slow start so the crown can be read, most
  // of the time spent where there is most to see (the tower, Midtown, Manhattan), then quickly
  // through the far octaves to rest on the whole city.
  const toTower = Math.log2(crown.scale / tower.scale);
  const toCity = Math.log2(crown.scale / city.scale);
  const octaves = through([
    [0, 0],
    [0.5, 0.22],
    [2.1, toTower],
    [3.7, 4.4],
    [5.0, 6.5],
    [AT.arrive - 0.1, toCity],
    [AT.arrive, toCity],
  ]);
  const opening = (t: number): Cam => {
    const out = octaves(t);
    if (out <= toTower) {
      // down the tower as it comes into view: the centre eases from the crown to its middle
      const u = easeInOut(out / toTower);
      return {
        x: crown.x + (tower.x - crown.x) * u,
        y: crown.y + (tower.y - crown.y) * u,
        scale: crown.scale / 2 ** out,
      };
    }
    return between(tower, city, (out - toTower) / (toCity - toTower));
  };
  // the five boroughs as districts, for the viewer's own district lines to draw
  const districts = boroughs("tinynyc", BOROUGHS);
  // the statue whole: the search lands at its foot, with the figure out of the top of the picture
  const statue: Cam = { x: world.statue.x, y: world.statue.y - 45 * world.kz, scale: 1.3 };
  // where the ferry ties up, the pier and the island's corner on the right
  const slip: Cam = { x: world.dock.x + 60, y: world.dock.y + 60, scale: 2.6 };

  const untilAt = process.argv.indexOf("--until");
  const until = untilAt >= 0 ? Number(process.argv[untilAt + 1]) : AT.end;
  const total = frameOf(until) + 1;
  const name = untilAt >= 0 ? "main-part.mp4" : "main.mp4";
  const reel = openReel(path.join(TAKES, name), ROOT);
  const marks: Record<string, unknown> = { fps: FPS, frames: total, at: AT, query: QUERY };
  let typed = 0;
  let landed: Cam | null = null;
  // the pointer: where it is each frame (CSS px), so hovers in the take match the film's cursor
  const rest = { x: VIEW.width + 40, y: VIEW.height * 0.62 };
  let field = rest;
  let result = rest;
  const pointerAt = (t: number): { x: number; y: number } => {
    const move = (from: typeof rest, to: typeof rest, start: number, end: number) => {
      const u = easeInOut(clamp01((t - start) / (end - start)));
      return { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u };
    };
    if (t < AT.click - 0.04) return move(rest, field, AT.signs + 0.05, AT.click - 0.06);
    if (t < AT.choose - 0.42) return field;
    if (t < AT.choose + 0.2) return move(field, result, AT.choose - 0.42, AT.choose - 0.06);
    return move(result, { x: result.x + 260, y: VIEW.height + 60 }, AT.choose + 0.2, AT.choose + 0.8);
  };

  let outlined = 0;
  await chrome(page, 0);
  await jump(page, crown);
  for (let i = 0; i < WARM_UP; i++) {
    await tick(page);
    await settle(page);
  }
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    await tick(page);

    if (t <= AT.arrive) {
      await jump(page, opening(t));
    } else if (t >= AT.statue && t < AT.ferry) {
      landed ??= await page.evaluate(() => {
        const v = (window as unknown as Viewer).tinyworld.getView();
        return { x: v.x, y: v.y, scale: v.scale };
      });
      await jump(page, between(landed, statue, easeInOut(clamp01((t - AT.statue) / 1.2))));
    } else if (t >= AT.out) {
      await jump(page, between(slip, city, easeInOut(clamp01((t - AT.out) / (AT.end - AT.out)))));
    }
    // the boroughs: one more outlined every half beat, the pointer on the newest so the viewer
    // lights it; then the pointer leaves and all five stand outlined
    const due = Math.min(BOROUGHS.length, Math.floor((t - AT.boroughs) / BOROUGH_EVERY + 1e-6) + 1);
    if (t >= AT.boroughs && t < AT.clear && outlined < due) {
      outlined = due;
      const newest = districts[outlined - 1];
      const at = await page.evaluate(
        (shown, lon, lat) => {
          const engine = (window as unknown as Viewer).tinyworld;
          engine.setHoods(shown);
          engine.setHoodLines(true);
          const p = engine.projection.toMap(lon, lat);
          return engine.mapToScreen(p.x, p.y);
        },
        districts.slice(0, outlined),
        newest.lon,
        newest.lat,
      );
      await page.mouse.move(at.x - 3, at.y - 3);
      await page.mouse.move(at.x, at.y);
    }
    if (f === frameOf(AT.boroughs + BOROUGHS.length * BOROUGH_EVERY))
      await page.mouse.move(40, VIEW.height - 30);
    if (f === frameOf(AT.clear)) {
      await page.evaluate(() => (window as unknown as Viewer).tinyworld.setHoodLines(false));
    }
    // the signs come and go over a third of a second
    if (t >= AT.signs && t < AT.out) await chrome(page, clamp01((t - AT.signs) / 0.3));
    if (t >= AT.out) await chrome(page, 1 - clamp01((t - AT.out) / 0.3));

    if (f === frameOf(AT.signs)) {
      const box = await page.$eval('input[type="search"], input[role="combobox"], .sign-in input', (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      });
      field = { x: box.x + Math.min(110, box.width * 0.4), y: box.y + box.height / 2 };
      marks.field = field;
    }
    if (t > AT.signs && t < AT.choose + 0.9) {
      const p = pointerAt(t);
      await page.mouse.move(p.x, p.y);
    }
    if (f === frameOf(AT.click)) await page.mouse.click(field.x, field.y);
    if (t >= AT.type && typed < QUERY.length && f >= frameOf(AT.type) + Math.round(typed * KEY_FRAMES)) {
      await page.keyboard.type(QUERY[typed]);
      typed++;
      if (typed === QUERY.length) marks.typed = t;
      await sleep(40); // React draws the results on its own time
    }
    if (f === frameOf(AT.choose - 0.45)) {
      const box = await page.$eval('[role="option"]', (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height, text: el.textContent ?? "" };
      });
      result = { x: box.x + Math.min(150, box.width * 0.45), y: box.y + box.height / 2 };
      marks.result = { ...result, box };
    }
    if (f === frameOf(AT.choose)) {
      await page.mouse.click(result.x, result.y);
      await sleep(60);
    }
    if (f === frameOf(AT.ferry)) {
      await page.evaluate((cam) => (window as unknown as Viewer).tinyworld.flyToMap(cam), slip);
    }

    await settle(page);
    await reel.write(await shoot(page));
    if (f % 60 === 0) console.log(`take: main ${f}/${total}`);
    if (f === total - 1 && untilAt < 0)
      fs.writeFileSync(path.join(TAKES, "main-last.png"), await shoot(page));
  }
  await reel.close();
  if (untilAt < 0) fs.writeFileSync(path.join(TAKES, "main.json"), JSON.stringify(marks, null, 2) + "\n");
  await browser.close();
  console.log(`take: film/assets/takes/${name}, ${total} frames (${(total / FPS).toFixed(2)} s)`);
}

/** The front page as one tall still at twice its size, its films stopped, and where things are. */
async function frontPage(): Promise<void> {
  const url = process.env.HOME_URL ?? "http://localhost:3000/";
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    headless: true,
    args: ["--hide-scrollbars", "--force-color-profile=srgb"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
    { name: "prefers-color-scheme", value: "light" },
  ]);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 120_000 });
  await page.addStyleTag({
    content: "nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }",
  });
  // every picture, lazy ones too, before the still is taken
  await page.evaluate(async () => {
    for (const img of document.querySelectorAll("img")) img.loading = "eager";
    await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
  });
  await sleep(400);
  // (as source text: a helper function compiled here would not exist in the page)
  const rects = (await page.evaluate(`(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
    };
    const cards = [...document.querySelectorAll("section li > a")].map((a) => ({
      href: a.getAttribute("href"),
      card: box(a),
      picture: box(a.querySelector("img")),
    }));
    const header = document.querySelector("header");
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      hero: box(header && header.querySelector("img")),
      sign: box(header && header.querySelector(".sign")),
      action: box(header && header.querySelector("a")),
      cards,
    };
  })()`)) as { width: number; height: number } & Record<string, unknown>;
  const still = path.join(TAKES, "page.png");
  await page.screenshot({ path: still as `${string}.png`, fullPage: true });
  fs.writeFileSync(path.join(TAKES, "page.json"), JSON.stringify({ scale: 2, ...rects }, null, 2) + "\n");
  await browser.close();

  // the hero's sign on its own, so the film can run the hero's loop behind it
  const sign = rects.sign as { x: number; y: number; width: number; height: number };
  await sharp(still)
    .extract({
      left: Math.round(sign.x * 2),
      top: Math.round(sign.y * 2),
      width: Math.round(sign.width * 2),
      height: Math.round(sign.height * 2),
    })
    .toFile(path.join(TAKES, "page-sign.png"));
  // and the loops themselves, as rendered (`npm run loops`, `npm run flyovers`), not as squeezed for the web
  fs.mkdirSync(path.join(TAKES, "loops"), { recursive: true });
  for (const { href } of rects.cards as { href: string }[]) {
    const id = href.replaceAll("/", "");
    const render = path.join(ROOT, "loop/renders", `${id}.mp4`);
    if (fs.existsSync(render)) fs.copyFileSync(render, path.join(TAKES, "loops", `${id}.mp4`));
  }
  fs.copyFileSync(path.join(ROOT, "flyover/renders/hero.mp4"), path.join(TAKES, "hero.mp4"));
  console.log(
    `take: film/assets/takes/page.png (${rects.width} × ${rects.height} CSS px, twice that in the still)`,
  );
}

fs.mkdirSync(TAKES, { recursive: true });
const what = process.argv[2];
if (what === "main") await main();
else if (what === "page") await frontPage();
else {
  console.error("usage: npm run takes -- main | page");
  process.exit(2);
}
