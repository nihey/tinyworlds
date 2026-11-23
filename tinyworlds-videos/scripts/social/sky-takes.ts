// The takes of "From the sky to the sidewalk" (social-sky/), filmed on the live site in one
// session: all of San Francisco on the map, down to the Golden Gate, the little person carried
// out of the tools and dropped on the bridge's deck (the viewer's own drop), then the walk that
// opens there: a camera craning down from the map's own angle to a red car driving north under
// the south tower and its cables.
//   SITE_URL=… npm exec -- tsx scripts/social/sky-takes.ts [map] [drive]
import fs from "node:fs/promises";
import path from "node:path";
import { between, chrome, clamp01, easeInOut, jump, settle, sleep, through, type Cam } from "../lib/film.js";
import { LANDSCAPE, openLive } from "../lib/live.js";
import { filmTake, idle, js, squaresIn, still, walkAt, walkReady, WALK_CLEAN } from "./sky-lib.js";
import { openReel, shoot } from "../lib/film.js";

const DIR = path.resolve("social-sky/assets/takes");
const STILLS = path.resolve("out/social/sky-stills");
const PROGRESS = path.resolve("out/social/sky-progress.txt");
const FPS = 30;
const t0 = Date.now();
const log = async (...a: unknown[]) => {
  const line = `[${((Date.now() - t0) / 1000).toFixed(0)}s] ${a.map(String).join(" ")}`;
  console.log(line);
  await fs.appendFile(PROGRESS, line + "\n");
};

/** The map take's moments, in film seconds (the music's: its bed enters at 1.0 s of the file). */
const MAP = {
  pushEnd: 3.24, // the whole city, a slow push
  zoomEnd: 8.0, // down to the Golden Gate
  toolsIn: 6.75, // the tools fade in
  pick: 7.4, // the person picked up
  over: 9.0, // over the deck
  drop: 9.833, // let go: the cut to the street
};
const BOUNDS = { minX: -30250, minY: -13525, maxX: 21950, maxY: 15275 };
const WHOLE: Cam = {
  x: (BOUNDS.minX + BOUNDS.maxX) / 2,
  y: (BOUNDS.minY + BOUNDS.maxY) / 2 - 300,
  scale: (LANDSCAPE.width / (BOUNDS.maxX - BOUNDS.minX)) * 1.02,
};
/** How far into the zoom (0 to 1, in octaves) the slow push of the opening goes. */
const PUSH = 0.07;
const DRIVE_SECONDS = 19.5;

interface Deck {
  e: number;
  n: number;
  z: number;
  yaw: number;
  width: number;
  lon: number;
  lat: number;
  tower: { e: number; n: number; top: number };
}

const wanted = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ["map", "drive"]);
await fs.mkdir(STILLS, { recursive: true });
await fs.mkdir(path.dirname(PROGRESS), { recursive: true });

