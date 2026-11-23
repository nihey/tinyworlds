// The takes of "Street Walk: real New York in a browser tab" (social-chaos/), filmed on the live
// site: each one staged (a seeded city, the vehicle put in its lane, keys and sticks held for so
// many frames, the camera placed), then filmed frame by frame on the film's clock. Each take has
// a browser of its own (a walk that went wrong never leaks into the next); they share a profile,
// so the city's files come from its cache after the first.
//   SITE_URL=… npm exec -- tsx scripts/social/chaos-takes.ts [take …]
// Takes: punch bike chase fire boat bridge
import fs from "node:fs/promises";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { LANDSCAPE, openLive } from "../lib/live.js";
import { filmTake, idle, js, squaresIn, walkAt, WALK_CLEAN } from "./sky-lib.js";

const DIR = path.resolve("social-chaos/assets/takes");
const PROGRESS = path.resolve("out/social/chaos-progress.txt");
const PROFILE = path.resolve(process.env.CHAOS_PROFILE ?? "out/social/chaos-profile");
const t0 = Date.now();
const log = async (...a: unknown[]) => {
  const line = `[${((Date.now() - t0) / 1000).toFixed(0)}s] ${a.map(String).join(" ")}`;
  console.log(line);
  await fs.appendFile(PROGRESS, line + "\n");
};

/** Opens a walk, then the pixels a size finer (480 × 270, as the earlier films had them). */
const open = async (page: Page, spot: string) => {
  await walkAt(page, spot);
  await page.keyboard.press("BracketLeft");
  await idle(page, 4);
};

const key = (page: Page, code: string, down: boolean) =>
  js(page, `window.__sky.game().${down ? "keyDown" : "keyUp"}(${JSON.stringify(code)})`);
const stick = (page: Page, x: number, y: number) => js(page, `window.__sky.game().stick(${x}, ${y})`);
const cam = (page: Page, src: string | null) => js(page, `window.__sky.setCam(${JSON.stringify(src)})`);

/** A point `ahead` metres along yaw and `right` metres to its right of (e, n), as page script. */
const AT = `const at = (o, ahead, right) => ({ e: o.e + Math.sin(o.yaw) * ahead + Math.cos(o.yaw) * right, n: o.n + Math.cos(o.yaw) * ahead - Math.sin(o.yaw) * right });`;

interface Pose {
  e: number;
  n: number;
  z: number;
  yaw: number;
  width: number;
  ow: number;
  cls: number;
}

/**
 * A lane of the nearest avenue (or any street up to `maxCls`) going `deg` near `lat, lon`: the
 * `lane`-th from the right of a one-way street (0 the kerb lane), the middle of the right half
 * of a two-way one. Answers a Pose in the page, or null.
 */
const LANE = (lat: number, lon: number, deg: number, lane: number, maxCls = 3, reach = 160) => `(() => {
  const s = window.__sky; const p = s.en(${lat}, ${lon});
  const st = s.street(p.e, p.n, ${deg}, ${reach}, ${maxCls});
  if (!st) return null;
  const half = st.width / 2;
  const right = st.ow !== 0 ? Math.max(-half + 1.6, half - 1.8 - 3.2 * ${lane}) : half / 2;
  return { e: st.e + Math.cos(st.yaw) * right, n: st.n - Math.sin(st.yaw) * right, z: st.z, yaw: st.yaw,
           width: st.width, ow: st.ow, cls: st.cls, d: st.d, right };
})()`;

/** A chase camera that follows the vehicle's heading smoothly (rate per second), not rigidly. */
const SMOOTH_CHASE = (
  back: number,
  side: number,
  up: number,
  turn: number,
  pitch: number,
  fov: number,
  rate = 3,
) => `
  if (!car) return null;
  const s = window.__sky;
  if (s.cy == null) s.cy = car.yaw;
  let d = car.yaw - s.cy; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  s.cy += d * Math.min(1, dt * ${rate});
  const y = s.cy, si = Math.sin(y), co = Math.cos(y);
  return { e: car.e - si * ${back} + co * ${side}, n: car.n - co * ${back} - si * ${side}, z: car.z + ${up}, yaw: y + ${turn}, pitch: ${pitch}, fov: ${fov} };`;

const progress = (name: string) => async (f: number) => log(name, "frame", f);
const carState = (page: Page) =>
  js(
    page,
    "(() => { const c = window.__sky.car; return c ? { v: +c.v.toFixed(1), state: c.state, damage: +c.damage.toFixed(2), fuse: c.fuse } : null; })()",
  );

