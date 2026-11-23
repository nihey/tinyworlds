// Filming the live Street Walk for the social clips (social-sky/, social-chaos/): the game found
// through the minimap's React props (as scripts/street-walk.ts does), its camera hooked so a take
// can set it, and frames run on the film's clock. Everything on screen is the live viewer.
import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { openReel, shoot, sleep } from "../lib/film.js";

/**
 * One frame of the game's time, ms. A hair under 1/30 s: the walk's automatic quality steps down
 * when it measures under 30 fps, and exactly 30 can round under it; 0.15 % slower is invisible.
 */
export const STEP_MS = 1000 / 30 - 0.05;

/** The walk's signs, the minimap and the hints hidden: the picture alone (the credit stays). */
export const WALK_CLEAN = `
  .walk-minimap { visibility: hidden !important; }
  .walk-pane .sign { visibility: hidden !important; }
  .walk-pane [role='status'] { visibility: hidden !important; }
  .walk-pane div:has(> [role='alert']) { visibility: hidden !important; }
  .film-no-fist .walk-punch-overlay { visibility: hidden !important; }
`;

/**
 * What runs in the page, as a string (functions written inside page.evaluate get a helper from
 * tsx the page lacks). `window.__sky`: the game, its frames, its camera, vehicles put in place.
 */
