import fs from "node:fs";
import path from "node:path";
import {
  FPS,
  VIEW,
  between,
  chrome,
  clamp01,
  easeInOut,
  jump,
  openReel,
  openStage,
  settle,
  shoot,
  sleep,
  through,
  tick,
  type Cam,
} from "./lib/film.js";
import { run } from "./lib/run.js";
import { siteAddress, siteUrl } from "./lib/site.js";
import sharp from "sharp";
import { REPO, ROOT } from "./lib/world.js";
import { heroName } from "./worlds.js";

/**
 * The recap film (recap/): what the project has done so far, and the invitation to lay the next
 * stone. `recap/SPEC.md` is its brief.
 *
 *   ELEVENLABS_API_KEY=… npm run recap -- voice [take]   the narration, one take of the whole script, with
 *                                                 each word's time → recap/assets/voice/ (committed:
 *                                                 the film is timed to it, like the music bed)
 *   npm run recap -- take                         the real Dallas viewer, filmed (VIEWER_URL: a build of
 *                                                 tinydal served locally) → recap/assets/takes/dallas.mp4
 *   npm run recap -- render [draft|looks|delivery]  → out/recap/tinyworlds-recap.mp4 (+ a copy to post)
 */
const DIR = path.join(ROOT, "recap");
const VOICE = path.join(DIR, "assets/voice");

/**
 * The narration, a phrase a cue: the film places each phrase where its picture is. Each take is
 * one request to ElevenLabs (the whole of it read at once, so it sounds like one reading), cut
 * into its lines; the lines are numbered on across the takes (line-01.wav …). A take is recorded
 * again only when named: the film is timed to the ones it has.
 */
export const VOICE_TAKES: { name: string; lines: string[] }[] = [
  {
    name: "take",
    lines: [
      "Two people brought this city to the map.",
      "Thirty dollars. One stone for every dollar.",
      "When the last stone was laid, Dallas went up.",
      "Every street, drawn by code from open data.",
      "You can search any street, any place.",
      "Point at a building, and it tells you its story.",
      "Then guess the building, and learn the city as you play.",
      "That's thirteen cities so far, all of them free to explore.",
      "Six are here because people paid for them.", // the first cut's; the second cut says line 14
      "Their names stay with their cities, in the Hall of Fame.",
      "London doesn't have a single stone yet.",
      "Lay the first one, and become a permanent benefactor.",
    ],
  },
  {
    // the second cut's history of the map: every city in the order it went up
    name: "take-2",
    lines: ["It started with New York.", "The newest six were paid for by the people who wanted them."],
  },
];

/** A stock ElevenLabs voice: Eric, smooth and friendly. */
const VOICE_ID = process.env.RECAP_VOICE ?? "cjVigY5qzO86Huf0OWal";

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Every word of the take with its time, and every line's span, from the characters' times. */
function wordsOf(LINES: string[], a: Alignment) {
  const text = LINES.join(" ");
  const words: { id: string; text: string; start: number; end: number; line: number }[] = [];
  const lines = LINES.map(() => ({ start: Infinity, end: 0 }));
  let line = 0;
  let lineChars = 0;
  let current: { text: string; start: number; end: number } | null = null;
  const flush = () => {
    if (!current) return;
    words.push({ id: `w${words.length}`, ...current, line });
    lines[line].start = Math.min(lines[line].start, current.start);
    lines[line].end = Math.max(lines[line].end, current.end);
    current = null;
  };
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    if (lineChars >= LINES[line].length && line < LINES.length - 1 && /\s/.test(ch)) {
      flush();
      line++;
      lineChars = 0;
      continue;
    }
    lineChars++;
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    const start = a.character_start_times_seconds[i];
    const end = a.character_end_times_seconds[i];
    if (!current) current = { text: ch, start, end };
    else {
      current.text += ch;
      current.end = end;
    }
  }
  flush();
  if (text.replace(/\s+/g, " ") !== a.characters.join("").replace(/\s+/g, " "))
    console.warn("voice: the alignment's text is not the script's");
  return { words, lines };
}

