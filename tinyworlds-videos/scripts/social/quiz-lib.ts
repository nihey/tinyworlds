import type { Page } from "puppeteer-core";
import sharp from "sharp";
import { FPS, settle, sleep } from "../lib/film.js";

/**
 * Helpers for the "Guess the building" shorts (`quiz-take.ts`): playing the live viewer's own
 * game on the film's clock. Code that runs in the page is passed as strings (tsx would wrap a
 * function defined inside `page.evaluate` with a helper the page does not have).
 */

type Film = { advance(ms: number): void; flush(): void; now(): number };
export type FilmWindow = Window & { __film: Film };

/** The languages of the series: Ribeirão Preto in Portuguese, Valencia and El Calafate in Spanish. */
export function langOf(world: string): "en-US" | "pt-BR" | "es-ES" {
  if (world === "tinyrao") return "pt-BR";
  if (world === "tinyvlc" || world === "tinyfte") return "es-ES";
  return "en-US";
}

/**
 * The card stays when the viewer's other signs are hidden (`chrome(page, 0)`), and goes up at
 * once rather than on the wall clock's CSS animation. `top`: pin the sheet's top edge at this
 * many CSS px, so it grows downwards as a round is answered (its foot, the Next button, is what
 * may go under the apps' caption) instead of upwards over the building. `right`: keep its right
 * edge this far in, clear of the apps' button rail.
 */
export function cardStyle(place: { top?: number; right?: number } = {}): string {
  const rules = ["opacity: 1 !important", "pointer-events: auto !important", "animation: none !important"];
  if (place.top !== undefined)
    rules.push(
      `top: ${place.top}px !important`,
      "bottom: auto !important",
      "max-height: none !important",
      "overflow: visible !important",
    );
  if (place.right !== undefined) rules.push(`right: ${place.right}px !important`);
  return `html .quiz-card.sign-in { ${rules.join("; ")}; }`;
}

/** localStorage before the page runs: the game's choice, and which buildings count as played. */
export function quizStorage(world: string, level: string, played: string[]): string {
  return `(() => { try {
    localStorage.setItem(${JSON.stringify(`${world}.quiz.choice`)}, ${JSON.stringify(JSON.stringify({ level, area: null, group: null }))});
    localStorage.setItem(${JSON.stringify(`${world}.quiz.played`)}, ${JSON.stringify(JSON.stringify(played))});
  } catch {} })();`;
}

/** One frame of film time: the clock on, the page's callbacks run. */
export async function step(page: Page, frames = 1): Promise<void> {
  await page.evaluate(
    (n, ms) => {
      const film = (window as unknown as FilmWindow).__film;
      for (let i = 0; i < n; i++) {
        film.advance(ms);
        film.flush();
      }
    },
    frames,
    1000 / FPS,
  );
}

/** Run the page on, a frame at a time with a little wall time for its fetches, until `test` holds. */
export async function until(page: Page, test: string, maxFrames = 900, wallMs = 40): Promise<number> {
  for (let i = 0; i < maxFrames; i++) {
    if (await page.evaluate(test)) return i;
    await step(page);
    await sleep(wallMs);
  }
  throw new Error(`timed out waiting for: ${test}`);
}

/** Wait for `test` in wall time, the film's clock standing still (the page's own work: React, a fetch). */
export async function poll(page: Page, test: string, maxMs = 3000): Promise<void> {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    if (await page.evaluate(test)) return;
    await sleep(10);
  }
  throw new Error(`timed out waiting for: ${test}`);
}

/** Run the page on by some seconds of film time, drawing each frame whole. */
export async function run(page: Page, seconds: number): Promise<void> {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) {
    await step(page);
    await settle(page);
  }
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function rectOf(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
      const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`,
  ) as Promise<Rect | null>;
}

/** The game's sign, clicked as a visitor would (the hidden signs take no pointer, so by script). */
export const OPEN_GAME = `(() => { const b = document.querySelector(".quiz-invite"); if (b) b.click(); return !!b; })()`;
export const HAS_INVITE = `!!document.querySelector(".quiz-invite")`;
/** The choosing step's Start, once the questions are in. */
export const START_READY = `(() => [...document.querySelectorAll(".quiz-card button")].some((b) => b.className.includes("bg-taxi") && !b.disabled))()`;
export const PRESS_START = `(() => { const b = [...document.querySelectorAll(".quiz-card button")].filter((b) => b.className.includes("bg-taxi") && !b.disabled).at(-1); if (b) b.click(); return !!b; })()`;
/** The building the round holds lit. */
export const HELD = `(window.tinyworld && window.tinyworld.sightState && window.tinyworld.sightState.held) || null`;
/** The four names on offer, A to D. */
export const CHOICES = `[...document.querySelectorAll(".quiz-card button")].filter((b) => b.querySelector(".font-pixel")).map((b) => b.textContent || "")`;
/** The shares are in (a percentage on every answer). */
export const TALLIED = `[...document.querySelectorAll(".quiz-card button")].filter((b) => b.querySelector(".font-pixel")).every((b) => /%/.test(b.textContent || ""))`;
export const ANSWERED = `[...document.querySelectorAll(".quiz-card button")].some((b) => b.disabled && b.querySelector(".font-pixel"))`;

/**
 * Whether a frame came out without its map: under load, Chrome now and then hands over a picture
 * whose map canvases are empty (the page's fog shows where the city should be, the signs over it
 * as usual). Measured away from the card: the top band, the strip under the card and the column
 * right of it, at a sixtieth of the size; a city never leaves nine tenths of that the fog's colour.
 */
export async function blankMap(png: Buffer): Promise<boolean> {
  const W = 54;
  const H = 96;
  const raw = await sharp(png).resize(W, H, { kernel: "nearest" }).removeAlpha().raw().toBuffer();
  let fog = 0;
  let all = 0;
  const look = (x: number, y: number) => {
    const i = (y * W + x) * 3;
    all++;
    if (Math.abs(raw[i] - 235) + Math.abs(raw[i + 1] - 232) + Math.abs(raw[i + 2] - 222) < 14) fog++;
  };
  for (let y = 0; y < 8; y++) for (let x = 0; x < W; x++) look(x, y);
  for (let y = 74; y < 90; y++) for (let x = 0; x < 34; x++) look(x, y);
  for (let y = 26; y < 70; y++) for (let x = 49; x < W; x++) look(x, y);
  return fog / all > 0.9;
}
