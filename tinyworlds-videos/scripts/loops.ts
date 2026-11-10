import fs from "node:fs";
import path from "node:path";
import { encodeForWeb, run } from "./lib/run.js";
import { REPO, ROOT } from "./lib/world.js";

/**
 * Render every world's card loop (loop/, one row of loop/batch/cards.json each: run
 * `npm run plates` first) and encode it small for the front page:
 * tinyworlds-frontend/public/loops/<world>.mp4, 800 × 420, a few hundred kB, committed.
 *   npm run loops
 */
const LOOP = path.join(ROOT, "loop");
const TARGET = path.join(REPO, "tinyworlds-frontend/public/loops");
const SIZE = { width: 800, height: 420, crf: 30 };

const rows = JSON.parse(fs.readFileSync(path.join(LOOP, "batch/cards.json"), "utf8")) as { name: string }[];
run(
  "npx",
  [
    "hyperframes",
    "render",
    "--quality",
    "looks",
    "--batch",
    "batch/cards.json",
    "--output",
    "renders/{name}.mp4",
  ],
  LOOP,
);
fs.mkdirSync(TARGET, { recursive: true });
for (const { name } of rows) {
  const file = path.join(TARGET, `${name}.mp4`);
  encodeForWeb(path.join(LOOP, "renders", `${name}.mp4`), file, SIZE, LOOP);
  console.log(`loop: ${path.relative(REPO, file)} ${(fs.statSync(file).size / 1000).toFixed(0)} kB`);
}
