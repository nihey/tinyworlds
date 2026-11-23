// Stills to plan the San Francisco take: the whole map, the Golden Gate on the map, then the walk
// on its deck with a car put there, seen from a few cameras. Also says how long a frame takes.
//   SITE_URL=… npm exec -- tsx scripts/social/sky-probe.ts [lat,lon,heading]
import path from "node:path";
import { chrome, jump, settle } from "../lib/film.js";
import { LANDSCAPE, openLive } from "../lib/live.js";
import { idle, js, soak, still, walkAt, WALK_CLEAN } from "./sky-lib.js";

const [spot = "37.8100,-122.4772,354"] = process.argv.slice(2);
const out = path.resolve("out/social/sky-probe");
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);

const { browser, page } = await openLive("tinysfo", { view: LANDSCAPE, seed: 11 });
try {
  page.on("console", (m) =>
    m.type() === "error" ? console.log("page:", m.text().slice(0, 200)) : undefined,
  );
  await page.addStyleTag({ content: WALK_CLEAN });
  await chrome(page, 0);
  const m = await js<{
    b: { minX: number; minY: number; maxX: number; maxY: number };
    gg: { x: number; y: number };
  }>(
    page,
    `({ b: tinyworld.manifest ? tinyworld.manifest.bounds : null, gg: tinyworld.projection.toMap(-122.4783, 37.8199) })`,
  ).catch(async () =>
    js<{ b: null; gg: { x: number; y: number } }>(
      page,
      `({ b: null, gg: tinyworld.projection.toMap(-122.4783, 37.8199) })`,
    ),
  );
  log("map", JSON.stringify(m));
  const b = { minX: -30250, minY: -13525, maxX: 21950, maxY: 15275 };
  const whole = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, scale: 960 / (b.maxX - b.minX) };
  await jump(page, whole);
  await settle(page);
  await still(page, path.join(out, "map-whole.png"));
  log("whole");
  for (const s of [0.12, 0.35, 0.8]) {
    await jump(page, { x: m.gg.x, y: m.gg.y - 60, scale: s });
    await settle(page);
    await still(page, path.join(out, `map-gg-${s}.png`));
    log("gg", s);
  }

  await walkAt(page, spot);
  log("walk ready", JSON.stringify(await js(page, "window.__sky.summary()")));
  await soak(page, 8);
  await still(page, path.join(out, "walk-foot.png"));
  const pos = await js<{ e: number; n: number; z: number; yaw: number }>(
    page,
    "window.__sky.game().position()",
  );
  log("pos", JSON.stringify(pos));

  // a red supercar on the deck, ahead of where the walk opened, heading north
  await js(
    page,
    `(() => { const s = window.__sky; const g = s.game(); const p = g.position(); const yaw = ${(354 * Math.PI) / 180};
      s.clear(p.e, p.n, yaw, 20, 120, 6);
      s.vehicle({ kind: "supercar", color: 0, e: p.e + Math.sin(yaw) * 4, n: p.n + Math.cos(yaw) * 4, z: p.z, yaw, v: 8, enter: true });
      g.stick(0, -0.5); })()`,
  );
  const started = Date.now();
  for (let i = 0; i < 30; i++) {
    await js(page, "window.__sky.frames(1)");
    await page.screenshot({ type: "png", optimizeForSpeed: true });
  }
  log("ms/frame (with picture)", (Date.now() - started) / 30);
  await still(page, path.join(out, "walk-chase.png"));
  log(
    "car",
    JSON.stringify(
      await js(
        page,
        "(() => { const c = window.__sky.car; return { e: c.e, n: c.n, z: c.z, v: c.v, yaw: c.yaw, state: c.state, damage: c.damage }; })()",
      ),
    ),
  );

  // cameras round the car: low beside, high behind, a crane above
  const cams: Record<string, string> = {
    low: `const s=Math.sin(car.yaw),c=Math.cos(car.yaw); return {e:car.e - s*7 + c*2.6, n:car.n - c*7 - s*2.6, z:car.z+1.6, yaw:car.yaw-0.12, pitch:0.18, fov:74};`,
    high: `const s=Math.sin(car.yaw),c=Math.cos(car.yaw); return {e:car.e - s*30 + c*14, n:car.n - c*30 - s*14, z:car.z+22, yaw:car.yaw-0.35, pitch:-0.32, fov:62};`,
    crane: `const s=Math.sin(car.yaw),c=Math.cos(car.yaw); return {e:car.e - s*90 + c*40, n:car.n - c*90 - s*40, z:car.z+90, yaw:car.yaw-0.3, pitch:-0.62, fov:60};`,
    side: `const s=Math.sin(car.yaw),c=Math.cos(car.yaw); return {e:car.e + c*9 + s*3, n:car.n - s*9 + c*3, z:car.z+2.2, yaw:car.yaw-1.4, pitch:0.05, fov:72};`,
  };
  for (const [name, src] of Object.entries(cams)) {
    await js(page, `window.__sky.setCam(${JSON.stringify(src)})`);
    await soak(page, name === "crane" ? 10 : 4);
    await still(page, path.join(out, `walk-${name}.png`));
    log(name);
  }
  await js(page, "window.__sky.setCam(null)");
  await idle(page, 1);
} finally {
  await browser.close();
}
log("done");
