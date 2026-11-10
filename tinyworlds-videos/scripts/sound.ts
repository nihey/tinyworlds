import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/world.js";

/**
 * A film's music bed, composed by ElevenLabs Music from a description of its feel (never of its
 * subject, and never "in the manner of" anyone's music). Needs ELEVENLABS_API_KEY in the
 * environment; the track is written to <film>/assets/music/bed.mp3. That file is committed, and
 * the film is timed to it: running this replaces it with a different piece, so the film's
 * moments have to be measured and set again.
 *   ELEVENLABS_API_KEY=… npm run sound [-- --for film | westeros] [--seconds 38]
 */
const BEDS: Record<string, { prompt: string; seconds: number }> = {
  // the showcase film
  film: {
    seconds: 38,
    prompt: [
      "Instrumental, 90 BPM, 4/4, warm and unhurried, playful and miniature: a toy-box feel.",
      "It starts at once on a soft plucked synth arpeggio over a gentle pulse, no slow fade-in.",
      "A new layer joins every four bars: a round bass, then light brushed percussion and handclaps,",
      "then a bright bell melody with chiptune colours over warm analog pads.",
      "The arrangement is fullest from about 24 seconds, then settles on one long held chord to end.",
      "No vocals, no spoken words, no sound effects.",
    ].join(" "),
  },
  // the tour of tinywesteros: a place a bar, at 80 BPM
  westeros: {
    seconds: 38,
    prompt: [
      "Instrumental, exactly 80 BPM, 4/4, an original stately march for a small early-music band,",
      "solemn but with a spring in its step, like the overture to a puppet theatre's epic.",
      "It starts at once, no fade-in: a low frame drum on the first beat of every bar under a plucked",
      "lute ostinato in a minor key. A hurdy-gurdy drone and a solo fiddle melody join after four",
      "bars, then low brass and a second drum; a small choir of recorders doubles the tune.",
      "It grows steadily, is fullest from about 27 seconds, lands on one loud drum stroke at",
      "30 seconds and holds a single warm chord that rings out to the end.",
      "No vocals, no spoken words, no sound effects.",
    ].join(" "),
  },
};

const flag = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};

const key = (process.env.ELEVENLABS_API_KEY ?? "").trim();
if (!key) {
  console.error("Set ELEVENLABS_API_KEY to compose the music (see scripts/sound.ts).");
  process.exit(1);
}
const film = flag("for", "film");
const bed = BEDS[film];
if (!bed) {
  console.error(`No music is described for "${film}". Known: ${Object.keys(BEDS).join(", ")}`);
  process.exit(1);
}
const seconds = Number(flag("seconds", String(bed.seconds)));
const out = path.join(ROOT, film, "assets/music", flag("name", "bed") + ".mp3");
fs.mkdirSync(path.dirname(out), { recursive: true });

const response = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", {
  method: "POST",
  headers: { "xi-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({
    prompt: bed.prompt,
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