export const KIT = String.raw`(() => {
  if (window.__sky) return;
  const R = 6371008.8, rad = Math.PI / 180;
  const sky = {
    step: ${STEP_MS},
    cam: null,
    before: null,
    car: null,
    t: 0,
    ids: 0,
    keepMirror: true,
    game() {
      const minimap = document.querySelector(".walk-minimap");
      if (!minimap) throw new Error("no walk open");
      const key = Object.keys(minimap).find((k) => k.startsWith("__reactFiber$"));
      let fiber = key ? minimap[key] : undefined;
      while (fiber) {
        const g = fiber.memoizedProps && fiber.memoizedProps.game;
        if (g) return g;
        fiber = fiber.return;
      }
      throw new Error("Street Walk has no live game");
    },
    hook() {
      const g = sky.game();
      if (g.__skyHooked) return g;
      const original = g.camera.bind(g);
      g.camera = function (dt) {
        original(dt);
        sky.t += dt;
        if (sky.cam) {
          const c = sky.cam(g, sky.car, sky.t, dt);
          if (c) g.view.setCamera(c.e, c.n, c.z, c.yaw, c.pitch, c.fov);
        }
      };
      g.__skyHooked = true;
      return g;
    },
    geo() { return sky.game().world.index.geo; },
    en(lat, lon) {
      const g = sky.geo();
      return { e: (lon - g.lon0) * rad * R * Math.cos(g.lat0 * rad), n: (lat - g.lat0) * rad * R };
    },
    frames(count, lx, ly) {
      const g = sky.hook();
      for (let i = 0; i < count; i++) {
        if (lx || ly) g.look(lx || 0, ly || 0);
        if (sky.keepMirror && g.view && g.view.slow) g.view.slow.reset();
        if (sky.before) sky.before(g, sky.car, sky.t);
        window.__film.advance(sky.step);
        window.__film.flush();
      }
      sky.syncAnimations();
    },
    /** The page's CSS animations (the fist's swing, the hit marker, the dangling person) on the film's clock. */
    syncAnimations() {
      const now = window.__film.now();
      for (const a of document.getAnimations()) {
        if (a.__filmStart == null) {
          // one that already ran its course (a sign that stepped in at load) is left alone
          if (a.playState === "finished") { a.__filmStart = -1; continue; }
          a.__filmStart = now;
          a.pause();
        }
        if (a.__filmStart >= 0) a.currentTime = now - a.__filmStart;
      }
    },
    setCam(src) { sky.cam = src ? new Function("g", "car", "t", "dt", src) : null; },
    setBefore(src) { sky.before = src ? new Function("g", "car", "t", src) : null; },
    vehicle(o) {
      const g = sky.hook();
      const boat = o.kind === "speedboat" || o.kind === "motorboat" || o.kind === "ferry";
      const car = {
        id: -1000 - (++sky.ids), kind: o.kind, boat, e: o.e, n: o.n, z: o.z == null ? 0 : o.z,
        vz: 0, yaw: o.yaw, v: o.v || 0, vs: 0, w: 0, damage: o.damage || 0, state: "loose",
        fuse: null, fire: 0, sink: 0, stopFor: 0, color: o.color || 0, heave: 0, roll: 0,
      };
      g.add(car);
      if (o.enter) { g.enter(car); sky.car = car; }
      return car;
    },
    /** Clears the traffic from a strip ahead of (e, n) along yaw: [behind, ahead] metres, half-width. */
    clear(e, n, yaw, behind, ahead, half) {
      const g = sky.game();
      const s = Math.sin(yaw), c = Math.cos(yaw);
      const cars = g.traffic.cars;
      let gone = 0;
      for (let i = cars.length - 1; i >= 0; i--) {
        const de = cars[i].e - e, dn = cars[i].n - n;
        const along = de * s + dn * c, across = de * c - dn * s;
        if (along > -behind && along < ahead && Math.abs(across) < half) { cars.splice(i, 1); gone++; }
      }
      return gone;
    },
    /** A lane near (e, n) going about yawDeg: the nearest traffic car so headed, within reach metres. */
    lane(e, n, yawDeg, reach) {
      const g = sky.game();
      const want = yawDeg * rad;
      let best = null, bestD = reach || 120;
      for (const v of g.traffic.cars) {
        let d = Math.abs(((v.yaw - want) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
        if (d > 0.3) continue;
        const dist = Math.hypot(v.e - e, v.n - n);
        if (dist < bestD) { bestD = dist; best = { e: v.e, n: v.n, z: v.z, yaw: v.yaw, kind: v.kind, dist }; }
      }
      return best;
    },
    /**
     * The nearest street (class at most maxCls) that can be driven about yawDeg near (e, n):
     * { e, n, z, yaw (the way traffic goes), width, ow, cls, d }, the point on its centre line.
     */
    street(e, n, yawDeg, reach, maxCls) {
      const want = yawDeg * rad;
      const off = (a) => Math.abs(((a - want) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
      let best = null, bd = reach || 150;
      for (const cell of sky.game().world.cells())
        for (const st of cell.streets) {
          if (st.cls > (maxCls == null ? 6 : maxCls) || st.link) continue;
          const p = st.pts;
          for (let i = 0; i + 5 < p.length; i += 3) {
            const ae = p[i], an = p[i + 1], be = p[i + 3], bn = p[i + 4];
            const de = be - ae, dn = bn - an, l2 = de * de + dn * dn;
            if (!(l2 > 1)) continue;
            const fwd = Math.atan2(de, dn);
            let yaw = null;
            if (st.ow >= 0 && off(fwd) < 0.35) yaw = fwd;
            else if (st.ow <= 0 && off(fwd + Math.PI) < 0.35) yaw = fwd + Math.PI;
            if (yaw == null) continue;
            const u = Math.max(0, Math.min(1, ((e - ae) * de + (n - an) * dn) / l2));
            const qe = ae + de * u, qn = an + dn * u, d = Math.hypot(qe - e, qn - n);
            if (d < bd) {
              bd = d;
              best = { e: qe, n: qn, z: p[i + 2] + (p[i + 5] - p[i + 2]) * u, yaw, width: st.width, ow: st.ow, cls: st.cls, d };
            }
          }
        }
      return best;
    },
    /** A pedestrian walking from (e0, n0) to (e1, n1) at height z, starting s metres along. */
    walker(o) {
      const g = sky.game();
      const len = Math.hypot(o.e1 - o.e0, o.n1 - o.n0);
      const way = g.crowd.wayOf({
        key: "film-" + (++sky.ids), a: -100 - sky.ids * 2, b: -101 - sky.ids * 2,
        pts: Float32Array.of(o.e0, o.n0, o.z || 0, o.e1, o.n1, o.z || 0), length: len,
        crosswalk: true, phase: 0, elevated: Boolean(o.z),
      });
      const p = g.crowd.make(way, 1, o.s || 0);
      p.side = 0;
      p.cool = 3;
      if (o.top != null) p.look.top = o.top;
      g.crowd.people.push(p);
      return p;
    },
    /** The tallest volumes whose box centre is within r metres of (e, n): { e, n, top, w, d }. */
    tallest(e, n, r, count) {
      const out = [];
      for (const cell of sky.game().world.cells())
        for (const v of cell.volumes) {
          const ce = (v.box[0] + v.box[2]) / 2, cn = (v.box[1] + v.box[3]) / 2;
          if (Math.hypot(ce - e, cn - n) > r) continue;
          out.push({ e: ce, n: cn, top: v.top, base: v.base, w: v.box[2] - v.box[0], d: v.box[3] - v.box[1] });
        }
      out.sort((a, b) => b.top - a.top);
      return out.slice(0, count || 5);
    },
    /** The nearest point of an elevated road deck higher than minZ: { e, n, z, yaw, width }. */
    deckNear(e, n, minZ, kind) {
      let best = null, bd = Infinity;
      for (const cell of sky.game().world.cells())
        for (const w of cell.elevated) {
          if (w.kind !== (kind == null ? 0 : kind)) continue;
          const p = w.pts;
          for (let i = 0; i + 5 < p.length; i += 3) {
            const ae = p[i], an = p[i + 1], az = p[i + 2], be = p[i + 3], bn = p[i + 4], bz = p[i + 5];
            if ((az + bz) / 2 < minZ) continue;
            const de = be - ae, dn = bn - an, l2 = de * de + dn * dn;
            if (!(l2 > 0)) continue;
            const u = Math.max(0, Math.min(1, ((e - ae) * de + (n - an) * dn) / l2));
            const qe = ae + de * u, qn = an + dn * u, d = Math.hypot(qe - e, qn - n);
            if (d < bd) { bd = d; best = { e: qe, n: qn, z: az + (bz - az) * u, yaw: Math.atan2(de, dn), width: w.width, d }; }
          }
        }
      return best;
    },
    /** World metres back to lon, lat. */
    lonLat(e, n) {
      const g = sky.geo();
      return { lon: g.lon0 + e / (R * Math.cos(g.lat0 * rad)) / rad, lat: g.lat0 + n / R / rad };
    },
    /** The squares round the camera: in, on their way, failed; and whether you are still held waiting. */
    squares() {
      const g = sky.game();
      return Object.assign({ waiting: Boolean(g.waiting) }, g.view.squares());
    },
    summary() {
      const g = sky.game();
      const kinds = {};
      for (const v of g.vehicles()) {
        const k = v.kind + ":" + v.state;
        kinds[k] = (kinds[k] || 0) + 1;
      }
      return { pos: g.position(), state: g.state.mode, kinds, people: g.crowd.people.length };
    },
  };
  window.__sky = sky;
})();`;