async function voice(): Promise<void> {
  const key = (process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!key) {
    console.error("Set ELEVENLABS_API_KEY to record the narration (see scripts/recap.ts).");
    process.exit(1);
  }
  const named = process.argv[3];
  if (named && !VOICE_TAKES.some((t) => t.name === named)) {
    console.error(`voice: no take "${named}" (${VOICE_TAKES.map((t) => t.name).join(", ")})`);
    process.exit(2);
  }
  fs.mkdirSync(VOICE, { recursive: true });
  const index = path.join(VOICE, "lines.json");
  type Cut = { line: number; take: string; text: string; file: string; from: number; to: number };
  const kept: Cut[] = fs.existsSync(index)
    ? (JSON.parse(fs.readFileSync(index, "utf8")) as { lines: Cut[] }).lines
    : [];
  let first = 1;
  const cuts: Cut[] = [];
  for (const { name, lines: LINES } of VOICE_TAKES) {
    const numbers = LINES.map((_, i) => first + i);
    first += LINES.length;
    if (named && name !== named) {
      cuts.push(...kept.filter((c) => numbers.includes(c.line)));
      continue;
    }
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_192`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          text: LINES.join(" "),
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
        }),
      },
    );
    if (!response.ok) {
      console.error(`ElevenLabs answered ${response.status}: ${(await response.text()).slice(0, 600)}`);
      process.exit(1);
    }
    const answer = (await response.json()) as { audio_base64: string; alignment: Alignment };
    const take = path.join(VOICE, `${name}.mp3`);
    fs.writeFileSync(take, Buffer.from(answer.audio_base64, "base64"));
    const { words, lines } = wordsOf(LINES, answer.alignment);
    // each line cut out of the take on its own, a little air either side, so the film can place it
    lines.forEach((l, i) => {
      const from = Math.max(0, l.start - 0.06);
      const to = Math.min(lines[i + 1]?.start ?? l.end + 0.4, l.end + 0.18);
      const file = `line-${String(numbers[i]).padStart(2, "0")}.wav`;
      run(
        "ffmpeg",
        [
          "-v", "error", "-y", "-i", take, "-ss", from.toFixed(3), "-to", to.toFixed(3),
          "-af", "afade=t=in:d=0.02,areverse,afade=t=in:d=0.04,areverse", file,
        ], // prettier-ignore
        VOICE,
      );
      // a word's time inside its own cut, which is what the captions are set by
      const own = words
        .filter((w) => w.line === i)
        .map((w) => ({ ...w, line: numbers[i], at: w.start - from, until: w.end - from }));
      cuts.push({ line: numbers[i], take: name, text: LINES[i], file, from, to, words: own } as Cut);
      console.log(`  ${numbers[i]}. ${(to - from).toFixed(2)} s  ${LINES[i]}`);
    });
  }
  cuts.sort((x, y) => x.line - y.line);
  fs.writeFileSync(index, JSON.stringify({ voice: VOICE_ID, lines: cuts }, null, 2) + "\n");
  console.log(`voice: ${cuts.length} lines in ${path.relative(ROOT, index)}`);
}

/**
 * The history of the map: every real city in the order it went up (the viewer's registry, which
 * is the order of the commits that added them), and whether its benefactors brought it (its
 * plaque, from its card on the front page). The fan-made places are not in it.
 */
export const HISTORY: { world: string; plaque?: boolean }[] = [
  { world: "tinynyc" },
  { world: "tinyrao" },
  { world: "tinyorl" },
  { world: "tinyfte" },
  { world: "tinyvlc" },
  { world: "tinylas" },
  { world: "tinylax" },
  { world: "tinydal", plaque: true },
  { world: "tinycvg", plaque: true },
  { world: "tinypit", plaque: true },
  { world: "tinyphl", plaque: true },
  { world: "tinycos", plaque: true },
  { world: "tinytkf", plaque: true },
];

/**
 * Each city's picture for the history: its hero framing, as `npm run plates` cuts it from the
 * tiles (flyover/assets/plates/hero-<world>.png, twice as fine as the picture), drawn a little
 * less fine to keep the film light, and its flyover sign (the pipeline's sign.ts: the wordmark
 * and its address) cut off its sheet. Not committed, like every plate.
 */
async function plates(): Promise<void> {
  const from = path.join(ROOT, "flyover/assets/plates");
  const out = path.join(DIR, "assets/plates");
  fs.mkdirSync(out, { recursive: true });
  for (const { world } of HISTORY) {
    const picture = path.join(from, `${heroName(world)}.png`);
    const sign = path.join(from, `${world}-sign.png`);
    if (!fs.existsSync(picture) || !fs.existsSync(sign))
      throw new Error(`plates: ${world} has no hero plate or sign: npm run plates -- ${world}`);
    const meta = await sharp(picture).metadata();
    await sharp(picture)
      .resize({ width: Math.round((meta.width ?? 0) * 0.625), kernel: "lanczos3" })
      .png({ compressionLevel: 6 })
      .toFile(path.join(out, `${world}.png`));
    await sharp(sign)
      .trim({ threshold: 0 })
      .png()
      .toFile(path.join(out, `${world}-sign.png`));
    console.log(`plates: ${world}`);
  }
}

/**
 * The film's clock for the Dallas take, in seconds of the film (the take starts at `start`):
 * set by the narration (recap/assets/voice/lines.json, placed in index.html) and the bed's beats.
 */
export const TAKE_AT = {
  start: 7.0, // the take's first frame: the whole of Dallas, as the keystone opens onto it
  dive: 8.4, // down into downtown, while "every street, drawn by code from open data" is said
  street: 11.1, // at street level; the viewer's signs come up
  click: 11.85, // the search field is clicked
  type: 12.0, // "reunion tower" is typed
  choose: 13.5, // the first result is clicked: the viewer flies there
  frame: 14.55, // the flight is over: the view eases onto the tower, room for its sign at the right
  hover: 15.35, // the pointer is on the tower: it lights up and says what it is
  invite: 18.0, // "Guess the building" is clicked
  play: 18.7, // the choosing card's start button
  pick: 20.7, // the right name is picked
  end: 23.0, // the take's last frame (the film cuts to the front page)
};
const QUERY = "reunion tower";
const KEY_FRAMES = 2.6;
const TAKES = path.join(DIR, "assets/takes");

/** A pixel-art pointer drawn into the page itself, so it is where the real mouse is in every frame. */
const POINTER = (() => {
  const art = [
    "X...........",
    "XX..........",
    "XOX.........",
    "XOOX........",
    "XOOOX.......",
    "XOOOOX......",
    "XOOOOOX.....",
    "XOOOOOOX....",
    "XOOOOOOOX...",
    "XOOOOOOOOX..",
    "XOOOOOOOOOX.",
    "XOOOOOOXXXXX",
    "XOOOXOOX....",
    "XOOX.XOOX...",
    "XOX..XOOX...",
    "XX....XOOX..",
    "X.....XOOX..",
    ".......XX...",
  ];
  const rects = art
    .flatMap((row, y) =>
      [...row].map((c, x) =>
        c === "."
          ? ""
          : `<rect x="${x}" y="${y}" width="1" height="1" fill="${c === "X" ? "#15171a" : "#f4f2ec"}"/>`,
      ),
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 18" width="24" height="36" shape-rendering="crispEdges">${rects}</svg>`;
  return `(() => {
    let s = 7;
    Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const put = () => {
      if (!document.body || document.getElementById("film-pointer")) return;
      const p = document.createElement("div");
      p.id = "film-pointer";
      p.innerHTML = ${JSON.stringify(svg)};
      p.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform-origin:1px 1px;transform:translate(-100px,-100px)";
      document.body.appendChild(p);
      window.addEventListener("mousemove", (e) => {
        p.style.transform = "translate(" + (e.clientX - 1) + "px," + (e.clientY - 1) + "px)" + (p.dataset.down ? " scale(0.84)" : "");
        p.dataset.x = e.clientX; p.dataset.y = e.clientY;
      }, true);
    };
    document.addEventListener("DOMContentLoaded", put);
    setInterval(put, 200);
  })();`;
})();

