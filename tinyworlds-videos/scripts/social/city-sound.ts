import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../lib/world.js";

/**
 * The music bed of the "Your city" shorts (social-city/), one for the whole series: composed by
 * ElevenLabs Music from a description of its feel, as scripts/sound.ts does for the films.
 * Needs ELEVENLABS_API_KEY in the environment; writes social-city/assets/music/<name>.mp3.
 * The shorts are timed to the bed's measured bars (`npx hyperframes beats`), so a new bed means
 * measuring again.
 *   ELEVENLABS_API_KEY=… npm exec -- tsx scripts/social/city-sound.ts [--name bed] [--seconds 24]
 */
const PROMPT = [
  "Instrumental, exactly 100 BPM, strict 4/4, upbeat, light and playful: a bright toy-pop groove.",
  "It starts at once at full energy on the very first beat, no intro and no fade-in:",
  "a punchy kick on every beat, crisp handclaps on beats 2 and 4, a bouncy round bass,",
  "plucked marimba and a sparkling glockenspiel melody with light chiptune colour.",
  "Even, regular bars all the way, with a short snare fill at the end of every second bar.",
  "The groove keeps going, unchanged in energy, for a full 20 seconds; only then does it land",
  "on one bright final chord with a cymbal crash, which rings out slowly to the end.",
  "No vocals, no spoken words, no sound effects.",
].join(" ");

const flag = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const key = (process.env.ELEVENLABS_API_KEY ?? "").trim();
if (!key) {
  console.error("Set ELEVENLABS_API_KEY to compose the music (see scripts/social/city-sound.ts).");
  process.exit(1);
}
const seconds = Number(flag("seconds", "28"));
const out = path.join(ROOT, "social-city/assets/music", flag("name", "bed") + ".mp3");
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