type Win = Window & { __film: { advance(ms: number): void; flush(): void } };

/** Runs the page's clock on by frames without filming (loading, staging). */
export async function idle(page: Page, count: number): Promise<void> {
  await page.evaluate(
    ({ count, step }) => {
      const film = (window as unknown as Win).__film;
      for (let i = 0; i < count; i++) {
        film.advance(step);
        film.flush();
      }
    },
    { count, step: STEP_MS },
  );
}

interface Squares {
  waiting: boolean;
  ready: number;
  loading: number;
  failed: number;
}

/** Waits until nothing round the camera is on its way: frames run, with pauses for the network. */
export async function squaresIn(page: Page, minutes = 4, quiet = 8): Promise<Squares> {
  const until = Date.now() + minutes * 60_000;
  let calm = 0;
  let last: Squares | null = null;
  while (Date.now() < until) {
    await page.evaluate("window.__sky.frames(2)");
    last = await js<Squares>(page, "window.__sky.squares()");
    calm = !last.waiting && last.loading === 0 && last.ready > 0 ? calm + 1 : 0;
    if (calm >= quiet) return last;
    await sleep(80);
  }
  console.log("squares still coming in:", JSON.stringify(last));
  return last!;
}

/** Waits (on the film's clock, and the wall's for the network) until the walk is open and its squares are in. */
export async function walkReady(page: Page, minutes = 8): Promise<void> {
  const until = Date.now() + minutes * 60_000;
  while (Date.now() < until) {
    await idle(page, 3);
    const open = await page.evaluate(() => Boolean(document.querySelector(".walk-minimap")));
    if (open) {
      await page.evaluate(KIT);
      await page.evaluate("window.__sky.hook(); window.__sky.game().view.setReflections(true)");
      await squaresIn(page, Math.max(1, (until - Date.now()) / 60_000));
      return;
    }
    await sleep(60);
  }
  throw new Error("Street Walk did not load");
}

/** Opens a walk at lat,lon,heading (a walk link) and waits for it. */
export async function walkAt(page: Page, spot: string): Promise<void> {
  await page.evaluate((s) => (location.hash = `walk=${s}`), spot);
  await walkReady(page);
}

/** Lets the squares round where the camera now is come in: frames run, with pauses for the network. */
export async function soak(page: Page, passes = 12): Promise<void> {
  for (let i = 0; i < passes; i++) {
    await page.evaluate("window.__sky.frames(4)");
    await sleep(120);
  }
}

/** Runs a script in the page (a string, so tsx adds nothing to it). */
export async function js<T = unknown>(page: Page, code: string): Promise<T> {
  return (await page.evaluate(code)) as T;
}

/**
 * Films `seconds` of the walk: `act(frame)` before each frame (keys, sticks, camera), then one
 * frame of the game and its picture. Written to `<dir>/<name>.mp4` (all-intra, for seeking).
 */
export async function filmTake(
  page: Page,
  dir: string,
  name: string,
  frames: number,
  act: (frame: number) => Promise<void> = async () => {},
  progress?: (frame: number) => Promise<void>,
): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const output = path.join(dir, `${name}.mp4`);
  const temp = path.join(dir, `.${name}.mp4`);
  const reel = openReel(temp, dir);
  const started = Date.now();
  try {
    for (let f = 0; f < frames; f++) {
      await act(f);
      await page.evaluate("window.__sky.frames(1)");
      // React draws what the frame changed on its own schedule: let it, then set the CSS
      // animations it started to the film's time before the picture
      await sleep(15);
      await page.evaluate("window.__sky.syncAnimations()");
      await reel.write(await shoot(page));
      if (progress && f % 10 === 0) await progress(f);
    }
  } finally {
    await reel.close();
  }
  await fs.rename(temp, output);
  console.log(`${name}: ${frames} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  return output;
}

/** A PNG of the current frame (no clock advance). */
export async function still(page: Page, file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, await shoot(page));
}