interface Engine {
  projection: { toMap(lon: number, lat: number): { x: number; y: number } };
  mapToScreen(x: number, y: number): { x: number; y: number };
  manifest: { bounds: { minX: number; minY: number; maxX: number; maxY: number }; geo: { kz: number } };
  getView(): Cam;
  sightState: { held?: string | null; hovered: string | null; pinned: string | null };
}
type Viewer = Window & { tinyworld: Engine };
type Point = { x: number; y: number };

async function take(): Promise<void> {
  const url = process.env.VIEWER_URL ?? "http://127.0.0.1:8731/tinydal/";
  const sights = (
    JSON.parse(
      fs.readFileSync(path.join(REPO, "tinyworlds-frontend/public/data/tinydal/sights.json"), "utf8"),
    ) as { sights: { id: string; n: string }[] }
  ).sights;
  const nameOf = new Map(sights.map((s) => [s.id, s.n]));
  const { browser, page } = await openStage(url, 0, POINTER);
  const world = await page.evaluate(() => {
    const engine = (window as unknown as Viewer).tinyworld;
    const b = engine.manifest.bounds;
    return {
      tower: engine.projection.toMap(-96.80894, 32.77535), // Reunion Tower's foot
      downtown: engine.projection.toMap(-96.8, 32.7795),
      centre: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
      kz: engine.manifest.geo.kz,
    };
  });
  const whole: Cam = { x: world.centre.x, y: world.centre.y, scale: 0.0105 };
  const street: Cam = { x: world.downtown.x, y: world.downtown.y - 40 * world.kz, scale: 0.42 };
  // the tower left of the middle, its sphere in the upper half, room on the right for its sign
  const towerScale = 0.62;
  const towerCam: Cam = {
    x: world.tower.x + 190 / towerScale,
    y: world.tower.y - 95 * world.kz,
    scale: towerScale,
  };
  const toStreet = Math.log2(street.scale / whole.scale);
  const octaves = through([
    [TAKE_AT.dive, 0],
    [TAKE_AT.dive + 0.6, 0.5],
    [TAKE_AT.street - 0.9, toStreet - 0.55],
    [TAKE_AT.street, toStreet],
  ]);
  const camAt = (t: number): Cam | null => {
    if (t < TAKE_AT.dive) {
      const u = (t - TAKE_AT.start) / (TAKE_AT.dive - TAKE_AT.start);
      return { ...whole, scale: whole.scale * (0.94 + 0.06 * easeInOut(u)) };
    }
    if (t <= TAKE_AT.street) return between(whole, street, octaves(t) / toStreet);
    return null;
  };

  // the pointer's way: each move eased, from where it was to where it goes
  const rest: Point = { x: VIEW.width + 30, y: VIEW.height * 0.6 };
  const moves: { from: Point; to: Point; start: number; end: number }[] = [];
  let at = rest;
  const moveTo = (to: Point, start: number, end: number) => {
    moves.push({ from: at, to, start, end });
    at = to;
  };
  const pointerAt = (t: number): Point => {
    let p = rest;
    for (const m of moves) {
      if (t < m.start) break;
      const u = easeInOut(clamp01((t - m.start) / (m.end - m.start)));
      p = { x: m.from.x + (m.to.x - m.from.x) * u, y: m.from.y + (m.to.y - m.from.y) * u };
    }
    return p;
  };
  const boxOf = (selector: string) =>
    page.$eval(selector, (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height, text: el.textContent ?? "" };
    });
  const press = async (p: Point) => {
    await page.evaluate(() => {
      const el = document.getElementById("film-pointer");
      if (el) el.dataset.down = "1";
    });
    await page.mouse.click(p.x, p.y);
    await sleep(60);
  };
  const release = () =>
    page.evaluate(() => {
      const el = document.getElementById("film-pointer");
      if (el) delete el.dataset.down;
    });

  const frameOf = (s: number) => Math.round((s - TAKE_AT.start) * FPS);
  const total = frameOf(TAKE_AT.end) + 1;
  fs.mkdirSync(TAKES, { recursive: true });
  const reel = openReel(path.join(TAKES, "dallas.mp4"), ROOT);
  const marks: Record<string, unknown> = { fps: FPS, frames: total, at: TAKE_AT, query: QUERY };
  const stills = path.join(ROOT, "out/recap/take");
  fs.mkdirSync(stills, { recursive: true });
  let typed = 0;
  let landed: Cam | null = null;
  let downUntil = -1;

  await chrome(page, 0);
  await jump(page, camAt(TAKE_AT.start)!);
  for (let i = 0; i < 20; i++) {
    await tick(page);
    await settle(page);
  }
  for (let f = 0; f < total; f++) {
    const t = TAKE_AT.start + f / FPS;
    await tick(page);
    const cam = camAt(t);
    if (cam) await jump(page, cam);
    if (t >= TAKE_AT.frame && t < TAKE_AT.hover) {
      landed ??= await page.evaluate(() => {
        const v = (window as unknown as Viewer).tinyworld.getView();
        return { x: v.x, y: v.y, scale: v.scale };
      });
      await jump(page, between(landed, towerCam, easeInOut(clamp01((t - TAKE_AT.frame) / 0.45))));
    }
    if (t >= TAKE_AT.street) await chrome(page, clamp01((t - TAKE_AT.street) / 0.3));

    // the search: field, keys, the first result
    if (f === frameOf(TAKE_AT.street)) {
      const box = await boxOf('input[type="search"], input[role="combobox"]');
      moveTo(
        { x: box.x + Math.min(120, box.width * 0.4), y: box.y + box.height / 2 },
        TAKE_AT.street + 0.25,
        TAKE_AT.click - 0.06,
      );
    }
    if (f === frameOf(TAKE_AT.click)) await press(at);
    if (
      t >= TAKE_AT.type &&
      typed < QUERY.length &&
      f >= frameOf(TAKE_AT.type) + Math.round(typed * KEY_FRAMES)
    ) {
      await page.keyboard.type(QUERY[typed]);
      typed++;
      await sleep(40);
    }
    if (f === frameOf(TAKE_AT.choose - 0.45)) {
      const box = await boxOf('[role="option"]');
      marks.result = box;
      moveTo(
        { x: box.x + Math.min(150, box.width * 0.45), y: box.y + box.height / 2 },
        TAKE_AT.choose - 0.42,
        TAKE_AT.choose - 0.06,
      );
    }
    if (f === frameOf(TAKE_AT.choose)) {
      await press(at);
      // out of the way of the signs while the map flies
      moveTo({ x: VIEW.width * 0.62, y: VIEW.height * 0.6 }, TAKE_AT.choose + 0.12, TAKE_AT.choose + 0.8);
    }
    // the tower: the pointer on its sphere, and it lights up
    if (f === frameOf(TAKE_AT.frame + 0.45)) {
      const sphere = await page.evaluate(
        (x, y) => (window as unknown as Viewer).tinyworld.mapToScreen(x, y),
        world.tower.x,
        world.tower.y - 150 * world.kz,
      );
      marks.tower = sphere;
      moveTo(sphere, TAKE_AT.frame + 0.45, TAKE_AT.hover);
    }
    // the game: its sign, its start button, the right name
    if (f === frameOf(TAKE_AT.invite - 0.4)) {
      const box = await boxOf(".quiz-invite");
      moveTo(
        { x: box.x + box.width * 0.55, y: box.y + box.height / 2 },
        TAKE_AT.invite - 0.4,
        TAKE_AT.invite - 0.04,
      );
    }
    if (f === frameOf(TAKE_AT.invite)) await press(at);
    if (f === frameOf(TAKE_AT.play - 0.35)) {
      const box = await page.$$eval(".quiz-card button", (els) => {
        const go = els.filter((el) => el.className.includes("bg-taxi")).at(-1) ?? els.at(-1)!;
        const r = go.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height, text: go.textContent ?? "" };
      });
      marks.play = box;
      moveTo(
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        TAKE_AT.play - 0.35,
        TAKE_AT.play - 0.04,
      );
    }
    if (f === frameOf(TAKE_AT.play)) {
      await press(at);
      // off the answers until it picks one
      moveTo({ x: VIEW.width * 0.4, y: VIEW.height * 0.8 }, TAKE_AT.play + 0.15, TAKE_AT.play + 0.6);
    }
    if (f === frameOf(TAKE_AT.pick - 0.5)) {
      const held = await page.evaluate(() => (window as unknown as Viewer).tinyworld.sightState.held ?? null);
      const answer = held ? (nameOf.get(held) ?? "") : "";
      const buttons = await page.$$eval(".quiz-card button", (els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top, width: r.width, height: r.height, text: el.textContent ?? "" };
        }),
      );
      const right =
        buttons.find((b) => answer && b.text.includes(answer)) ?? buttons.find((b) => /^[A-D]/.test(b.text));
      marks.question = { held, answer, buttons };
      if (right)
        moveTo(
          { x: right.x + Math.min(160, right.width * 0.5), y: right.y + right.height / 2 },
          TAKE_AT.pick - 0.5,
          TAKE_AT.pick - 0.05,
        );
    }
    if (f === frameOf(TAKE_AT.pick)) await press(at);
    if (
      [TAKE_AT.click, TAKE_AT.choose, TAKE_AT.invite, TAKE_AT.play, TAKE_AT.pick].some(
        (s) => f === frameOf(s),
      )
    )
      downUntil = f + 3;
    if (f === downUntil) await release();
    if (t > TAKE_AT.street) {
      const p = pointerAt(t);
      await page.mouse.move(p.x, p.y);
    }

    await settle(page);
    const frame = await shoot(page);
    await reel.write(frame);
    if (f % 30 === 0) fs.writeFileSync(path.join(stills, `t${t.toFixed(1)}.png`), frame);
    if (f % 60 === 0) console.log(`take: dallas ${f}/${total}`);
  }
  await reel.close();
  fs.writeFileSync(path.join(TAKES, "dallas.json"), JSON.stringify(marks, null, 2) + "\n");
  await browser.close();
  console.log(`take: recap/assets/takes/dallas.mp4, ${total} frames`);
}