const { browser, page } = await openLive("tinysfo", { view: LANDSCAPE, seed: 7 });
try {
  page.on("console", (m) =>
    m.type() === "error" ? console.log("page:", m.text().slice(0, 200)) : undefined,
  );
  await page.addStyleTag({ content: WALK_CLEAN });

  // 1. A first walk by the south tower, to find the deck and the tower (and have its squares in
  // the browser's cache for the drop). The pixels a size finer, as the earlier films had them.
  await walkAt(page, "37.8106,-122.4776,354");
  await page.keyboard.press("BracketLeft");
  await idle(page, 4);
  const deck = await js<Deck | null>(
    page,
    `(() => { const s = window.__sky;
      const near = s.en(37.8116, -122.4776);
      const towers = s.tallest(near.e, near.n, 400, 6).filter((v) => v.top > 120);
      if (!towers.length) return null;
      const t = towers[0];
      const at = s.deckNear(t.e, t.n, 30);
      if (!at) return null;
      let yaw = at.yaw; if (Math.cos(yaw) < 0) yaw += Math.PI;   // northbound
      const back = { e: t.e - Math.sin(yaw) * 175, n: t.n - Math.cos(yaw) * 175 };
      const p = s.deckNear(back.e, back.n, 30);
      if (!p) return null;
      const ll = s.lonLat(p.e, p.n);
      return { e: p.e, n: p.n, z: p.z, yaw, width: p.width, lon: ll.lon, lat: ll.lat, tower: { e: t.e, n: t.n, top: t.top }, towers };
    })()`,
  );
  await log("deck", JSON.stringify(deck));
  if (!deck) throw new Error("the deck or its tower was not found");
  await page.keyboard.press("KeyM");
  for (let i = 0; i < 200; i++) {
    await idle(page, 2);
    if (!(await page.evaluate(() => Boolean(document.querySelector(".walk-minimap"))))) break;
    await sleep(50);
  }
  await chrome(page, 0);

  // where the deck is drawn on the map: its ground point raised by its height
  const drawn = await js<{ x: number; y: number; kz: number }>(
    page,
    `(() => { const p = tinyworld.projection.toMap(${deck.lon}, ${deck.lat}); const kz = ${2.449489742783178};
      return { x: p.x, y: p.y - ${deck.z} * kz, kz }; })()`,
  );
  const GG: Cam = { x: drawn.x + 40, y: drawn.y - 60, scale: 0.3 };
  await log("drawn", JSON.stringify(drawn));

  if (wanted.has("map")) {
    const person = await page.$eval('button[aria-label="Walk the streets"]', (el) => {
      el.closest(".sign-in")?.classList.add("film-keep", "film-tools");
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.addStyleTag({ content: `.film-tools { opacity: var(--film-tools, 0) !important; }` });
    await log("person at", JSON.stringify(person));

    // the zoom by the second: a slow push, then down in octaves (never overshooting)
    const zoom = through([
      [0, 0],
      [MAP.pushEnd, PUSH],
      [MAP.zoomEnd, 1],
    ]);
    const camAt = (t: number): Cam => {
      const u =
        t <= MAP.pushEnd
          ? zoom(t)
          : PUSH + (1 - PUSH) * easeInOut((t - MAP.pushEnd) / (MAP.zoomEnd - MAP.pushEnd));
      const c = between(WHOLE, GG, clamp01(u));
      // a breath of drift while it hovers, so the picture never stops
      const after = Math.max(0, t - MAP.zoomEnd);
      return { x: c.x + after * 6, y: c.y - after * 4, scale: c.scale * (1 + after * 0.012) };
    };
    const screen = (c: Cam) => ({
      x: (drawn.x - c.x) * c.scale + LANDSCAPE.width / 2,
      y: (drawn.y - c.y) * c.scale + LANDSCAPE.height / 2,
    });

    // the opening frame whole: tiles in and faded in before the first picture
    await jump(page, camAt(0));
    for (let i = 0; i < 6; i++) {
      await settle(page);
      await idle(page, 10);
      await sleep(200);
    }
    await settle(page);
    await still(page, path.join(STILLS, "map-0.png"));

    const frames = Math.round(MAP.drop * FPS);
    const reelFile = path.join(DIR, "sky-map.mp4");
    await fs.mkdir(DIR, { recursive: true });
    const reel = openReel(path.join(DIR, ".sky-map.mp4"), DIR);
    let down = false;
    for (let f = 0; f < frames; f++) {
      const t = f / FPS;
      const c = camAt(t);
      await jump(page, c);
      const tools = clamp01((t - MAP.toolsIn) / 0.4);
      await page.evaluate(
        (o) => document.documentElement.style.setProperty("--film-tools", String(o)),
        1 - (1 - tools) ** 3,
      );
      if (t >= MAP.pick && !down) {
        await page.mouse.move(person.x, person.y);
        await page.mouse.down();
        down = true;
      } else if (down) {
        const target = screen(c);
        const u = easeInOut(clamp01((t - MAP.pick) / (MAP.over - MAP.pick)));
        const arc = Math.sin(Math.PI * u) * 40;
        const sway = t > MAP.over ? Math.sin((t - MAP.over) * 5) * 2 : 0;
        await page.mouse.move(
          person.x + (target.x - person.x) * u + sway,
          person.y + (target.y - person.y) * u - arc,
        );
        await sleep(90); // the drop's squares under the pointer come in on the network's time
      }
      await settle(page);
      await sleep(15);
      await page.evaluate("window.__sky.syncAnimations()");
      await reel.write(await shoot(page));
      // the clock on by a frame, the page's own frame drawn at that time on the next settle
      await page.evaluate("window.__film.advance(1000 / 30)");
      if (f % 15 === 0) await log("map frame", f, JSON.stringify(c));
      if ([0, 97, 180, 222, 240, 270, frames - 1].includes(f))
        await still(page, path.join(STILLS, `map-${f}.png`));
    }
    await reel.close();
    await fs.rename(path.join(DIR, ".sky-map.mp4"), reelFile);
    await log("map take written");
    await page.mouse.up();
    await walkReady(page);
  } else {
    await walkAt(
      page,
      `${deck.lat.toFixed(6)},${deck.lon.toFixed(6)},${((deck.yaw * 180) / Math.PI + 360) % 360}`,
    );
  }

  if (wanted.has("drive")) {
    const at = await js(page, "window.__sky.game().position()");
    await log("walk opened at", JSON.stringify(at));
    await js(
      page,
      `(() => { const s = window.__sky, g = s.game(), o = ${JSON.stringify(deck)};
        const p = g.position();
        if (p.z < 30) g.teleport(o.e, o.n, o.z, o.yaw);
        // the inner lane of the northbound half: the tower's legs pass well clear either side
        const right = o.width > 12 ? 1.7 : 0, si = Math.sin(o.yaw), co = Math.cos(o.yaw);
        const e = o.e + co * right, n = o.n - si * right;
        s.clear(e, n, o.yaw, 15, 260, 1.8);
        s.vehicle({ kind: "supercar", color: 0, e, n, z: o.z, yaw: o.yaw, v: 22, enter: true });
        g.stick(0, -0.65);
        s.setBefore("if (car && car.v > 24) car.v = 24;");
      })()`,
    );
    // the camera: from above the deck (the map's view) craning down behind the car; each key
    // is where it is (back of, beside, above the car) and what it looks at (ahead of the car, up)
    const keys = [
      { t: 0.0, back: 60, side: 0, up: 100, ahead: 0, lift: 0, fov: 60 },
      { t: 2.9, back: 10, side: 0, up: 3.4, ahead: 30, lift: 2, fov: 70 },
      { t: 5.0, back: 9, side: 0, up: 2.6, ahead: 30, lift: 9, fov: 72 },
      // through the tower's portal (the edit cuts away before it), then at once beside the deck,
      // well past the tower, drawing back over the main span
      { t: 8.79, back: 9, side: 0, up: 2.6, ahead: 30, lift: 9, fov: 72 },
      { t: 8.8, back: 24, side: 18, up: 16, ahead: 18, lift: 0, fov: 62 },
      { t: DRIVE_SECONDS, back: 30, side: 24, up: 24, ahead: 18, lift: 0, fov: 58 },
    ];
    await js(
      page,
      `(() => { const s = window.__sky; s.keys = ${JSON.stringify(keys)}; s.t0 = null; s.cy = null;
        s.setCam(\`
          const s = window.__sky; if (!car) return null;
          if (s.t0 == null) s.t0 = t;
          const k = s.keys, tt = t - s.t0;
          let i = 0; while (i < k.length - 2 && tt > k[i + 1].t) i++;
          const a = k[i], b = k[i + 1];
          let u = Math.max(0, Math.min(1, (tt - a.t) / (b.t - a.t))); u = u * u * (3 - 2 * u);
          const L = (name) => a[name] + (b[name] - a[name]) * u;
          if (s.cy == null) s.cy = car.yaw;
          let d = car.yaw - s.cy; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          s.cy += d * Math.min(1, dt * 3);
          const si = Math.sin(s.cy), co = Math.cos(s.cy), back = L("back"), side = L("side"), ahead = L("ahead");
          const e = car.e - si * back + co * side, n = car.n - co * back - si * side, z = car.z + L("up");
          const te = car.e + si * ahead, tn = car.n + co * ahead, tz = car.z + 0.8 + L("lift");
          const yaw = Math.atan2(te - e, tn - n), pitch = Math.atan2(tz - z, Math.hypot(te - e, tn - n));
          return { e, n, z, yaw, pitch, fov: L("fov") };\`); })()`,
    );
    // the squares round the crane's first place, then back to the start of the take
    await squaresIn(page, 3, 6);
    await js(page, "window.__sky.t0 = null");
    await still(page, path.join(STILLS, "drive-pre.png"));
    await filmTake(page, DIR, "sky-drive", Math.round(DRIVE_SECONDS * FPS), undefined, async (f) => {
      await log(
        "drive frame",
        f,
        JSON.stringify(
          await js(
            page,
            "(() => { const c = window.__sky.car; return { e: c.e.toFixed(1), n: c.n.toFixed(1), z: c.z.toFixed(1), v: c.v.toFixed(1), st: c.state }; })()",
          ),
        ),
      );
      if (f % 60 === 0) await still(page, path.join(STILLS, `drive-${f}.png`));
    });
  }
} finally {
  await browser.close();
}
await log("done");
