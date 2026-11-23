// A look at the live site from this machine: a map still, then a street walk still.
// npm exec -- tsx scripts/social/smoke.ts [world] [lat,lon,scale] [lat,lon,heading]
import fs from "node:fs/promises";
import path from "node:path";
import { chrome, settle, shoot, sleep } from "../lib/film.js";
import { openLive, VERTICAL } from "../lib/live.js";

const [world = "tinynyc", at = "40.7580,-73.9855,1.4", walk = "40.75804,-73.98550,29"] =
  process.argv.slice(2);
const out = path.resolve("out/social/smoke");
await fs.mkdir(out, { recursive: true });

const started = Date.now();
const { browser, page } = await openLive(world, { hash: at, view: VERTICAL, seed: 7 });
try {
  page.on("console", (m) =>
    m.type() === "error" ? console.log("page:", m.text().slice(0, 200)) : undefined,
  );
  await chrome(page, 0);
  await settle(page);
  await fs.writeFile(path.join(out, `${world}-map.png`), await shoot(page));
  console.log("map still", (Date.now() - started) / 1000, "s");

  await page.evaluate((spot) => (location.hash = `walk=${spot}`), walk);
  for (let i = 0; i < 300; i++) {
    await page.evaluate(() => {
      const film = (window as unknown as { __film: { advance(ms: number): void; flush(): void } }).__film;
      for (let k = 0; k < 3; k++) {
        film.advance(1000 / 30);
        film.flush();
      }
    });
    const ready = await page.evaluate(
      () =>
        Boolean(document.querySelector(".walk-minimap")) &&
        !document.querySelector(".walk-pane [role='status']:not([aria-live])"),
    );
    if (ready && i > 20) break;
    await sleep(60);
  }
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => {
      const film = (window as unknown as { __film: { advance(ms: number): void; flush(): void } }).__film;
      film.advance(1000 / 30);
      film.flush();
    });
    await sleep(30);
  }
  await fs.writeFile(path.join(out, `${world}-walk.png`), await shoot(page));
  const gl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2");
    return g ? String(g.getParameter(g.RENDERER)) : "none";
  });
  console.log("walk still", (Date.now() - started) / 1000, "s; webgl2:", gl);
} finally {
  await browser.close();
}