/**
 * The real pages, as they are on the site today: element by element at three times their size,
 * with where their pictures are (the film runs the real loops over them). Read from the live
 * site (SITE_URL or deploy/.env) because only it has the real gifts, names and plaques; nothing
 * but the site's own host is fetched (no analytics), and a browser driven by a program is never
 * counted as a visit (`navigator.webdriver`).
 */
async function pages(): Promise<void> {
  const { default: puppeteer } = await import("puppeteer-core");
  const site = siteUrl();
  if (!site) throw new Error("pages: no site address (SITE_URL or deploy/.env)");
  const host = new URL(site).host;
  const out = path.join(TAKES, "pages");
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    headless: true,
    args: ["--hide-scrollbars", "--force-color-profile=srgb", "--lang=en-US"],
  });
  const open = async (pathname: string) => {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.protocol.startsWith("http") && u.host !== host) void r.abort();
      else void r.continue();
    });
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 3 });
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
      { name: "prefers-color-scheme", value: "light" },
    ]);
    await page.goto(site + pathname, { waitUntil: "networkidle0", timeout: 120_000 });
    await page.evaluate(`(async () => {
      for (const img of document.querySelectorAll("img")) img.loading = "eager";
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 900));
      window.scrollTo(0, 0);
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    })()`);
    await sleep(1500);
    return page;
  };
  // an element found by the text of a heading inside it (or the element itself), its pictures' boxes
  const grab = async (page: Awaited<ReturnType<typeof open>>, name: string, find: string): Promise<void> => {
    const info = (await page.evaluate(`(() => {
      const el = ${find};
      if (!el) return null;
      el.setAttribute("data-film-grab", ${JSON.stringify(name)});
      const r = el.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        pictures: [...el.querySelectorAll("img, video")].map((img) => {
          const b = img.getBoundingClientRect();
          return { src: img.getAttribute("src"), alt: img.getAttribute("alt"), x: b.left - r.left, y: b.top - r.top, width: b.width, height: b.height };
        }),
      };
    })()`)) as object | null;
    const el = await page.$(`[data-film-grab="${name}"]`);
    if (!info || !el) throw new Error(`pages: ${name} not found`);
    await el.screenshot({ path: path.join(out, `${name}.png`) as `${string}.png` });
    fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ scale: 3, ...info }, null, 2) + "\n");
    console.log(`pages: ${name}`);
  };
  // a city's card in the ranking: up from its name until the box is that tall
  const cardOf = (city: string, tall: number) => `(() => {
    const section = document.querySelector("#ranking").closest("section");
    let el = [...section.querySelectorAll("*")].find((n) => n.childElementCount === 0 && n.textContent.trim() === ${JSON.stringify(city)});
    while (el && el.getBoundingClientRect().height < ${tall}) el = el.parentElement;
    return el;
  })()`;
  const home = await open("/");
  await grab(home, "cities", `document.querySelector("#cities").closest("section")`);
  await grab(home, "hero-sign", `document.querySelector("header .sign")`);
  await grab(home, "ranking", `document.querySelector("#ranking").closest("section")`);
  await grab(home, "london", cardOf("London", 140));
  await grab(home, "dallas", cardOf("Dallas", 250));
  // the gold plaque of each city its benefactors brought, from its card
  for (const world of HISTORY.filter((h) => h.plaque).map((h) => h.world))
    await grab(
      home,
      `plaque-${world}`,
      `[...document.querySelector("#cities").closest("section").querySelectorAll("li")]
        .find((li) => li.querySelector('a[href*="/${world}/"]'))
        ?.querySelector('a[href*="hall-of-fame"]')`,
    );
  await home.close();
  const hall = await open("/hall-of-fame/");
  await grab(hall, "hall", `document.querySelector("main") ?? document.body`);
  // its "Fund a city" button, for the end card
  await grab(
    hall,
    "fund",
    `[...document.querySelectorAll("a, button")].find((n) => n.textContent.trim() === "Fund a city")`,
  );
  await hall.close();
  await browser.close();
}

