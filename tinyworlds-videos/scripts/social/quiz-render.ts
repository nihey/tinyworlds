// Render the "Guess the building" shorts: one row of variables per world (its take, colour,
// wordmark, words in its language, address) through social-quiz/index.html, then each encoded
// to post: H.264 + AAC, yuv420p, 30 fps, the index first. → out/social/quiz/<world>-guess-the-building.mp4
//   SITE_URL=… npm exec -- tsx scripts/social/quiz-render.ts [draft|looks|delivery] [world …]
// The address comes from SITE_URL (or deploy/.env) and only ever lives in a temporary file outside
// the repository, for the length of the render: the repository is public.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../lib/run.js";
import { siteAddress } from "../lib/site.js";
import { ROOT } from "../lib/world.js";
import { langOf } from "./quiz-lib.js";
import { COPY, LOOKS, PICKS } from "./quiz-worlds.js";

const QUALITIES = ["draft", "looks", "delivery"];
const args = process.argv.slice(2);
const quality = QUALITIES.includes(args[0] ?? "") ? args.shift()! : "delivery";
const worlds = args.length ? args : Object.keys(PICKS);
const address = siteAddress();
if (!address) throw new Error("Set SITE_URL: the end card names the world's address");

const project = path.join(ROOT, "social-quiz");
// two batches may render side by side, each with its own folder (and manifest)
const renders = process.env.QUIZ_RENDERS ?? "renders";
const outDir = path.join(ROOT, "out/social/quiz");
fs.mkdirSync(outDir, { recursive: true });

const rows = worlds.map((world) => {
  const take = `assets/takes/${world}.mp4`;
  if (!fs.existsSync(path.join(project, take))) throw new Error(`${world}: no take (quiz-take.ts ${world})`);
  const words = COPY[langOf(world)];
  const looks = LOOKS[world];
  return {
    name: world,
    take,
    mark: looks.mark,
    accent: looks.accent,
    hook1: words.hook1,
    hook2: words.hook2,
    round1: words.round.replace("{n}", "1"),
    round2: words.round.replace("{n}", "2"),
    round3: words.round.replace("{n}", "3"),
    end1: words.end1,
    end2: words.end2,
    comments: words.comments,
    play: words.play,
    address: `${address}/${world}/`,
  };
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quiz-rows-"));
const batch = path.join(tmp, "rows.json");
try {
  fs.writeFileSync(batch, JSON.stringify(rows, null, 2));
  run(
    "npx",
    [
      "hyperframes", "render", "--quality", quality, "--workers", process.env.QUIZ_WORKERS ?? "2",
      "--batch", batch, "--output", `${renders}/{name}.mp4`,
    ], // prettier-ignore
    project,
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

for (const { name } of rows) {
  const source = path.join(project, renders, `${name}.mp4`);
  const target = path.join(outDir, `${name}-guess-the-building.mp4`);
  run(
    "ffmpeg",
    [
      "-v", "error", "-y", "-i", source,
      "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30",
      "-profile:v", "high", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-movflags", "+faststart", target,
    ], // prettier-ignore
    project,
  );
  console.log(`quiz: ${path.relative(ROOT, target)} ${(fs.statSync(target).size / 1e6).toFixed(1)} MB`);
}
