import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/world.js";

/**
 * The music bed of the "Guess the building" shorts, one for the whole series: composed by
 * ElevenLabs Music from a description of its feel (never "in the manner of" anyone). Needs
 * ELEVENLABS_API_KEY in the environment, for this one command; the track is written to
 * social-quiz/assets/music/bed.mp3 (committed, like every film's bed: the clips' moments are
 * its bars, `SCHEDULE` in quiz-take.ts). Running this again gives a different piece.
 *   ELEVENLABS_API_KEY=… npm exec -- tsx scripts/social/quiz-sound.ts [--seconds 31] [--name bed]
 */
const PROMPT = [
  "Instrumental, exactly 120 BPM, 4/4, light, playful and curious, a tiny game-show quiz feel.",
  "It starts at once on the first beat, no fade-in: a steady ticking woodblock and closed hi-hat",
  "on every eighth note, like a friendly clock, under plucked pizzicato strings and a bouncy",
  "marimba riff in a major key. A round soft bass and a light kick on beats one and three join",
  "after two bars. The groove stays even and steady the whole way, in clear four-bar phrases,",
  "with a bright glockenspiel answer every fourth bar. From 24 seconds it lifts a little,",
  "then lands on one warm held chord at 28 seconds that rings out to the end.",
  "No vocals, no spoken words, no sound effects.",
].join(" ");

const flag = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const key = (process.env.ELEVENLABS_API_KEY ?? "").trim();
if (!key) {
  console.error("Set ELEVENLABS_API_KEY to compose the music (see scripts/social/quiz-sound.ts).");
  process.exit(1);
}
const seconds = Number(flag("seconds", "31"));
const out = path.join(ROOT, "social-quiz/assets/music", `${flag("name", "bed")}.mp3`);
fs.mkdirSync(path.dirname(out), { recursive: true });

const response = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", {
  method: "POST",
  headers: { "xi-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({
    prompt: PROMPT,
    music_length_ms: Math.round(seconds * 1000),
    model_id: "music_v1",
    force_instrumental: true,
  }),
});
if (!response.ok) {
  console.error(`ElevenLabs answered ${response.status}: ${(await response.text()).slice(0, 600)}`);
  process.exit(1);
}
fs.writeFileSync(out, Buffer.from(await response.arrayBuffer()));
console.log(`music: ${path.relative(ROOT, out)} ${(fs.statSync(out).size / 1000).toFixed(0)} kB`);
