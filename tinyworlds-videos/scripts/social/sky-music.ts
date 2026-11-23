// The social clips' music beds, composed by ElevenLabs Music from a description of their feel
// (never of their subject, never "in the manner of" anyone's music), as scripts/sound.ts does
// for the films. The key comes from the environment for the one command and is never written.
//   ELEVENLABS_API_KEY=… npm exec -- tsx scripts/social/sky-music.ts sky|chaos [--name bed]
import fs from "node:fs";
import path from "node:path";

const BEDS: Record<string, { dir: string; seconds: number; prompt: string }> = {
  // "From the sky to the sidewalk": wonder from far away, then the lift of driving
  sky: {
    dir: "social-sky",
    seconds: 30,
    prompt: [
      "Instrumental, exactly 100 BPM, 4/4, bright, airy and wide-eyed, a sense of looking down at a",
      "whole city from very high, then arriving in it.",
      "It starts at once, no fade-in, on shimmering plucked synth arpeggios and a soft warm pad,",
      "with light ticking percussion.",
      "At about 9.6 seconds a short rising swell lands on a clear downbeat at 10.8 seconds where a",
      "punchy kick, a round synth bass and handclaps enter and it drives forward with energy,",
      "optimistic and cinematic, a bright lead melody on top.",
      "From about 24 seconds it eases off and holds one warm, ringing chord to the end.",
      "No vocals, no spoken words, no sound effects.",
    ].join(" "),
  },
  // "Street Walk: real New York in a browser tab": fast cuts on the beat
  chaos: {
    dir: "social-chaos",
    seconds: 32,
    prompt: [
      "Instrumental, exactly 120 BPM, 4/4, gritty, confident and urgent, an original big-city",
      "action cue: tight punchy drums with a hard snare on beats 2 and 4, a distorted analog synth",
      "bass riff, short brass-like synth stabs and a driving hi-hat.",
      "It starts at once on the full groove at the very first beat, no intro, no fade-in.",
      "Every two bars a short accent hit marks the downbeat. A brief drop to bass and kick alone",
      "around 10 seconds, then the full groove slams back in at 12 seconds, bigger.",
      "From about 26 seconds it stops on one heavy hit and lets a low synth chord ring out to the end.",
      "No vocals, no spoken words, no sound effects, no samples of existing songs.",
    ].join(" "),
  },
};

const which = process.argv[2] ?? "";
const bed = BEDS[which];
if (!bed) {
  console.error(`Say which: ${Object.keys(BEDS).join(", ")}`);
  process.exit(1);
}
const key = (process.env.ELEVENLABS_API_KEY ?? "").trim();
if (!key) {
  console.error("Set ELEVENLABS_API_KEY for this command.");
  process.exit(1);
}
const i = process.argv.indexOf("--name");
const name = i >= 0 ? (process.argv[i + 1] ?? "bed") : "bed";
const out = path.resolve(bed.dir, "assets/music", `${name}.mp3`);
fs.mkdirSync(path.dirname(out), { recursive: true });

const response = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", {
  method: "POST",
  headers: { "xi-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({
    prompt: bed.prompt,
    music_length_ms: Math.round(bed.seconds * 1000),
    model_id: "music_v1",
    force_instrumental: true,
  }),
});
if (!response.ok) {
  console.error(`ElevenLabs answered ${response.status}: ${(await response.text()).slice(0, 600)}`);
  process.exit(1);
}
fs.writeFileSync(out, Buffer.from(await response.arrayBuffer()));
console.log(`music: ${path.relative(process.cwd(), out)} ${(fs.statSync(out).size / 1000).toFixed(0)} kB`);
