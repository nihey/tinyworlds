// A look at the live game at a given viewport, to lay the quiz shorts out: the card asking,
// then answered, with where it is on screen.
// npm exec -- tsx scripts/social/quiz-probe.ts <world> <width> <height> <dpr> [top] [ids,…]
import fs from "node:fs/promises";
import path from "node:path";
import { chrome, settle, shoot } from "../lib/film.js";
import { liveOrigin, openLive } from "../lib/live.js";
import {
  ANSWERED,
  CHOICES,
  HAS_INVITE,
  HELD,
  OPEN_GAME,
  PRESS_START,
  START_READY,
  TALLIED,
  cardStyle,
  langOf,
  quizStorage,
  rectOf,
  run,
  until,
} from "./quiz-lib.js";

const [world = "tinyphl", w = "540", h = "960", d = "2", topArg = "", idsArg = ""] = process.argv.slice(2);
const view = { width: Number(w), height: Number(h), dpr: Number(d) };
const top = topArg && topArg !== "-" ? Number(topArg) : undefined;
const out = path.resolve("out/social/quiz/probe");
await fs.mkdir(out, { recursive: true });
const tag = `${world}-${w}x${h}@${d}${top === undefined ? "" : `-t${top}`}`;

const first = idsArg ? idsArg.split(",") : [];
const all = first.length
  ? (
      (await (await fetch(`${liveOrigin()}/${world}/data/quiz.${langOf(world)}.json`)).json()) as {
        questions: { id: string }[];
      }
    ).questions.map((q) => q.id)
  : [];
const { browser, page } = await openLive(world, {
  view,
  seed: 11,
  prefs: { lang: langOf(world) },
  init: first.length
    ? quizStorage(
        world,
        "easy",
        all.filter((id) => !first.includes(id)),
      )
    : undefined,
});
try {
  page.on("console", (m) =>
    m.type() === "error" ? console.log("page:", m.text().slice(0, 200)) : undefined,
  );
  await chrome(page, 0);
  await page.addStyleTag({ content: cardStyle({ top, right: top === undefined ? undefined : 70 }) });
  await until(page, HAS_INVITE);
  await page.evaluate(OPEN_GAME);
  await until(page, START_READY);
  await page.evaluate(PRESS_START);
  await run(page, 2.2);
  await settle(page);
  await fs.writeFile(path.join(out, `${tag}-ask.png`), await shoot(page));
  const held = await page.evaluate(HELD);
  const choices = (await page.evaluate(CHOICES)) as string[];
  console.log("held", held, "choices", choices, "card", await rectOf(page, ".quiz-card"));
  await page.keyboard.press("A");
  await until(page, ANSWERED, 60);
  try {
    await until(page, TALLIED, 200, 50);
  } catch {
    console.log("no tally");
  }
  await run(page, 0.5);
  await fs.writeFile(path.join(out, `${tag}-answer.png`), await shoot(page));
  console.log("answered card", await rectOf(page, ".quiz-card"));
} finally {
  await browser.close();
}