const TAKES: Record<string, (page: Page) => Promise<void>> = {
  // a pedestrian walks up to you in Times Square; one punch
  punch: async (page) => {
    await open(page, "40.75790,-73.98560,29");
    await js(
      page,
      `(() => { const s = window.__sky; const g = s.game(); const p = g.position(); ${AT}
        const a = at(p, 4.0, 0.1), b = at(p, -4, 0.1);
        s.target = s.walker({ e0: a.e, n0: a.n, e1: b.e, n1: b.n, z: p.z, s: 0, top: 1 }); })()`,
    );
    await log("punch staged", JSON.stringify(await js(page, "window.__sky.summary()")));
    let at = -1;
    await filmTake(
      page,
      DIR,
      "punch",
      80,
      async (f) => {
        if (at >= 0 && f === at + 2) await key(page, "KeyE", false);
        if (at >= 0) return;
        const ahead = await js<number>(
          page,
          `(() => { const s = window.__sky, g = s.game(), p = g.position(), q = s.target;
            return (q.e - p.e) * Math.sin(p.yaw) + (q.n - p.n) * Math.cos(p.yaw); })()`,
        );
        if ((ahead < 1.7 && f > 12) || f === 46) {
          at = f;
          await key(page, "KeyE", true);
          await log("punch at", f, "ahead", ahead.toFixed(2));
        }
      },
      progress("punch"),
    );
    await log("punch result", JSON.stringify(await js(page, "({ state: window.__sky.target.state })")));
  },

  // a motorcycle down Seventh Avenue into Times Square, weaving through the traffic
  bike: async (page) => {
    await open(page, "40.75968,-73.98429,209");
    const pose = await js<Pose | null>(page, LANE(40.75968, -73.98429, 209, 2));
    await log("bike lane", JSON.stringify(pose));
    if (!pose) throw new Error("no avenue found");
    await js(
      page,
      `(() => { const s = window.__sky; const o = ${JSON.stringify(pose)};
        s.clear(o.e, o.n, o.yaw, 8, 140, 1.5);
        s.vehicle({ kind: "motorcycle", color: 0, e: o.e, n: o.n, z: o.z, yaw: o.yaw, v: 15, enter: true });
        s.game().stick(0, -0.8);
        s.setBefore("if (car && car.v > 19) car.v = 19;"); })()`,
    );
    await squaresIn(page, 2, 4);
    await filmTake(
      page,
      DIR,
      "bike",
      135,
      async (f) => {
        await stick(page, 0.3 * Math.sin((2 * Math.PI * f) / 50), -0.85);
      },
      progress("bike"),
    );
    await log("bike end", JSON.stringify(await carState(page)));
  },

  // a red supercar on the tail of a white sports car up Sixth Avenue, seen from behind the chaser
  chase: async (page) => {
    await open(page, "40.75476,-73.98408,29");
    const pose = await js<Pose | null>(page, LANE(40.75476, -73.98408, 29, 1));
    await log("chase lane", JSON.stringify(pose));
    if (!pose) throw new Error("no avenue found");
    await js(
      page,
      `(() => { const s = window.__sky; const o = ${JSON.stringify(pose)}; ${AT}
        s.clear(o.e, o.n, o.yaw, 20, 260, 3.4);
        const l = at(o, 11, -3.2);
        s.lead = s.vehicle({ kind: "sports", color: 2, e: l.e, n: l.n, z: o.z, yaw: o.yaw, v: 22 });
        s.vehicle({ kind: "supercar", color: 0, e: o.e, n: o.n, z: o.z, yaw: o.yaw, v: 22, enter: true });
        s.y0 = o.yaw; s.o = o;
        s.setBefore(\`
          const S = window.__sky, L = S.lead, y0 = S.y0;
          // the lead holds 23 m/s and swerves from lane to lane
          L.v = 23; L.vs = 0; L.w = 0; L.yaw = y0 + 0.07 * Math.sin(t * 2.2);
          if (!car) return;
          // the chaser keeps its own lane, one to the right of the lead's, a few metres behind
          const re = L.e - car.e, rn = L.n - car.n;
          const ahead = re * Math.sin(car.yaw) + rn * Math.cos(car.yaw);
          const oe = car.e - S.o.e, on = car.n - S.o.n;
          const off = oe * Math.cos(y0) - on * Math.sin(y0);
          let dy = y0 - car.yaw; dy = ((dy + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          const steer = Math.max(-1, Math.min(1, -off * 0.3 + dy * 1.5));
          const gas = Math.max(0, Math.min(1, 0.6 + (ahead - 9) * 0.3));
          g.stick(steer, -gas);
          if (car.v > 25) car.v = 25;\`);
      })()`,
    );
    await cam(page, SMOOTH_CHASE(7.5, 0.6, 2.3, -0.07, -0.04, 56, 3.5));
    await squaresIn(page, 2, 4);
    await filmTake(page, DIR, "chase", 105, undefined, progress("chase"));
    await log("chase end", JSON.stringify(await carState(page)));
  },

  // a damaged sedan into a bus on Seventh Avenue: it catches fire, you get out, eight seconds, boom
  fire: async (page) => {
    await open(page, "40.75900,-73.98470,209");
    const pose = await js<Pose | null>(page, LANE(40.759, -73.9847, 209, 1));
    await log("fire lane", JSON.stringify(pose));
    if (!pose) throw new Error("no avenue found");
    await js(
      page,
      `(() => { const s = window.__sky; const o = ${JSON.stringify(pose)}; ${AT}
        s.clear(o.e, o.n, o.yaw, 10, 60, 1.7);
        const b = at(o, 40, 0);
        s.bus = s.vehicle({ kind: "bus", color: 0, e: b.e, n: b.n, z: o.z, yaw: o.yaw, v: 0 });
        s.vehicle({ kind: "sedan", color: 1, e: o.e, n: o.n, z: o.z, yaw: o.yaw, v: 16, damage: 0.82, enter: true });
        s.game().stick(0, -1);
      })()`,
    );
    await cam(page, SMOOTH_CHASE(10.5, 0, 3.4, 0, -0.13, 64));
    await squaresIn(page, 2, 4);
    let crashed = -1;
    let wide = "";
    await filmTake(
      page,
      DIR,
      "fire-a",
      120,
      async (f) => {
        const c = await js<{ state: string; damage: number; fuse: number | null }>(
          page,
          "(() => { const c = window.__sky.car; return { state: c.state, damage: c.damage, fuse: c.fuse }; })()",
        );
        if (crashed < 0 && (c.state === "wrecked" || c.fuse !== null)) {
          crashed = f;
          await log("wrecked at frame", f, JSON.stringify(c));
        }
        if (crashed >= 0 && f === crashed + 14) {
          // the wide: from the kerb behind and to the left, the wreck and the bus in view
          wide = await js<string>(
            page,
            `(() => { const s = window.__sky, c = s.car; const y = c.yaw, si = Math.sin(y), co = Math.cos(y);
              const e = c.e - si * 10 - co * 6.5, n = c.n - co * 10 + si * 6.5;
              const look = Math.atan2(c.e + si * 3 - e, c.n + co * 3 - n);
              return 'return { e: ' + e + ', n: ' + n + ', z: ' + (c.z + 2.8) + ', yaw: ' + look + ', pitch: -0.08, fov: 64 };'; })()`,
          );
          await key(page, "KeyF", true);
          await stick(page, 0, 0);
        }
        if (crashed >= 0 && f === crashed + 15) {
          await key(page, "KeyF", false);
          await cam(page, wide);
          // the camera is no longer your eyes: no fist in the picture
          await page.evaluate(() => document.documentElement.classList.add("film-no-fist"));
          await log("out", JSON.stringify(await js(page, "window.__sky.summary().state")));
        }
        if (crashed >= 0 && f === crashed + 18) {
          await js(page, "window.__sky.game().look(1500, 0)");
          await key(page, "ShiftLeft", true);
          await key(page, "KeyW", true);
        }
      },
      progress("fire-a"),
    );
    // the fuse burns on, unfilmed, until about a second and a half is left
    for (let i = 0; i < 400; i++) {
      const fuse = await js<number | null>(page, "window.__sky.car.fuse");
      if (fuse === null || fuse < 1.6) break;
      await js(page, "window.__sky.frames(1)");
      if (i === 40) {
        await key(page, "KeyW", false);
        await key(page, "ShiftLeft", false);
      }
    }
    await log("fuse before boom", String(await js(page, "window.__sky.car.fuse")));
    await filmTake(page, DIR, "fire-b", 120, undefined, progress("fire-b"));
    await log("after", JSON.stringify(await js(page, "window.__sky.summary()")));
  },

  // a yellow speedboat up the East River, under the Brooklyn Bridge
  boat: async (page) => {
    await open(page, "40.70560,-74.00170,120");
    const start = await js<Pose | null>(
      page,
      `(() => { const s = window.__sky, g = s.game(); const c = s.en(40.70454, -73.99809);
        const yaw = ${(30 * Math.PI) / 180};
        for (let r = 0; r < 300; r += 10) for (let k = 0; k < 12; k++) {
          const a = (k / 12) * 2 * Math.PI, e = c.e + Math.sin(a) * r, n = c.n + Math.cos(a) * r;
          let wet = true;
          for (let m = 0; m < 8 && wet; m++) { const b = (m / 8) * 2 * Math.PI; wet = g.world.isWater(e + Math.sin(b) * 35, n + Math.cos(b) * 35); }
          if (wet && g.world.isWater(e, n)) return { e, n, z: -0.6, yaw };
        }
        return null; })()`,
    );
    await log("boat start", JSON.stringify(start));
    if (!start) throw new Error("no open water found for the boat");
    await js(
      page,
      `(() => { const s = window.__sky, o = ${JSON.stringify(start)};
        s.vehicle({ kind: "speedboat", color: 4, e: o.e, n: o.n, z: o.z, yaw: o.yaw, v: 14, enter: true });
        s.game().stick(0, -1); })()`,
    );
    await squaresIn(page, 3, 6);
    await cam(page, SMOOTH_CHASE(11, -1.2, 2.4, 0.04, 0.06, 68, 2.5));
    await filmTake(
      page,
      DIR,
      "boat",
      135,
      async (f) => {
        await stick(page, f < 40 ? 0.12 : -0.05, -1);
      },
      progress("boat"),
    );
    await log("boat end", JSON.stringify(await carState(page)));
  },

  // a taxi over the Brooklyn Bridge into Manhattan, through the tower's arches
  bridge: async (page) => {
    await open(page, "40.70319,-73.99337,305");
    await log("bridge at", JSON.stringify(await js(page, "window.__sky.summary()")));
    const pose = await js<Pose | null>(
      page,
      `(() => { const s = window.__sky, g = s.game(), p = g.position();
        const d = s.deckNear(p.e, p.n, 3, 0);
        if (!d) return null;
        let yaw = d.yaw; const want = ${(305 * Math.PI) / 180};
        if (Math.cos(yaw - want) < 0) yaw += Math.PI;
        return { e: d.e, n: d.n, z: d.z, yaw, width: d.width, ow: 1, cls: 0, d: d.d }; })()`,
    );
    await log("bridge deck", JSON.stringify(pose));
    if (!pose) throw new Error("no road deck near the bridge spot");
    await js(
      page,
      `(() => { const s = window.__sky, o = ${JSON.stringify(pose)}; ${AT}
        s.clear(o.e, o.n, o.yaw, 6, 160, 1.8);
        const b = at(o, -50, 0);
        s.vehicle({ kind: "taxi", color: 0, e: b.e, n: b.n, z: o.z, yaw: o.yaw, v: 17, enter: true });
        s.game().stick(0, -0.6);
        // keep to the middle of the roadway: steer to the deck's line ahead, at 18 m/s
        s.setBefore(\`
          if (!car) return;
          if (car.v > 18) car.v = 18;
          const S = window.__sky, look = 12;
          const d = S.deckNear(car.e + Math.sin(car.yaw) * look, car.n + Math.cos(car.yaw) * look, 3, 0);
          if (!d) return;
          let yaw = d.yaw; if (Math.cos(yaw - car.yaw) < 0) yaw += Math.PI;
          const side = (d.e - car.e) * Math.cos(car.yaw) - (d.n - car.n) * Math.sin(car.yaw);
          let dy = yaw - car.yaw; dy = ((dy + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          g.stick(Math.max(-1, Math.min(1, side * 0.25 + dy * 1.4)), -0.6);\`); })()`,
    );
    await squaresIn(page, 2, 4);
    await cam(page, SMOOTH_CHASE(9, 0.6, 2.9, -0.03, -0.02, 70, 4));
    await filmTake(page, DIR, "bridge", 300, undefined, progress("bridge"));
    await log("bridge end", JSON.stringify(await carState(page)));
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TAKES);
for (const name of wanted)
  if (!TAKES[name]) throw new Error(`No take "${name}": ${Object.keys(TAKES).join(", ")}`);
await fs.mkdir(path.dirname(PROGRESS), { recursive: true });

for (const name of wanted) {
  const { browser, page } = await openLive("tinynyc", { view: LANDSCAPE, seed: 4242, userDataDir: PROFILE });
  try {
    await page.addStyleTag({ content: WALK_CLEAN });
    await log("take", name);
    await TAKES[name](page);
  } catch (error) {
    await log("FAILED", name, (error as Error).message);
  } finally {
    await browser.close();
  }
}
await log("done");
