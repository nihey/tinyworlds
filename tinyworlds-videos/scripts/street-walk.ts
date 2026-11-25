import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "puppeteer-core";
import {
  between,
  easeInOut,
  FPS,
  jump,
  openReel,
  openStage,
  settle,
  shoot,
  sleep,
  VIEW,
  type Cam,
} from "./lib/film.js";

import { DRIVE_SHOTS, driveResult, isDriveName, stageDrive, type DriveName } from "./street-walk-drive.js";

const VIEWER = process.env.VIEWER_URL ?? "http://127.0.0.1:3177/";
const PROJECT = path.resolve("street-walk");
const TAKES = path.join(PROJECT, "assets", "takes");

interface WalkGame {
  look(dx: number, dy: number): void;
}

type StageWindow = Window & {
  __film: { advance(ms: number): void; flush(): void };
  tinyworld: { projection: { toMap(lon: number, lat: number): { x: number; y: number } } };
  filmWalk?: () => WalkGame;
};

const FILM_STYLE = `
  .walk-pane .sign.top-\\[62\\%\\] { display: none !important; }
  .walk-minimap { visibility: hidden !important; }
  .walk-capture-clean .walk-pane .sign { visibility: hidden !important; }
`;

async function frames(page: Page, count: number, lookX = 0, lookY = 0) {
  await page.evaluate(
    ({ count, step, lookX, lookY }) => {
      const stage = window as unknown as StageWindow;
      if (lookX || lookY) stage.filmWalk?.().look(lookX, lookY);
      for (let i = 0; i < count; i++) {
        stage.__film.advance(step);
        stage.__film.flush();
      }
    },
    { count, step: 1000 / FPS, lookX, lookY },
  );
}

async function findGame(page: Page) {
  // The minimap receives the live game as a prop. The take uses the game's own camera input
  // and positions between edits; rendered movement and vehicle entry use the actual game.
  await page.evaluate(() => {
    type Fiber = { memoizedProps?: { game?: WalkGame }; return?: Fiber };
    (window as unknown as StageWindow).filmWalk = () => {
      const minimap = document.querySelector(".walk-minimap");
      const react = minimap && Object.keys(minimap).find((key) => key.startsWith("__reactFiber$"));
      let fiber = react ? (minimap as unknown as Record<string, Fiber>)[react] : undefined;
      while (fiber) {
        const game = fiber.memoizedProps?.game;
        if (game) return game;
        fiber = fiber.return;
      }
      throw new Error("Street Walk has no live game");
    };
  });
}

async function walkReady(page: Page) {
  for (let i = 0; i < 80; i++) {
    await frames(page, 3);
    const ready = await page.evaluate(
      () =>
        Boolean(document.querySelector(".walk-minimap")) &&
        !document.querySelector(".walk-pane [role='status']:not([aria-live])"),
    );
    if (ready) {
      await findGame(page);
      await page.keyboard.press("BracketLeft");
      await frames(page, 6);
      return;
    }
    await sleep(70);
  }
  throw new Error("Street Walk did not load");
}

async function walkAt(page: Page, coordinates: string) {
  await page.evaluate((spot) => {
    location.hash = `walk=${spot}`;
  }, coordinates);
  await walkReady(page);
}

async function camera(page: Page, lon: number, lat: number, scale: number): Promise<Cam> {
  return page.evaluate(
    ({ lon, lat, scale }) => ({
      ...(window as unknown as StageWindow).tinyworld.projection.toMap(lon, lat),
      scale,
    }),
    { lon, lat, scale },
  );
}

