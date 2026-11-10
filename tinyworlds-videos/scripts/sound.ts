import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/world.js";

/**
 * The film's music bed, composed by ElevenLabs Music from a description of its feel (never of
 * its subject). Needs ELEVENLABS_API_KEY in the environment; the track is written to
 * film/assets/music/bed.mp3, which is not committed.
 *   ELEVENLABS_API_KEY=… npm run sound [-- --seconds 38]
 */
const PROMPT = [
  "Instrumental, 90 BPM, 4/4, warm and unhurried, playful and miniature: a toy-box feel.",
  "It starts at once on a soft plucked synth arpeggio over a gentle pulse, no slow fade-in.",
  "A new layer joins every four bars: a round bass, then light brushed percussion and handclaps,",
  "then a bright bell melody with chiptune colours over warm analog pads.",
  "The arrangement is fullest from about 24 seconds, then settles on one long held chord to end.",
  "No vocals, no spoken words, no sound effects.",
].join(" ");

const flag = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const key = (process.env.ELEVENLABS_API_KEY ?? "").trim();
if (!key) {
  console.error("Set ELEVENLABS_API_KEY to compose the music (see scripts/sound.ts).");
  process.exit(1);
}
const seconds = Number(flag("seconds", "38"));
const out = path.join(ROOT, "film/assets/music", flag("name", "bed") + ".mp3");
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
