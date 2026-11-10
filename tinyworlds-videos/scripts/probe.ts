import fs from "node:fs";
import path from "node:path";
import { chrome, jump, openStage, settle, shoot, tick } from "./lib/film.js";
import { ROOT } from "./lib/world.js";

/**
 * Look before filming: stills of the viewer at given views and moments, to choose a take's
 * framings. Each argument is name:lon,lat,scale[,riseMetres][@seconds][+chrome].
 *   VIEWER_URL=http://localhost:3211/ npx tsx scripts/probe.ts top:-73.9857,40.7484,3,380
 */
const url = process.env.VIEWER_URL ?? "http://localhost:3000/";
const out = path.join(ROOT, "out/probe");
fs.mkdirSync(out, { recursive: true });
const { browser, page } = await openStage(url);
const info = await page.evaluate(() => {
  const e = (
    window as unknown as {
      tinyworld: {
        getFitScale(): number;
        getScaleLimits(): unknown;
        manifest: { bounds: unknown; geo: { kz: number } };
      };
    }
  ).tinyworld;
  return {
    fit: e.getFitScale(),
    limits: e.getScaleLimits(),
    bounds: e.manifest.bounds,
    kz: e.manifest.geo.kz,
  };
});
console.log(JSON.stringify(info));
for (const arg of process.argv.slice(2)) {
  const [name, rest] = arg.split(":");
  const withChrome = rest.endsWith("+chrome");
  const [spec, at] = rest.replace("+chrome", "").split("@");
  const [lon, lat, scale, rise] = spec.split(",").map(Number);
  const p = await page.evaluate(
    ([lo, la]) =>
      (
        window as unknown as {
          tinyworld: { projection: { toMap(lon: number, lat: number): { x: number; y: number } } };
        }
      ).tinyworld.projection.toMap(lo, la),
    [lon, lat],
  );
  await chrome(page, withChrome ? 1 : 0);
  const seconds = Number(at ?? 0);
  const now = await page.evaluate(() => (window as unknown as { __film: { now(): number } }).__film.now());
  // jump the clock there: what moves on the map is a function of its time
  if (seconds * 1000 > now)
    await page.evaluate(
      (ms) => (window as unknown as { __film: { advance(ms: number): void } }).__film.advance(ms),
      seconds * 1000 - now,
    );
  await jump(page, { x: p.x, y: p.y - (rise ?? 0) * info.kz, scale });
  await settle(page);
  for (let i = 0; i < 8; i++) {
    await tick(page);
    await settle(page);
  } // let the tiles fade in
  fs.writeFileSync(path.join(out, `${name}.png`), await shoot(page));
  console.log(`probe: ${name} at`, JSON.stringify(p));
}
await browser.close();
