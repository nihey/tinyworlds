import fs from "node:fs";
import path from "node:path";
import { encodeForWeb, run } from "./lib/run.js";
import { REPO, ROOT } from "./lib/world.js";

/**
 * Render every world's card loop (loop/, one row of loop/batch/cards.json each: run
 * `npm run plates` first) and encode it small for the front page:
 * tinyworlds-frontend/public/loops/<world>.mp4, 800 × 420, a few hundred kB, committed.
 * Name worlds to render only theirs, leaving the others' loops as they are.
 *   npm run loops [-- tinylax …]
 */
const LOOP = path.join(ROOT, "loop");
const TARGET = path.join(REPO, "tinyworlds-frontend/public/loops");
const SIZE = { width: 800, height: 420, crf: 30 };

const all = JSON.parse(fs.readFileSync(path.join(LOOP, "batch/cards.json"), "utf8")) as { name: string }[];
const only = process.argv.slice(2);
const rows = only.length ? all.filter((row) => only.includes(row.name)) : all;
const missing = only.filter((id) => !rows.some((row) => row.name === id));
if (missing.length)
  throw new Error(`no card plates for ${missing.join(", ")}: run npm run plates -- ${missing.join(" ")}`);
// a run for some worlds renders a batch of their rows alone
const batch = only.length ? "batch/some-cards.json" : "batch/cards.json";
if (only.length) fs.writeFileSync(path.join(LOOP, batch), JSON.stringify(rows, null, 2));
run(
  "npx",
  ["hyperframes", "render", "--quality", "looks", "--batch", batch, "--output", "renders/{name}.mp4"],
  LOOP,
);
fs.mkdirSync(TARGET, { recursive: true });
for (const { name } of rows) {
  const file = path.join(TARGET, `${name}.mp4`);
  encodeForWeb(path.join(LOOP, "renders", `${name}.mp4`), file, SIZE, LOOP);
  console.log(`loop: ${path.relative(REPO, file)} ${(fs.statSync(file).size / 1000).toFixed(0)} kB`);
}