/** When each stone of the opening lands (compositions/stones.html lays them at the same times). */
export const STONE_TIMES = [
  ...Array.from({ length: 7 }, (_, i) => 0.1 + i * 0.1), // the first gift's last seven
  ...Array.from({ length: 19 }, (_, k) => 1.5 + k * 0.19), // the second gift's, to the 29th
];
/** When each letter of the end card's wordmark lands, from its start. */
export const LETTER_TIMES = Array.from({ length: 10 }, (_, i) => 0.15 + i * 0.08);
/** When each city of the history comes on, from the history's start (compositions/history.html):
 *  New York two beats, the next six one, the six their benefactors brought two each. */
const BEAT = 0.625;
export const HISTORY_TIMES = HISTORY.reduce<number[]>(
  (at, _, i) => [...at, i === 0 ? 0 : at[i - 1] + (i === 1 || i > 7 ? 2 : 1) * BEAT],
  [],
);

/**
 * The film's runs of small sounds as one track each (the opening's stones, the history's cuts
 * and plaques, the end card's letters), so the film places one file each rather than forty.
 * Every sound is set to land a frame after its picture, by where its hit is in its file (the
 * soft click 0.07 s in, the pop 0.12 s). Not committed: made from assets/sfx/, like the effects.
 */
function sfx(): void {
  const SFX = path.join(DIR, "assets/sfx");
  const HIT: Record<string, number> = { "click-soft.mp3": 0.07, "pop.mp3": 0.12 };
  const track = (events: { at: number; file: string; volume: number }[], out: string, length: number) => {
    const delays = events.map((e) => Math.max(0, Math.round((e.at - HIT[e.file] + 1 / FPS) * 1000)));
    const inputs = events.flatMap((e) => ["-i", e.file]);
    const chains = events.map((e, i) => `[${i}:a]volume=${e.volume},adelay=${delays[i]}|${delays[i]}[t${i}]`);
    const mix = `${events.map((_, i) => `[t${i}]`).join("")}amix=inputs=${events.length}:normalize=0,apad=whole_dur=${length}[out]`;
    run(
      "ffmpeg",
      [
        "-v", "error", "-y", ...inputs, "-filter_complex", [...chains, mix].join(";"),
        "-map", "[out]", "-t", String(length), out,
      ], // prettier-ignore
      SFX,
    );
    console.log(`sfx: ${out}`);
  };
  const ticks = (times: number[]) =>
    times.map((at, i) => ({ at, file: "click-soft.mp3", volume: i % 2 ? 0.7 : 1 }));
  track(ticks(STONE_TIMES), "stones.wav", 5.6);
  track(ticks(LETTER_TIMES), "letters.wav", 1.6);
  track(
    [
      ...ticks(HISTORY_TIMES.slice(1)),
      ...HISTORY_TIMES.filter((_, i) => HISTORY[i].plaque).map((at) => ({
        at: at + 0.25,
        file: "pop.mp3",
        volume: 0.8,
      })),
    ],
    "history.wav",
    13,
  );
}

