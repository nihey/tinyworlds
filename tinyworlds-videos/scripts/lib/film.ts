import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

/**
 * Filming the real viewer, frame by frame. The page's clock is taken over before any of its code
 * runs (requestAnimationFrame, performance.now, Date.now), so the map's own motion — a flight
 * to a search result, the ferries, a tile fading in — advances exactly one frame's worth of time
 * per picture, however long the picture takes to draw and to save. Nothing is faked: it is the
 * viewer running, only its time is ours.
 */
export const FPS = 30;
/** The viewer is filmed at twice its size: 960 × 540 CSS px on a 1920 × 1080 picture. */
export const VIEW = { width: 960, height: 540, dpr: 2 } as const;

export interface Cam {
  /** centre, map px */
  x: number;
  y: number;
  /** CSS px per map px */
  scale: number;
}

const CLOCK = `(() => {
  let now = 0;
  let next = 0;
  const queue = new Map();
  const epoch = Date.now();
  window.requestAnimationFrame = (cb) => { queue.set(++next, cb); return next; };
  window.cancelAnimationFrame = (id) => { queue.delete(id); };
  performance.now = () => now;
  Date.now = () => epoch + now;
  const run = () => { const due = [...queue.values()]; queue.clear(); for (const cb of due) cb(now); };
  window.__film = { advance(ms) { now += ms; }, flush: run, now: () => now };
})();`;

/** Hides what a dev server adds, and lets the take fade the viewer's signs in and out. */
const STYLE = `
  nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
  .sign-in:not(.film-keep) { opacity: var(--film-chrome, 1) !important; }
  .sign-in:not(.film-keep) { pointer-events: var(--film-pointer, auto); }
`;

export interface Stage {
  browser: Browser;
  page: Page;
}

export async function openStage(url: string, startMs = 0): Promise<Stage> {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    headless: true,
    args: ["--hide-scrollbars", "--force-color-profile=srgb", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.dpr });
  await page.evaluateOnNewDocument(CLOCK);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 120_000 });
  await page.addStyleTag({ content: STYLE });
  // the viewer keeps its engine on window.tinyworld; let it come up on its own clock first
  for (let i = 0; i < 600; i++) {
    const up = await page.evaluate(() => {
      const film = (window as unknown as { __film: { advance(ms: number): void; flush(): void } }).__film;
      film.advance(16);
      film.flush();
      return (
        Boolean((window as unknown as { tinyworld?: unknown }).tinyworld) &&
        !document.querySelector(".splash")
      );
    });
    if (up && i > 40) break;
    await sleep(25);
  }
  if (startMs > 0)
    await page.evaluate(
      (ms) => (window as unknown as { __film: { advance(ms: number): void } }).__film.advance(ms),
      startMs,
    );
  return { browser, page };
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Move the viewer's clock on by one frame. */
export async function tick(page: Page): Promise<void> {
  await page.evaluate(
    (ms) => (window as unknown as { __film: { advance(ms: number): void } }).__film.advance(ms),
    1000 / FPS,
  );
}

/** Put the camera somewhere, at once. */
export async function jump(page: Page, cam: Cam): Promise<void> {
  await page.evaluate(
    (v) => (window as unknown as { tinyworld: { jumpTo(v: Cam): void } }).tinyworld.jumpTo(v),
    cam,
  );
}

/** How visible the viewer's signs are, 0 to 1 (all but the credit line, which always shows). */
export async function chrome(page: Page, opacity: number): Promise<void> {
  await page.evaluate((o) => {
    document.documentElement.style.setProperty("--film-chrome", String(o));
    document.documentElement.style.setProperty("--film-pointer", o > 0.5 ? "auto" : "none");
  }, opacity);
}

/**
 * Draw the current frame until it is whole: run the page's animation callbacks at the current
 * time, wait for the tiles they asked for, and run them again, until nothing is on its way.
 */
export async function settle(page: Page): Promise<void> {
  for (let pass = 0; pass < 40; pass++) {
    await page.evaluate(() => (window as unknown as { __film: { flush(): void } }).__film.flush());
    for (let i = 0; i < 400; i++) {
      const idle = await page.evaluate(
        () => ((window as unknown as { tinyworld?: { inflight: number } }).tinyworld?.inflight ?? 0) === 0,
      );
      if (idle) break;
      await sleep(8);
    }
    // a pass that found nothing loading after drawing is the last one
    const started = await page.evaluate(() => {
      (window as unknown as { __film: { flush(): void } }).__film.flush();
      return (window as unknown as { tinyworld?: { inflight: number } }).tinyworld?.inflight ?? 0;
    });
    if (started === 0) return;
  }
}

/** The frame as a PNG. */
export async function shoot(page: Page): Promise<Buffer> {
  return Buffer.from(await page.screenshot({ type: "png", optimizeForSpeed: true }));
}

/** Where frames go: an all-intra H.264 file, so the film can seek it frame by frame. */
export function openReel(
  file: string,
  cwd: string,
): { write(frame: Buffer): Promise<void>; close(): Promise<void> } {
  const ffmpeg: ChildProcessWithoutNullStreams = spawn(
    "ffmpeg",
    [
      "-v", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-g", "1", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", file,
    ], // prettier-ignore
    { cwd },
  );
  ffmpeg.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
  const done = new Promise<void>((resolve, reject) => {
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
  return {
    write: (frame) =>
      new Promise((resolve, reject) => {
        ffmpeg.stdin.write(frame, (error) => (error ? reject(error) : resolve()));
      }),
    close: async () => {
      ffmpeg.stdin.end();
      await done;
    },
  };
}

/** A zoom between two views: the scale moves evenly in octaves, and the first view's centre
 *  slides across the screen to where it lies in the second. `u` is 0 to 1. */
export function between(from: Cam, to: Cam, u: number): Cam {
  const scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * u);
  const w = from.scale === to.scale ? u : (1 / scale - 1 / from.scale) / (1 / to.scale - 1 / from.scale);
  return { x: from.x + (to.x - from.x) * w, y: from.y + (to.y - from.y) * w, scale };
}

export const easeInOut = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
export const clamp01 = (u: number): number => Math.min(1, Math.max(0, u));

/**
 * A smooth curve through (time, value) keys that never overshoots them (monotone cubic,
 * Fritsch-Carlson): a camera move written as "by this second, this far", with no bumps between.
 */
export function through(keys: [number, number][]): (t: number) => number {
  const n = keys.length;
  const slope = keys.slice(1).map(([t, v], i) => (v - keys[i][1]) / (t - keys[i][0]));
  const m = keys.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    return slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  });
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = (3 * a * slope[i]) / h;
      m[i + 1] = (3 * b * slope[i]) / h;
    }
  }
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (t > keys[i + 1][0]) i++;
    const span = keys[i + 1][0] - keys[i][0];
    const u = (t - keys[i][0]) / span;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * keys[i][1] +
      (u3 - 2 * u2 + u) * span * m[i] +
      (-2 * u3 + 3 * u2) * keys[i + 1][1] +
      (u3 - u2) * span * m[i + 1]
    );
  };
}
