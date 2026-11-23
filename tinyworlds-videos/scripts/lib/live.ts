import type { HTTPRequest, Page } from "puppeteer-core";
import { openStage, type Stage, type StageOptions } from "./film.js";
import { siteUrl } from "./site.js";

/**
 * Filming the live site: the map as visitors get it today, every world on it, the latest data.
 * The browser is driven by a program (`navigator.webdriver`), which the site never counts as a
 * visit; on top of that only the site's own host is fetched (no Tag Manager, no page analytics),
 * the funnel's and the presence beat's mutations are answered here without reaching the API,
 * and the cookie question is answered "no" before the page runs. The page's clock is the
 * film's (`lib/film.ts`), and so are its intervals (the six-minute day is read every 500 ms
 * of film time, not of the wall clock), so a take is the same however long a frame takes.
 */

/** Settings a take may fix: the viewer's `Prefs` (`tinyworlds-frontend/src/lib/prefs.ts`). */
export interface LivePrefs {
  theme?: "light" | "dark" | "cycle" | "system";
  weather?: "live" | "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm";
  tilt?: boolean;
  /** 0–100 */
  tiltStrength?: number;
  minimap?: boolean;
  hoods?: boolean;
  life?: boolean;
  /** "auto", "en-US", "pt-BR", "es-ES" */
  lang?: string;
  view?: "north" | "grid";
}

export interface LiveOptions extends StageOptions {
  /** the address's hash, without "#": "40.75,-73.98,1.2" or "walk=lat,lon,heading" */
  hash?: string;
  prefs?: LivePrefs;
  /** seeds the page's Math.random, so traffic, crowds and the game's order are the same each take */
  seed?: number;
  /** film ms to run before the take starts (the day's clock starts at noon at page load) */
  startMs?: number;
  /** more script to run before the page's own */
  init?: string;
}

/** A landscape take: 1920 × 1080. */
export const LANDSCAPE = { width: 960, height: 540, dpr: 2 } as const;
/** A vertical take: 1080 × 1920. */
export const VERTICAL = { width: 540, height: 960, dpr: 2 } as const;

export const DEFAULT_PREFS: LivePrefs = {
  theme: "light",
  weather: "clear",
  tilt: true,
  tiltStrength: 50,
  minimap: false,
  hoods: false,
  life: true,
  lang: "en-US",
  view: "north",
};

/** The page's setInterval on the film's clock: run on each flush for every period that has passed. */
const INTERVALS = `(() => {
  const film = window.__film;
  const timers = new Map();
  let nextId = 1000000;
  const clearReal = window.clearInterval.bind(window);
  window.setInterval = (cb, ms, ...args) => {
    const period = Math.max(1, Number(ms) || 0);
    const id = ++nextId;
    timers.set(id, { cb, period, due: film.now() + period, args });
    return id;
  };
  window.clearInterval = (id) => { if (!timers.delete(id)) clearReal(id); };
  const flush = film.flush;
  film.flush = () => {
    const now = film.now();
    for (const [id, t] of [...timers]) {
      let runs = 0;
      while (timers.has(id) && t.due <= now && runs++ < 4) {
        t.due += t.period;
        try { if (typeof t.cb === "function") t.cb(...t.args); } catch (e) { console.error(e); }
      }
      if (t.due <= now) t.due = now + t.period;
    }
    flush();
  };
})();`;

const seeded = (seed: number) =>
  `(() => { let n = ${seed >>> 0}; Math.random = () => ((n = Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296; })();`;

const storage = (world: string, prefs: LivePrefs) => `(() => {
  try {
    localStorage.setItem("tinyworlds.consent", "denied");
    localStorage.setItem(${JSON.stringify(`${world}.prefs`)}, ${JSON.stringify(JSON.stringify(prefs))});
  } catch {}
})();`;

/** The site's origin: SITE_URL, or DEPLOY_URL in the gitignored deploy/.env. */
export function liveOrigin(): string {
  const url = siteUrl();
  if (!url) throw new Error("Set SITE_URL (the live site's origin) to film the live site");
  return url;
}

export function liveUrl(world: string, hash?: string): string {
  return `${liveOrigin()}/${world}/${hash ? `#${hash}` : ""}`;
}

/** Let the site's own files through, answer the counting mutations here, refuse anything else. */
async function guard(page: Page): Promise<void> {
  const host = new URL(liveOrigin()).host;
  await page.setRequestInterception(true);
  page.on("request", (request: HTTPRequest) => {
    if (request.isInterceptResolutionHandled()) return;
    const url = new URL(request.url());
    if (url.protocol === "data:" || url.protocol === "blob:") return void request.continue();
    if (url.host !== host) return void request.abort("blockedbyclient");
    if (url.pathname.startsWith("/api/")) {
      const body = request.postData() ?? "";
      const counted = body.match(/\b(trackFunnelStep|trackPresence)\b/);
      if (counted) {
        return void request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { [counted[1]]: true } }),
        });
      }
    }
    void request.continue();
  });
}

/**
 * What `chrome(page, 0)` leaves out of a clean take beyond the viewer's `.sign-in` signs: the
 * benefactors' plaque over the credit line. The credit line itself always shows (attribution).
 * `openLive` adds it.
 */
export const CLEAN = `
  .map-benefactor-plaque, .map-benefactor-carousel { opacity: var(--film-chrome, 1) !important; }
`;

/** Open a world of the live site for filming, its clock stopped at zero. */
export async function openLive(world: string, options: LiveOptions = {}): Promise<Stage> {
  const prefs = { ...DEFAULT_PREFS, ...options.prefs };
  const init = [
    INTERVALS,
    storage(world, prefs),
    options.seed === undefined ? "" : seeded(options.seed),
    options.init ?? "",
  ].join("\n");
  const stage = await openStage(liveUrl(world, options.hash), options.startMs ?? 0, init, {
    ...options,
    prepare: async (page) => {
      await guard(page);
      await options.prepare?.(page);
    },
  });
  await stage.page.addStyleTag({ content: CLEAN });
  return stage;
}