/**
 * Where each line of the narration is said, film seconds by line number (lines.json). The
 * same numbers place the lines' <audio> in index.html; line 9 is the first cut's and is not
 * said in this one.
 */
export const PLACES: Record<number, number> = {
  1: 0.3,
  2: 2.55,
  3: 5.62,
  4: 8.6,
  5: 11.55,
  6: 14.95,
  7: 18.25,
  13: 22.65,
  14: 27.75,
  8: 35.25,
  10: 39.6,
  11: 44.63,
  12: 47.6,
};

/** Lines broken by hand, where the rule below would split a phrase: after these word counts. */
const BREAKS: Record<number, number[]> = { 14: [6] };

/**
 * The subtitles (compositions/captions.html), from the narration's word times where PLACES puts
 * each line: groups of up to five words (six when the phrase ends one word later), broken at a
 * comma or a full stop, a lone last word kept with the group before it.
 */
function captions(): void {
  type Word = { text: string; at: number; until: number };
  const { lines } = JSON.parse(fs.readFileSync(path.join(VOICE, "lines.json"), "utf8")) as {
    lines: { line: number; words: Word[] }[];
  };
  const said = lines
    .filter((l) => PLACES[l.line] !== undefined)
    .sort((x, y) => PLACES[x.line] - PLACES[y.line]);
  const groups: {
    words: { text: string; start: number; end: number }[];
    last: boolean;
    start: number;
    end: number;
  }[] = [];
  for (const l of said) {
    const ws = l.words.map((w) => ({
      text: w.text,
      start: PLACES[l.line] + w.at,
      end: PLACES[l.line] + w.until,
    }));
    const parts: (typeof ws)[] = [];
    let cur: typeof ws = [];
    const hand = BREAKS[l.line];
    ws.forEach((w, k) => {
      cur.push(w);
      const next = ws[k + 1]?.text ?? "";
      const stop = /[.,]$/.test(w.text) && cur.length >= 2;
      const full = hand
        ? hand.includes(k + 1)
        : cur.length >= 5 && !(next && /[.,]$/.test(next) && cur.length < 6);
      if (stop || full) {
        parts.push(cur);
        cur = [];
      }
    });
    if (cur.length) parts.push(cur);
    if (parts.length > 1 && parts.at(-1)!.length === 1 && parts.at(-2)!.length <= 5)
      parts.at(-2)!.push(...parts.pop()!);
    parts.forEach((g, i) => groups.push({ words: g, last: i === parts.length - 1, start: 0, end: 0 }));
  }
  for (const g of groups) g.start = Math.max(g.words[0].start - 0.08, 0.1);
  groups.forEach((g, i) => {
    const next = groups[i + 1]?.start ?? Infinity;
    g.end = Math.min(g.words.at(-1)!.end + (g.last ? 0.5 : 0.3), next - 0.02);
  });
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const markup = groups
    .map((g, i) => {
      const spans = g.words
        .map((w, j) => `<span id="cap-${i + 1}-w${j + 1}">${esc(w.text)}</span>`)
        .join(" ");
      return `    <div id="cap-${i + 1}" class="cap"><span class="cap-plate">${spans}</span></div>`;
    })
    .join("\n");
  const calls = groups
    .map(
      (g, i) =>
        `      group("cap-${i + 1}", ${g.start.toFixed(3)}, ${g.end.toFixed(3)}, [${g.words.map((w) => w.start.toFixed(3)).join(", ")}]);`,
    )
    .join("\n");
  fs.writeFileSync(
    path.join(DIR, "compositions/captions.html"),
    CAPTIONS.replace("@GROUPS@", markup).replace("@JS@", calls),
  );
  for (const g of groups)
    console.log(
      `${g.start.toFixed(2).padStart(6)}-${g.end.toFixed(2).padStart(6)}  ${g.words.map((w) => w.text).join(" ")}`,
    );
}

