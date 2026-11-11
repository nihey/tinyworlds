// Opens a world in headless Chrome: a still at a view, a hover over a point of the screen, and a
// round of Guess the building; prints what the sight's sign and the quiz card said, and the
// page's errors. The URL's hash is "#<lat>,<lon>,<scale>" (latitude first).
// usage: node check-viewer.mjs <videosDir> <url-with-hash> <outPrefix> <hoverX> <hoverY>
import { createRequire } from "node:module";
import path from "node:path";
const [videos, url, out, hx, hy] = process.argv.slice(2);
const require = createRequire(path.join(videos, "package.json"));
const puppeteer = require("puppeteer-core");
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--lang=en-US"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: `${out}-view.png` });
await page.mouse.move(Number(hx), Number(hy));
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${out}-hover.png` });
// the sight's sign: its name and its article's opening (a <p lang=…>)
const sign = await page.evaluate(() =>
  [...document.querySelectorAll("p[lang]")].map((p) => p.closest(".sign")?.innerText ?? p.innerText),
);
await page.mouse.move(5, 450);
// a world without the game (too few articles) has no invitation: nothing more to check
const invited = await page.$(".quiz-invite");
if (invited) await invited.click();
await new Promise((r) => setTimeout(r, 5000));
// the game opens on its choices (difficulty, area, kind): start a round with them as they are
await page.evaluate(() => {
  const start = [...document.querySelectorAll(".quiz-card button")].find((b) =>
    /^(start|começar|empezar)/i.test(b.textContent?.trim() ?? ""),
  );
  start?.click();
});
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: `${out}-quiz.png` });
const quiz = await page.evaluate(() => document.querySelector(".quiz-card")?.innerText ?? null);
// pick the first name offered, then look at the answer
await page.keyboard.press("A");
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${out}-answer.png` });
const answer = await page.evaluate(() => document.querySelector(".quiz-card")?.innerText ?? null);
console.log(JSON.stringify({ sign, quiz, answer, errors: errors.slice(0, 10) }, null, 1));
await browser.close();
