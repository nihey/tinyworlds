// What the walk screen says while it loads: its status lines and a still every so often.
//   SITE_URL=… npm exec -- tsx scripts/social/sky-debug.ts [world] [lat,lon,heading]
import path from "node:path";
import { LANDSCAPE, openLive } from "../lib/live.js";
import { idle, still } from "./sky-lib.js";
import { sleep } from "../lib/film.js";

const [world = "tinysfo", spot = "37.8100,-122.4772,354"] = process.argv.slice(2);
const out = path.resolve("out/social/sky-debug");
const t0 = Date.now();
const { browser, page } = await openLive(world, { view: LANDSCAPE, seed: 11 });
try {
  page.on("console", (m) => console.log("page:", m.type(), m.text().slice(0, 200)));
  await page.evaluate((s) => (location.hash = `walk=${s}`), spot);
  for (let i = 0; i < 40; i++) {
    for (let k = 0; k < 20; k++) {
      await idle(page, 3);
      await sleep(60);
    }
    const info = await page.evaluate(`(() => ({
      minimap: Boolean(document.querySelector(".walk-minimap")),
      pane: Boolean(document.querySelector(".walk-pane")),
      status: [...document.querySelectorAll("[role='status']")].map((e) => (e.getAttribute("aria-live") || "-") + ":" + e.textContent.slice(0, 80)),
      text: (document.querySelector(".walk-pane") || document.body).innerText.slice(0, 300),
    }))()`);
    console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, JSON.stringify(info));
    await still(page, path.join(out, `${world}-${i}.png`));
  }
} finally {
  await browser.close();
}