const CAPTIONS = `<template>
  <style>
    #root {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }
    /* subtitles in the site's pixel letters (Tiny5, the wordmark's face) on its black enamel */
    .cap {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 92px;
      text-align: center;
      opacity: 0;
      visibility: hidden;
    }
    .cap-plate {
      display: inline-block;
      padding: 14px 30px 20px;
      background: #15171a;
      color: #f4f2ec;
      border-radius: 12px;
      font-family: "Tiny5", monospace;
      font-size: 54px;
      line-height: 1.1;
      letter-spacing: 0.02em;
      white-space: nowrap;
      box-shadow:
        inset 0 2px 0 rgb(255 255 255 / 0.08),
        0 0 0 2px rgb(0 0 0 / 0.6),
        0 26px 50px -22px rgb(0 0 0 / 0.65),
        0 4px 10px -2px rgb(0 0 0 / 0.3);
    }
  </style>
  <div id="root" data-composition-id="captions" data-width="1920" data-height="1080">
@GROUPS@
  </div>
  <script>
    (() => {
      const tl = gsap.timeline({ paused: true });
      // a group steps in (pixels do not ease), each word turns taxi yellow as it is said and
      // stays lit until the next one starts, and the group is cut when it is done
      const group = (id, start, end, words) => {
        tl.fromTo(
          "#" + id,
          { opacity: 0, visibility: "visible", y: 18 },
          { opacity: 1, y: 0, duration: 0.13, ease: "steps(3)" },
          start,
        );
        words.forEach((at, i) => {
          const w = "#" + id + "-w" + (i + 1);
          tl.set(w, { color: "#f7c21b" }, at);
          if (i + 1 < words.length) tl.set(w, { color: "#f4f2ec" }, words[i + 1]);
        });
        tl.set("#" + id, { opacity: 0, visibility: "hidden" }, end);
      };
@JS@
      window.__timelines["captions"] = tl;
    })();
  </script>
</template>
`;

