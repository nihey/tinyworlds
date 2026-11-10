import fs from "node:fs";
import path from "node:path";
import { run } from "./lib/run.js";
import { siteAddress } from "./lib/site.js";
import { ROOT } from "./lib/world.js";

/**
 * Render the showcase film (film/) to out/film/tinyworlds.mp4, and a smaller copy to post beside
 * it (tinyworlds-web.mp4). The end card's address is given
 * here, from SITE_URL or the gitignored deploy/.env, because the film's source never names the
 * site; without one the film says "example.com", which is only good for a look.
 *   npm run film [-- draft | looks | delivery]
 */
const quality = process.argv[2] ?? "delivery";
const address = siteAddress();
const out = path.join(ROOT, "out/film");
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, "tinyworlds.mp4");
run(
  "npx",
  [
    "hyperframes", "render", "--quality", quality, "--output", file,
    ...(address ? ["--variables", JSON.stringify({ address })] : []),
  ], // prettier-ignore
  path.join(ROOT, "film"),
);
if (!address)
  console.warn("film: no site address known (SITE_URL or deploy/.env): the end card says example.com");
console.log(`film: ${path.relative(ROOT, file)} ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`);

// a copy light enough to post: the same picture and sound, more tightly packed
const web = path.join(out, "tinyworlds-web.mp4");
run(
  "ffmpeg",
  [
    "-v", "error", "-y", "-i", file,
    "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-profile:v", "high",
    // a touch quieter: repacking the sound lifts its peaks, and they should stay under -1 dBTP
    "-af", "volume=-0.6dB", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", web,
  ], // prettier-ignore
  out,
);
console.log(`film: ${path.relative(ROOT, web)} ${(fs.statSync(web).size / 1e6).toFixed(1)} MB`);
