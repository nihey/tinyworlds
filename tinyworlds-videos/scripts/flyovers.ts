import fs from "node:fs";
import path from "node:path";
import { encodeForWeb, run } from "./lib/run.js";
import { REPO, ROOT } from "./lib/world.js";
import { heroName } from "./worlds.js";

/**
 * Render the flyovers (flyover/, rows from `npm run plates`):
 *  - one per city with its sign, 1920 × 1080, to share: out/flyovers/<world>.mp4 (not committed);
 *  - the heroes, with no sign, small for the front page, one per world:
 *    tinyworlds-frontend/public/loops/hero.mp4 (the first world's) and hero-<world>.mp4, each
 *    with its first frame as a .jpg (committed).
 *   npm run flyovers [-- hero [world …] | cities]
 */
const FLYOVER = path.join(ROOT, "flyover");
const only = process.argv[2];
/** After "hero": the worlds whose films to render. None named: all of them. */
const named = process.argv.slice(3).map(heroName);
const render = (batch: string): { name: string }[] => {
  run(
    "npx",
    [
      "hyperframes",
      "render",
      "--quality",
      "looks",
      "--batch",
      `batch/${batch}`,
      "--output",
      "renders/{name}.mp4",
    ],
    FLYOVER,
  );
  return JSON.parse(fs.readFileSync(path.join(FLYOVER, "batch", batch), "utf8")) as { name: string }[];
};

if (only !== "hero") {
  const out = path.join(ROOT, "out/flyovers");
  fs.mkdirSync(out, { recursive: true });
  for (const { name } of render("flyovers.json")) {
    const file = path.join(out, `${name}.mp4`);
    encodeForWeb(
      path.join(FLYOVER, "renders", `${name}.mp4`),
      file,
      { width: 1920, height: 1080, crf: 20 },
      FLYOVER,
    );
    console.log(`flyover: ${path.relative(REPO, file)} ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);
  }
}

if (only !== "cities") {
  const target = path.join(REPO, "tinyworlds-frontend/public/loops");
  fs.mkdirSync(target, { recursive: true });
  let batch = "hero.json";
  if (named.length > 0) {
    // the rows `npm run plates` wrote, for the worlds asked for only
    const rows = JSON.parse(fs.readFileSync(path.join(FLYOVER, "batch/hero.json"), "utf8")) as {
      name: string;
    }[];
    const wanted = rows.filter((row) => named.includes(row.name));
    const missing = named.filter((name) => !wanted.some((row) => row.name === name));
    if (missing.length > 0)
      throw new Error(`No hero row for ${missing.join(", ")}: run "npm run plates" for them first.`);
    batch = "hero-named.json";
    fs.writeFileSync(path.join(FLYOVER, "batch", batch), JSON.stringify(wanted, null, 2) + "\n");
  }
  for (const { name } of render(batch)) {
    const source = path.join(FLYOVER, "renders", `${name}.mp4`);
    const file = path.join(target, `${name}.mp4`);
    encodeForWeb(source, file, { width: 1280, height: 720, crf: 30 }, FLYOVER);
    // what shows before the film arrives, and instead of it for visitors who asked for less motion
    const still = path.join(target, `${name}.jpg`);
    run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-i",
        source,
        "-frames:v",
        "1",
        "-vf",
        "scale=1280:720:flags=lanczos",
        "-q:v",
        "4",
        still,
      ],
      FLYOVER,
    );
    console.log(
      `hero: ${path.relative(REPO, file)} ${(fs.statSync(file).size / 1000).toFixed(0)} kB, ` +
        `${path.relative(REPO, still)} ${(fs.statSync(still).size / 1000).toFixed(0)} kB`,
    );
  }
}