function render(): void {
  const quality = process.argv[3] ?? "delivery";
  const address = siteAddress();
  const out = path.join(ROOT, "out/recap");
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, "tinyworlds-recap.mp4");
  run(
    "npx",
    [
      "hyperframes", "render", "--quality", quality, "--output", file,
      ...(address ? ["--variables", JSON.stringify({ address })] : []),
    ], // prettier-ignore
    DIR,
  );
  if (!address)
    console.warn("recap: no site address known (SITE_URL or deploy/.env): the end card says example.com");
  const web = path.join(out, "tinyworlds-recap-web.mp4");
  run(
    "ffmpeg",
    [
      "-v", "error", "-y", "-i", file,
      "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-profile:v", "high",
      "-af", "volume=-0.6dB", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", web,
    ], // prettier-ignore
    out,
  );
  console.log(`recap: ${path.relative(ROOT, file)}, ${path.relative(ROOT, web)}`);
}

const what = process.argv[2];
if (what === "voice") await voice();
else if (what === "take") await take();
else if (what === "pages") await pages();
else if (what === "sfx") sfx();
else if (what === "plates") await plates();
else if (what === "captions") captions();
else if (what === "render") render();
else {
  console.error(
    "usage: npm run recap -- voice | take | pages | plates | sfx | captions | render [draft|looks|delivery]",
  );
  process.exit(2);
}