async function take(page: Page, name: string, length: number, act: (frame: number) => Promise<void>) {
  const output = path.join(TAKES, `${name}.mp4`);
  const temp = path.join(TAKES, `.${name}.mp4`);
  const reel = openReel(temp, PROJECT);
  console.log(`Filming ${name} (${length}s)`);
  try {
    try {
      for (let frame = 0; frame < Math.round(length * FPS); frame++) {
        await act(frame);
        await reel.write(await shoot(page));
      }
    } finally {
      await reel.close();
    }
    await fs.rename(temp, output);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
  console.log(`Saved ${output}`);
}

async function mapTake(page: Page) {
  const near = await camera(page, -73.98554, 40.75799, 1.2);
  const wide = await camera(page, -73.9862, 40.75648, 0.6);
  const selector = 'button[aria-label="Walk the streets"]';
  const person = await page.$eval(selector, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await jump(page, wide);
  await settle(page);
  await take(page, "drop", 5.5, async (f) => {
    if (f <= 66) {
      await jump(page, between(wide, near, easeInOut(f / 66)));
      await settle(page);
    } else if (f <= 92) {
      const u = easeInOut((f - 66) / 26);
      await page.mouse.move(VIEW.width + (person.x - VIEW.width) * u, person.y + 65 * (1 - u));
    } else if (f === 100) {
      await page.mouse.down();
    } else if (f >= 101 && f <= 145) {
      const u = easeInOut((f - 100) / 45);
      await page.mouse.move(
        person.x + (VIEW.width / 2 - person.x) * u,
        person.y + (VIEW.height / 2 - person.y) * u + Math.sin(Math.PI * u) * 34,
      );
    }
    await frames(page, 1);
  });
  await page.mouse.up();
  await walkReady(page);
}

async function driveTake(page: Page, name: DriveName) {
  const shot = DRIVE_SHOTS[name];
  await walkAt(page, `${shot.lat},${shot.lon},${shot.heading}`);
  for (let pass = 0; pass < 11; pass++) {
    await frames(page, 6);
    await sleep(65);
  }
  await stageDrive(page, name);
  await take(page, name, shot.seconds, () => frames(page, 1));
  console.log(name, await driveResult(page));
}

const requested = process.argv.slice(2);
const shotNames = ["tease", "drop", "walk", ...Object.keys(DRIVE_SHOTS), "bridge"];
if (requested.some((name) => !shotNames.includes(name))) {
  throw new Error(`Choose a take: ${shotNames.join(", ")}`);
}
await fs.mkdir(TAKES, { recursive: true });

for (const name of requested.length ? requested : shotNames) {
  const seed = isDriveName(name)
    ? `(() => { let n = 330823; Math.random = () => ((n = Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296; })();`
    : undefined;
  const { page, browser } = await openStage(VIEWER, 0, seed);
  try {
    await page.addStyleTag({ content: FILM_STYLE });
    if (name === "drop") {
      await mapTake(page);
    } else if (isDriveName(name)) {
      await driveTake(page, name);
    } else if (name === "tease") {
      await walkAt(page, "40.75817,-73.98560,208");
      await page.evaluate(() => document.documentElement.classList.add("walk-capture-clean"));
      await page.keyboard.down("w");
      await take(page, "tease", 2.5, (f) => frames(page, 1, 1.2, f < 50 ? -0.8 : 0));
    } else if (name === "walk") {
      await walkAt(page, "40.75804,-73.98550,29");
      await page.keyboard.down("w");
      await take(page, "walk", 6.5, async (f) => {
        if (f === 106) await page.keyboard.press("Space");
        if (f === 133) await page.keyboard.up("w");
        if (f === 159) await page.keyboard.down("w");
        await frames(page, 1, f >= 110 ? 1.4 : -0.55, f < 48 ? -0.55 : 0);
      });
    } else {
      await walkAt(page, "40.70319,-73.99337,305");
      await page.keyboard.down("w");
      await take(page, "bridge", 8, async (f) => {
        if (f === 62) await page.keyboard.up("w");
        await frames(page, 1, f > 65 ? -0.66 : 0.08, f > 65 ? -0.21 : -0.12);
      });
    }
  } finally {
    await browser.close();
  }
}
